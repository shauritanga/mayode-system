import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { FarmInputType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OwnershipService, RequestUser } from '../common/ownership.service';
import { InputStockService } from '../input-stock/input-stock.service';
import { tenantOf } from './common';

/** The broad group each default type belongs to; any type a cooperative adds itself counts as OTHER. */
const DEFAULTS: [string, FarmInputType][] = [
  ['Seed', 'SEED'], ['Fertiliser', 'FERTILIZER'], ['Pesticide', 'PESTICIDE'], ['Herbicide', 'HERBICIDE'], ['Fuel', 'FUEL'], ['Packaging bags', 'OTHER'], ['Other', 'OTHER'],
];
const broadGroup = (name: string): FarmInputType => DEFAULTS.find(([n]) => n.toLowerCase() === name.trim().toLowerCase())?.[1] ?? 'OTHER';
const r3 = (n: number) => Math.round(n * 1000) / 1000;
/** Fuel and packaging bags are stock too, but never something a farmer is given on credit. */
const classFor = (name: string): 'INPUT' | 'FUEL' | 'PACKAGING' => (/fuel|diesel|petrol/i.test(name) ? 'FUEL' : /bag|packag/i.test(name) ? 'PACKAGING' : 'INPUT');

export interface ItemInput { name: string; inputTypeId: string; unit?: string; unitCost?: number | null; reorderLevel?: number | null; packagingKg?: number | null; isActive?: boolean }

/**
 * What a cooperative gives its farmers: the kinds of input (Seed, Fertiliser, Herbicide … and any it adds), the inputs under each
 * with their unit and price, and the stock that comes in. Everything the Input Distribution page offers comes from here.
 */
@Injectable()
export class InputSetupService {
  constructor(private readonly prisma: PrismaService, private readonly ownership: OwnershipService, private readonly stock: InputStockService) {}

  /** A cooperative starts with the usual kinds; its older inputs are filed under the matching one. */
  private async ensureDefaults(mamcosId: string) {
    if (await this.prisma.inputType.count({ where: { mamcosId } })) {
      // cooperatives that started before bags were offered get the type added once
      if (!(await this.prisma.inputType.count({ where: { mamcosId, name: { contains: 'bag', mode: 'insensitive' } } }))) await this.prisma.inputType.create({ data: { mamcosId, name: 'Packaging bags' } }).catch(() => undefined);
      return;
    }
    await this.prisma.inputType.createMany({ data: DEFAULTS.map(([name]) => ({ mamcosId, name })), skipDuplicates: true });
    const types = await this.prisma.inputType.findMany({ where: { mamcosId } });
    for (const [name, group] of DEFAULTS) {
      const t = types.find((x) => x.name === name);
      if (t) await this.prisma.farmInputItem.updateMany({ where: { mamcosId, type: group, inputTypeId: null }, data: { inputTypeId: t.id } });
    }
  }

  async types(actor: RequestUser, mamcosIdParam?: string) {
    const mamcosId = tenantOf(this.ownership, actor, mamcosIdParam);
    await this.ensureDefaults(mamcosId);
    const rows = await this.prisma.inputType.findMany({ where: { mamcosId }, orderBy: { name: 'asc' }, include: { _count: { select: { items: true } } } });
    return { data: rows.map((t) => ({ id: t.id, name: t.name, isActive: t.isActive, inputs: t._count.items })) };
  }

  async createType(actor: RequestUser, name: string, mamcosIdParam?: string) {
    const mamcosId = tenantOf(this.ownership, actor, mamcosIdParam);
    await this.ensureDefaults(mamcosId);
    const clean = name?.trim();
    if (!clean) throw new BadRequestException('Enter the name of the input type');
    if (await this.prisma.inputType.findFirst({ where: { mamcosId, name: { equals: clean, mode: 'insensitive' } } })) throw new ConflictException('This input type already exists');
    return this.prisma.inputType.create({ data: { mamcosId, name: clean } });
  }

