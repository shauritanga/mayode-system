import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Actor, assertVisible, owner, OpsNotifyService, scope, Tx } from './ops-common';
import { r3 } from './ops-rules';
import { AdjustInputDto, StockInDto, UpsertInputItemDto } from './dto/farm.dto';

type User = Actor & { id: string };

@Injectable()
export class FarmInputsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notify: OpsNotifyService,
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

  async stockIn(id: string, dto: StockInDto, actor: User) {
    const i = await this.prisma.farmInputItem.findUnique({ where: { id } });
    assertVisible(actor, i, 'Input');
    return this.prisma.farmInputMovement.create({ data: { itemId: id, type: 'IN', quantity: dto.quantity, note: dto.note, createdByUserId: actor.id } });
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
      return tx.farmInputMovement.create({ data: { itemId: id, type: 'ADJUSTMENT', quantity: dto.quantity, note: dto.reason.trim(), createdByUserId: actor.id } });
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
    await tx.$queryRaw`SELECT id FROM farm_input_items WHERE id = ${p.itemId} FOR UPDATE`;
    const item = await tx.farmInputItem.findUnique({ where: { id: p.itemId } });
    if (!item) throw new BadRequestException('A chosen input no longer exists');
    const bal = await this.balanceOf(tx, p.itemId);
    if (p.quantity > bal + 0.0005) throw new ConflictException(`Not enough ${item.name} in stock (${bal} ${item.unit} left, ${p.quantity} used). Record the delivery or correct the stock before approving.`);
    await tx.farmInputMovement.create({ data: { itemId: p.itemId, type: 'OUT', quantity: -p.quantity, taskId: p.taskId, farmId: p.farmId, plotId: p.plotId, cropCycleId: p.cropCycleId, employeeUserId: p.employeeUserId, createdByUserId: p.byUserId } });
    if (p.cropCycleId && item.unitCost != null) {
      const category = ({ SEED: 'SEEDS', FERTILIZER: 'FERTILIZER', PESTICIDE: 'PESTICIDE', HERBICIDE: 'HERBICIDE', FUEL: 'MISCELLANEOUS', OTHER: 'MISCELLANEOUS' } as const)[item.type];
      await tx.inputCost.create({ data: { cropCycleId: p.cropCycleId, category, itemName: item.name, quantity: p.quantity, unit: item.unit, unitPrice: item.unitCost, totalCost: Math.round(p.quantity * item.unitCost * 100) / 100, dateIncurred: new Date() } });
    }
    return { item, left: r3(bal - p.quantity) };
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
