import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Actor, assertVisible, owner, OpsNotifyService, scope, Tx } from './ops-common';
import { r3 } from './ops-rules';
import { AdjustInputDto, StockInDto, UpsertInputItemDto } from './dto/farm.dto';
import { InputStockService } from '../input-stock/input-stock.service';

type User = Actor & { id: string };

@Injectable()
export class FarmInputsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notify: OpsNotifyService,
    private readonly stock: InputStockService,
  ) {}

  async items(actor: Actor) {
    const items = await this.prisma.farmInputItem.findMany({ where: scope(actor), orderBy: [{ type: 'asc' }, { name: 'asc' }] });
    const sums = await this.prisma.farmInputMovement.groupBy({ by: ['itemId'], where: { itemId: { in: items.map((i) => i.id) } }, _sum: { quantity: true } });
    return items.map((i) => {
      const balance = r3(sums.find((s) => s.itemId === i.id)?._sum.quantity ?? 0);
      return { ...i, balance, low: i.reorderLevel != null && balance <= i.reorderLevel };
    });
  }

  async create(dto: UpsertInputItemDto, actor: User) {
    try {
      return await this.prisma.farmInputItem.create({ data: { name: dto.name.trim(), type: dto.type, unit: dto.unit?.trim() || 'kg', unitCost: dto.unitCost ?? null, reorderLevel: dto.reorderLevel ?? null, mamcosId: owner(actor) } });
    } catch (e) {
      if ((e as { code?: string }).code === 'P2002') throw new ConflictException('An input with this name already exists');
      throw e;
    }
  }

  async update(id: string, dto: UpsertInputItemDto, actor: User) {
    const i = await this.prisma.farmInputItem.findUnique({ where: { id } });
    assertVisible(actor, i, 'Input');
    return this.prisma.farmInputItem.update({ where: { id }, data: { name: dto.name.trim(), type: dto.type, unit: dto.unit?.trim() || i.unit, unitCost: dto.unitCost ?? null, reorderLevel: dto.reorderLevel ?? null, ...(dto.isActive === undefined ? {} : { isActive: dto.isActive }) } });
  }

  /** Older entry point: stock now arrives through the warehouse (InputStockService); this keeps working and files it as a direct receipt. */
  async stockIn(id: string, dto: StockInDto, actor: User) {
    const i = await this.prisma.farmInputItem.findUnique({ where: { id } });
    assertVisible(actor, i, 'Input');
    return this.prisma.$transaction((tx) => this.stock.receiveWithin(tx, { itemId: id, quantity: dto.quantity, userId: actor.id, refType: 'DIRECT', note: dto.note ?? null }));
  }

  /** Manual correction. A reason is required and a negative cannot take the balance below zero. */
  async adjust(id: string, dto: AdjustInputDto, actor: User) {
    if (!dto.reason.trim()) throw new BadRequestException('Give the reason for the adjustment');
    if (dto.quantity === 0) throw new BadRequestException('The quantity cannot be zero');
    return this.prisma.$transaction(async (tx) => {
      const i = await tx.farmInputItem.findUnique({ where: { id } });
      assertVisible(actor, i, 'Input');
      await tx.$queryRaw`SELECT id FROM farm_input_items WHERE id = ${id} FOR UPDATE`;
      const bal = await this.balanceOf(tx, id);
      if (dto.quantity < 0 && -dto.quantity > bal + 0.0005) throw new ConflictException(`Only ${bal} ${i.unit} is in stock`);
      const warehouseId = i.mamcosId ? await this.stock.defaultWarehouse(tx, i.mamcosId) : null;
      return tx.farmInputMovement.create({ data: { itemId: id, type: 'ADJUSTMENT', quantity: dto.quantity, warehouseId, refType: 'ADJUSTMENT', reason: 'OTHER', note: dto.reason.trim(), createdByUserId: actor.id } });
    });
  }

  async balanceOf(tx: Tx | PrismaService, itemId: string) {
    const s = await tx.farmInputMovement.aggregate({ where: { itemId }, _sum: { quantity: true } });
    return r3(s._sum.quantity ?? 0);
  }

  /**
   * Uses stock for approved farm work. The item row is locked first, so two approvals cannot spend the same stock,
   * and a use is also written as a crop cost so production-cost reports include it.
   */
  async consume(tx: Tx, p: { itemId: string; quantity: number; taskId: string; farmId: string; plotId: string | null; cropCycleId: string | null; employeeUserId: string; byUserId: string }) {
    // the stock leaves the warehouse under a lock (the default store first, then any other that holds it)
    const { item, left } = await this.stock.drawOut(tx, { itemId: p.itemId, quantity: p.quantity, userId: p.byUserId, refType: 'FIELD_WORK', refId: p.taskId, taskId: p.taskId, farmId: p.farmId, plotId: p.plotId, cropCycleId: p.cropCycleId, employeeUserId: p.employeeUserId,
      shortMessage: (bal, it) => `Not enough ${it.name} in stock (${bal} ${it.unit} left, ${p.quantity} used). Record the delivery or correct the stock before approving.` });
    if (p.cropCycleId && item.unitCost != null) {
      const category = ({ SEED: 'SEEDS', FERTILIZER: 'FERTILIZER', PESTICIDE: 'PESTICIDE', HERBICIDE: 'HERBICIDE', FUEL: 'MISCELLANEOUS', OTHER: 'MISCELLANEOUS' } as const)[item.type];
      await tx.inputCost.create({ data: { cropCycleId: p.cropCycleId, category, itemName: item.name, quantity: p.quantity, unit: item.unit, unitPrice: item.unitCost, totalCost: Math.round(p.quantity * item.unitCost * 100) / 100, dateIncurred: new Date() } });
    }
    return { item, left };
  }

  async movements(actor: Actor, f: { itemId?: string; plotId?: string; cropCycleId?: string } = {}) {
    return this.prisma.farmInputMovement.findMany({
      where: { item: { ...scope(actor) }, ...(f.itemId ? { itemId: f.itemId } : {}), ...(f.plotId ? { plotId: f.plotId } : {}), ...(f.cropCycleId ? { cropCycleId: f.cropCycleId } : {}) },
      include: { item: { select: { name: true, type: true, unit: true } }, task: { select: { reference: true, title: true } } },
      orderBy: { createdAt: 'desc' },
      take: 300,
    });
  }

  async lowStockAlert(mamcosId: string | null, name: string, left: number, unit: string, reorder: number | null) {
    if (reorder != null && left <= reorder) {
      await this.notify.tellPermission('ops_farm_inputs', 'VIEW', mamcosId, { type: 'OPS_INPUT_LOW', title: 'Farm input running low', body: `${name}: ${left} ${unit} left.` });
    }
  }
}