  async updateType(actor: RequestUser, id: string, dto: { name?: string; isActive?: boolean }, mamcosIdParam?: string) {
    const mamcosId = tenantOf(this.ownership, actor, mamcosIdParam);
    const t = await this.prisma.inputType.findFirst({ where: { id, mamcosId } });
    if (!t) throw new NotFoundException('Input type not found');
    const name = dto.name?.trim();
    if (name && name.toLowerCase() !== t.name.toLowerCase() && await this.prisma.inputType.findFirst({ where: { mamcosId, id: { not: id }, name: { equals: name, mode: 'insensitive' } } })) throw new ConflictException('This input type already exists');
    const updated = await this.prisma.inputType.update({ where: { id }, data: { ...(name ? { name } : {}), ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}) } });
    if (name) await this.prisma.farmInputItem.updateMany({ where: { inputTypeId: id }, data: { type: broadGroup(name) } });
    return updated;
  }

  /** The inputs of the cooperative, with stock left and the type each is filed under. */
  async items(actor: RequestUser, mamcosIdParam?: string) {
    const mamcosId = tenantOf(this.ownership, actor, mamcosIdParam);
    await this.ensureDefaults(mamcosId);
    const items = await this.prisma.farmInputItem.findMany({ where: { mamcosId }, include: { inputType: { select: { id: true, name: true } } }, orderBy: [{ isActive: 'desc' }, { name: 'asc' }] });
    const sums = await this.prisma.farmInputMovement.groupBy({ by: ['itemId'], where: { itemId: { in: items.map((i) => i.id) } }, _sum: { quantity: true } });
    return {
      data: items.map((i) => {
        const balance = r3(sums.find((s) => s.itemId === i.id)?._sum.quantity ?? 0);
        return { id: i.id, name: i.name, inputTypeId: i.inputTypeId, typeName: i.inputType?.name ?? null, unit: i.unit, unitCost: i.unitCost, reorderLevel: i.reorderLevel, isActive: i.isActive, stockClass: i.stockClass, packagingKg: i.packagingKg, balance, low: i.reorderLevel != null && balance <= i.reorderLevel };
      }),
    };
  }

  private async typeFor(mamcosId: string, inputTypeId: string) {
    const t = await this.prisma.inputType.findFirst({ where: { id: inputTypeId, mamcosId } });
    if (!t) throw new BadRequestException('Choose an input type from your list');
    if (!t.isActive) throw new BadRequestException(`“${t.name}” is switched off`);
    return t;
  }

  async createItem(actor: RequestUser, dto: ItemInput, mamcosIdParam?: string) {
    const mamcosId = tenantOf(this.ownership, actor, mamcosIdParam);
    const name = dto.name?.trim();
    if (!name) throw new BadRequestException('Enter the name of the input');
    const type = await this.typeFor(mamcosId, dto.inputTypeId);
    try {
      return await this.prisma.farmInputItem.create({ data: { mamcosId, name, type: broadGroup(type.name), stockClass: classFor(type.name), inputTypeId: type.id, unit: dto.unit?.trim() || 'kg', unitCost: dto.unitCost ?? null, reorderLevel: dto.reorderLevel ?? null, packagingKg: dto.packagingKg ?? null } });
    } catch (e) {
      if ((e as { code?: string }).code === 'P2002') throw new ConflictException('An input with this name already exists');
      throw e;
    }
  }

  async updateItem(actor: RequestUser, id: string, dto: Partial<ItemInput>, mamcosIdParam?: string) {
    const mamcosId = tenantOf(this.ownership, actor, mamcosIdParam);
    const item = await this.prisma.farmInputItem.findFirst({ where: { id, mamcosId } });
    if (!item) throw new NotFoundException('Input not found');
    const type = dto.inputTypeId && dto.inputTypeId !== item.inputTypeId ? await this.typeFor(mamcosId, dto.inputTypeId) : null;
    try {
      return await this.prisma.farmInputItem.update({
        where: { id },
        data: {
          ...(dto.name?.trim() ? { name: dto.name.trim() } : {}), ...(type ? { inputTypeId: type.id, type: broadGroup(type.name), stockClass: classFor(type.name) } : {}),
          ...(dto.unit?.trim() ? { unit: dto.unit.trim() } : {}), ...(dto.unitCost !== undefined ? { unitCost: dto.unitCost } : {}),
          ...(dto.reorderLevel !== undefined ? { reorderLevel: dto.reorderLevel } : {}), ...(dto.packagingKg !== undefined ? { packagingKg: dto.packagingKg } : {}), ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        },
      });
    } catch (e) {
      if ((e as { code?: string }).code === 'P2002') throw new ConflictException('An input with this name already exists');
      throw e;
    }
  }

  /** Stock arriving: the balance goes up, and the movement is kept. */
  async addStock(actor: RequestUser, id: string, dto: { quantity: number; note?: string }, mamcosIdParam?: string) {
    const mamcosId = tenantOf(this.ownership, actor, mamcosIdParam);
    const item = await this.prisma.farmInputItem.findFirst({ where: { id, mamcosId } });
    if (!item) throw new NotFoundException('Input not found');
    if (!(dto.quantity > 0)) throw new BadRequestException('Enter a quantity greater than zero');
    // stock arrives through the warehouse now; this older entry point files it as a direct receipt in the default store
    return this.prisma.$transaction((tx) => this.stock.receiveWithin(tx, { itemId: id, quantity: dto.quantity, userId: actor.id, refType: 'DIRECT', note: dto.note?.trim() || 'Stock received' }));
  }
}
