import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InputMovementType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OwnershipService, RequestUser } from '../common/ownership.service';
import { tenantOf } from '../staff-tasks/common';

type Db = Prisma.TransactionClient | PrismaService;
const r3 = (n: number) => Math.round(n * 1000) / 1000;
const EPS = 0.0005;

export const ADJUST_REASONS = ['USED', 'DAMAGED', 'EXPIRED', 'LOST', 'FOUND', 'COUNT_CORRECTION', 'OTHER'] as const;
export type AdjustReason = (typeof ADJUST_REASONS)[number];
export const RECEIVE_SOURCES = ['PURCHASE', 'DIRECT', 'DONATION', 'OPENING'] as const;

export interface DrawParams {
  itemId: string; quantity: number; userId: string; refType: string; refId?: string | null; note?: string;
  /** Take from this warehouse first. */
  warehouseId?: string | null;
  /** With `strict`, the warehouse must hold it all; otherwise the rest comes from the other warehouses. */
  strict?: boolean;
  taskId?: string | null; farmId?: string | null; plotId?: string | null; cropCycleId?: string | null; employeeUserId?: string | null;
  /** Wording of the "not enough" message, given what is left. */
  shortMessage?: (left: number, item: { name: string; unit: string }) => string;
}

/**
 * Stock of farm inputs, fuel and packaging bags, kept per warehouse. Every way stock comes in or goes out passes through here, so
 * every movement has a warehouse, a reason and a reference, and the balance of a warehouse is always the sum of its movements.
 */
@Injectable()
export class InputStockService {
  constructor(private readonly prisma: PrismaService, private readonly ownership: OwnershipService) {}

  /** The store used when nobody names one: the cooperative's default warehouse, created ("Main store") if it has none yet. */
  async defaultWarehouse(db: Db, mamcosId: string): Promise<string> {
    const flagged = await db.warehouse.findFirst({ where: { mamcosId, isActive: true, isDefaultForInputs: true }, select: { id: true } });
    if (flagged) return flagged.id;
    const oldest = await db.warehouse.findFirst({ where: { mamcosId, isActive: true }, orderBy: { createdAt: 'asc' }, select: { id: true } });
    const id = oldest?.id ?? (await db.warehouse.create({ data: { mamcosId, name: 'Main store', isDefaultForInputs: true }, select: { id: true } })).id;
    await db.warehouse.update({ where: { id }, data: { isDefaultForInputs: true } });
    return id;
  }

  private async ownWarehouse(db: Db, mamcosId: string, warehouseId: string) {
    const w = await db.warehouse.findFirst({ where: { id: warehouseId, mamcosId } });
    if (!w) throw new BadRequestException('Choose one of your own warehouses');
    if (!w.isActive) throw new BadRequestException(`${w.name} is switched off`);
    return w;
  }

  /** What each warehouse holds of one item (rows with no warehouse count as the default store). */
  private async perWarehouse(db: Db, itemId: string, mamcosId: string | null) {
    const rows = await db.farmInputMovement.groupBy({ by: ['warehouseId'], where: { itemId }, _sum: { quantity: true } });
    const fallback = mamcosId ? await this.defaultWarehouse(db, mamcosId) : null;
    const out = new Map<string | null, number>();
    for (const r of rows) {
      const key = r.warehouseId ?? fallback;
      out.set(key, r3((out.get(key) ?? 0) + (r._sum.quantity ?? 0)));
    }
    return out;
  }

  /** What one warehouse holds of one item right now. */
  async availableIn(itemId: string, mamcosId: string, warehouseId: string): Promise<number> {
    return (await this.perWarehouse(this.prisma, itemId, mamcosId)).get(warehouseId) ?? 0;
  }

  /** Filter for one warehouse's rows; rows with no warehouse belong to the default store. */
  private async whWhere(db: Db, mamcosId: string | null, warehouseId: string): Promise<Prisma.FarmInputMovementWhereInput> {
    const fallback = mamcosId ? await this.defaultWarehouse(db, mamcosId) : null;
    return warehouseId === fallback ? { OR: [{ warehouseId }, { warehouseId: null }] } : { warehouseId };
  }

  /**
   * Takes stock out of the batches of one warehouse, the ones that expire first going first (then the oldest).
   * Returns which batch each part came from, so every movement names its batch.
   */
  private async takeFromBatches(tx: Db, item: { id: string; mamcosId: string | null }, warehouseId: string, quantity: number) {
    const groups = await tx.farmInputMovement.groupBy({
      by: ['batchNo', 'expiresOn'], where: { itemId: item.id, ...(await this.whWhere(tx, item.mamcosId, warehouseId)) }, _sum: { quantity: true }, _min: { createdAt: true },
    });
    const ranked = groups.filter((g) => (g._sum.quantity ?? 0) > EPS).sort((a, b) => {
      if (a.expiresOn && b.expiresOn) return a.expiresOn.getTime() - b.expiresOn.getTime();
      if (a.expiresOn) return -1;
      if (b.expiresOn) return 1;
      return (a._min.createdAt?.getTime() ?? 0) - (b._min.createdAt?.getTime() ?? 0);
    });
    const parts: { batchNo: string | null; expiresOn: Date | null; quantity: number }[] = [];
    let left = quantity;
    for (const g of ranked) {
      if (left <= EPS) break;
      const take = r3(Math.min(left, g._sum.quantity ?? 0));
      parts.push({ batchNo: g.batchNo, expiresOn: g.expiresOn, quantity: take });
      left = r3(left - take);
    }
    if (left > EPS) parts.push({ batchNo: null, expiresOn: null, quantity: left });
    return parts;
  }

  /** "Batch 1", "Batch 2"… numbered per item across the cooperative. */
  private async nextBatchNo(tx: Db, itemId: string) {
    const rows = await tx.farmInputMovement.groupBy({ by: ['batchNo'], where: { itemId, batchNo: { not: null } } });
    return `Batch ${rows.length + 1}`;
  }

  private async lockItem(tx: Db, itemId: string) {
    await tx.$queryRaw`SELECT id FROM farm_input_items WHERE id = ${itemId} FOR UPDATE`;
    const item = await tx.farmInputItem.findUnique({ where: { id: itemId } });
    if (!item) throw new BadRequestException('A chosen input no longer exists');
    return item;
  }

  /** Stock arrives. Runs inside the caller's transaction. */
  async receiveWithin(tx: Db, p: { itemId: string; quantity: number; userId: string; refType: string; refId?: string | null; warehouseId?: string | null; supplierName?: string | null; unitCost?: number | null; note?: string | null; batchNo?: string | null; expiresOn?: Date | null }) {
    const item = await this.lockItem(tx, p.itemId);
    const batchNo = p.batchNo?.trim() || (await this.nextBatchNo(tx, item.id));
    const warehouseId = p.warehouseId ?? (item.mamcosId ? await this.defaultWarehouse(tx, item.mamcosId) : null);
    return tx.farmInputMovement.create({
      data: { itemId: item.id, type: 'IN', quantity: p.quantity, warehouseId, refType: p.refType, refId: p.refId ?? null, supplierName: p.supplierName?.trim() || null, unitCost: p.unitCost ?? null, note: p.note ?? null, createdByUserId: p.userId, batchNo, expiresOn: p.expiresOn ?? null },
    });
  }

  /** Stock leaves. Checks the balance under a lock, so two people cannot spend the same stock. */
  async drawOut(tx: Db, p: DrawParams) {
    const item = await this.lockItem(tx, p.itemId);
    const per = await this.perWarehouse(tx, item.id, item.mamcosId);
    const total = r3([...per.values()].reduce((n, v) => n + v, 0));
    const preferred = p.warehouseId ?? (item.mamcosId ? await this.defaultWarehouse(tx, item.mamcosId) : null);
    if (p.strict && p.warehouseId) {
      const here = per.get(p.warehouseId) ?? 0;
      if (p.quantity > here + EPS) {
        const w = await tx.warehouse.findUnique({ where: { id: p.warehouseId }, select: { name: true } });
        throw new ConflictException(`Only ${here} ${item.unit} of ${item.name} is in ${w?.name ?? 'that warehouse'}`);
      }
    } else if (p.quantity > total + EPS) {
      throw new ConflictException(p.shortMessage ? p.shortMessage(total, item) : `Not enough ${item.name} in stock (${total} ${item.unit} left, ${p.quantity} needed)`);
    }
    // the chosen warehouse first, then whichever holds the most
    const order = [...per.entries()].filter(([, v]) => v > EPS).sort((a, b) => (a[0] === preferred ? -1 : b[0] === preferred ? 1 : b[1] - a[1]));
    let left = p.quantity;
    for (const [warehouseId, have] of order) {
      if (left <= EPS) break;
      if (p.strict && p.warehouseId && warehouseId !== p.warehouseId) continue;
      const take = r3(Math.min(left, have));
      for (const part of await this.takeFromBatches(tx, item, warehouseId as string, take)) {
        await tx.farmInputMovement.create({
          data: {
            itemId: item.id, type: 'OUT', quantity: -part.quantity, warehouseId, refType: p.refType, refId: p.refId ?? null, note: p.note ?? null, batchNo: part.batchNo, expiresOn: part.expiresOn,
            taskId: p.taskId ?? null, farmId: p.farmId ?? null, plotId: p.plotId ?? null, cropCycleId: p.cropCycleId ?? null, employeeUserId: p.employeeUserId ?? null, createdByUserId: p.userId,
          },
        });
      }
      left = r3(left - take);
    }
    return { item, left: r3(total - p.quantity) };
  }

  // ───────────── what people do in the warehouse ─────────────

  async receive(actor: RequestUser, dto: { itemId: string; warehouseId?: string; quantity: number; source: string; supplierName?: string; reference?: string; unitCost?: number | null; note?: string; batchNo?: string; expiresOn?: string }, mamcosIdParam?: string) {
    const mamcosId = tenantOf(this.ownership, actor, mamcosIdParam);
    const expiresOn = dto.expiresOn ? new Date(`${dto.expiresOn.slice(0, 10)}T00:00:00.000Z`) : null;
    if (expiresOn && expiresOn.getTime() < Date.now() - 86_400_000) throw new BadRequestException('This stock has already expired, so it cannot be received');
    if (!(dto.quantity > 0)) throw new BadRequestException('Enter a quantity greater than zero');
    if (!(RECEIVE_SOURCES as readonly string[]).includes(dto.source)) throw new BadRequestException('Say where the stock came from');
    if ((dto.source === 'PURCHASE' || dto.source === 'DIRECT') && !dto.supplierName?.trim() && !dto.reference?.trim()) throw new BadRequestException('Say who it came from, or give the delivery reference');
    return this.prisma.$transaction(async (tx) => {
      const item = await tx.farmInputItem.findFirst({ where: { id: dto.itemId, mamcosId } });
      if (!item) throw new NotFoundException('Input not found');
      if (!item.isActive) throw new BadRequestException(`${item.name} is switched off`);
      const warehouseId = dto.warehouseId ? (await this.ownWarehouse(tx, mamcosId, dto.warehouseId)).id : await this.defaultWarehouse(tx, mamcosId);
      const note = [dto.reference?.trim() ? `Ref ${dto.reference.trim()}` : '', dto.note?.trim() ?? ''].filter(Boolean).join(' · ') || null;
      return this.receiveWithin(tx, { itemId: item.id, quantity: dto.quantity, userId: actor.id, refType: dto.source, warehouseId, supplierName: dto.supplierName, unitCost: dto.unitCost ?? null, note, batchNo: dto.batchNo, expiresOn });
    });
  }

  /** A correction with a reason: damaged, expired or lost stock goes down; found stock goes up. */
  async adjust(actor: RequestUser, dto: { itemId: string; warehouseId: string; quantity: number; reason: string; note?: string; batchNo?: string; expiresOn?: string }, mamcosIdParam?: string) {
    const mamcosId = tenantOf(this.ownership, actor, mamcosIdParam);
    if (!(ADJUST_REASONS as readonly string[]).includes(dto.reason)) throw new BadRequestException('Choose a reason');
    if (!dto.quantity || !Number.isFinite(dto.quantity)) throw new BadRequestException('The quantity cannot be zero');
    const reason = dto.reason as AdjustReason;
    if (['USED', 'DAMAGED', 'EXPIRED', 'LOST'].includes(reason) && dto.quantity > 0) throw new BadRequestException('Used, damaged, expired or lost stock is taken off, so the quantity must be negative');
    if (reason === 'USED' && !dto.note?.trim()) throw new BadRequestException('Say what it was used for in the note');
    if (reason === 'FOUND' && dto.quantity < 0) throw new BadRequestException('Stock that was found is added, so the quantity must be positive');
    if (reason === 'OTHER' && !dto.note?.trim()) throw new BadRequestException('Explain the reason in the note');
    return this.prisma.$transaction(async (tx) => {
      await this.ownWarehouse(tx, mamcosId, dto.warehouseId);
      const item = await this.lockItem(tx, dto.itemId);
      if (item.mamcosId !== mamcosId) throw new NotFoundException('Input not found');
      if (dto.quantity < 0) {
        const here = (await this.perWarehouse(tx, item.id, mamcosId)).get(dto.warehouseId) ?? 0;
        if (-dto.quantity > here + EPS) throw new ConflictException(`Only ${here} ${item.unit} of ${item.name} is in that warehouse`);
      }
      const type: InputMovementType = reason === 'USED' ? 'OUT' : dto.quantity < 0 && ['DAMAGED', 'EXPIRED', 'LOST'].includes(reason) ? 'WRITE_OFF' : 'ADJUSTMENT';
      const base = { itemId: item.id, type, warehouseId: dto.warehouseId, refType: 'ADJUSTMENT', reason, note: dto.note?.trim() || null, createdByUserId: actor.id };
      if (dto.quantity > 0) {
        const expiresOn = dto.expiresOn ? new Date(`${dto.expiresOn.slice(0, 10)}T00:00:00.000Z`) : null;
        return tx.farmInputMovement.create({ data: { ...base, quantity: dto.quantity, batchNo: dto.batchNo?.trim() || null, expiresOn } });
      }
      let last: Awaited<ReturnType<typeof tx.farmInputMovement.create>> | null = null;
      for (const part of await this.takeFromBatches(tx, item, dto.warehouseId, -dto.quantity)) {
        last = await tx.farmInputMovement.create({ data: { ...base, quantity: -part.quantity, batchNo: part.batchNo, expiresOn: part.expiresOn } });
      }
      return last;
    });
  }

  /** Moves stock between two warehouses: one movement out, one in, tied together. */
  async transfer(actor: RequestUser, dto: { itemId: string; fromWarehouseId: string; toWarehouseId: string; quantity: number; note?: string }, mamcosIdParam?: string) {
    const mamcosId = tenantOf(this.ownership, actor, mamcosIdParam);
    if (!(dto.quantity > 0)) throw new BadRequestException('Enter a quantity greater than zero');
    if (dto.fromWarehouseId === dto.toWarehouseId) throw new BadRequestException('Choose two different warehouses');
    return this.prisma.$transaction(async (tx) => {
      await this.ownWarehouse(tx, mamcosId, dto.fromWarehouseId);
      await this.ownWarehouse(tx, mamcosId, dto.toWarehouseId);
      const item = await this.lockItem(tx, dto.itemId);
      if (item.mamcosId !== mamcosId) throw new NotFoundException('Input not found');
      const here = (await this.perWarehouse(tx, item.id, mamcosId)).get(dto.fromWarehouseId) ?? 0;
      if (dto.quantity > here + EPS) throw new ConflictException(`Only ${here} ${item.unit} of ${item.name} is in that warehouse`);
      const groupId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      const base = { itemId: item.id, refType: 'TRANSFER', groupId, note: dto.note?.trim() || null, createdByUserId: actor.id };
      // each batch keeps its number and expiry date in the new warehouse
      type Move = Awaited<ReturnType<typeof tx.farmInputMovement.create>>;
      let out: Move | null = null;
      let inn: Move | null = null;
      for (const part of await this.takeFromBatches(tx, item, dto.fromWarehouseId, dto.quantity)) {
        const batch = { batchNo: part.batchNo, expiresOn: part.expiresOn };
        out = await tx.farmInputMovement.create({ data: { ...base, ...batch, type: 'TRANSFER_OUT', quantity: -part.quantity, warehouseId: dto.fromWarehouseId } });
        inn = await tx.farmInputMovement.create({ data: { ...base, ...batch, type: 'TRANSFER_IN', quantity: part.quantity, warehouseId: dto.toWarehouseId } });
      }
      return { groupId, out: out!, in: inn! };
    });
  }

  /** Cancels a movement by writing its opposite; the original stays in the history. */
  async reverse(actor: RequestUser, movementId: string, reason: string, mamcosIdParam?: string) {
    const mamcosId = tenantOf(this.ownership, actor, mamcosIdParam);
    const why = reason?.trim();
    if (!why || why.length < 5) throw new BadRequestException('Say why this is being reversed (at least a few words)');
    return this.prisma.$transaction(async (tx) => {
      const m = await tx.farmInputMovement.findFirst({ where: { id: movementId, item: { mamcosId } }, include: { item: true } });
      if (!m) throw new NotFoundException('Movement not found');
      if (m.refType === 'REVERSAL') throw new BadRequestException('A reversal cannot be reversed');
      if (m.type === 'TRANSFER_OUT' || m.type === 'TRANSFER_IN') throw new BadRequestException('A transfer is undone by transferring back');
      await this.lockItem(tx, m.itemId);
      if (await tx.farmInputMovement.findUnique({ where: { reversalOfId: m.id } })) throw new ConflictException('This movement was already reversed');
      const warehouseId = m.warehouseId ?? (await this.defaultWarehouse(tx, mamcosId));
      if (m.quantity > 0) {
        const here = (await this.perWarehouse(tx, m.itemId, mamcosId)).get(warehouseId) ?? 0;
        if (m.quantity > here + EPS) throw new ConflictException(`Only ${here} ${m.item.unit} is left there; some of it has already been used`);
      }
      return tx.farmInputMovement.create({
        data: { itemId: m.itemId, type: 'ADJUSTMENT', quantity: -m.quantity, warehouseId, refType: 'REVERSAL', refId: m.id, reversalOfId: m.id, reason: 'REVERSAL', note: why, createdByUserId: actor.id, batchNo: m.batchNo, expiresOn: m.expiresOn },
      });
    });
  }

  async movements(actor: RequestUser, f: { itemId?: string; warehouseId?: string; type?: string; from?: string; to?: string; limit?: number }, mamcosIdParam?: string) {
    const mamcosId = tenantOf(this.ownership, actor, mamcosIdParam);
    const where: Prisma.FarmInputMovementWhereInput = {
      item: { mamcosId }, ...(f.itemId ? { itemId: f.itemId } : {}), ...(f.warehouseId ? { warehouseId: f.warehouseId } : {}), ...(f.type ? { type: f.type as InputMovementType } : {}),
      ...(f.from || f.to ? { createdAt: { ...(f.from ? { gte: new Date(`${f.from}T00:00:00+03:00`) } : {}), ...(f.to ? { lte: new Date(`${f.to}T23:59:59.999+03:00`) } : {}) } } : {}),
    };
    const rows = await this.prisma.farmInputMovement.findMany({ where, include: { item: { select: { name: true, unit: true, stockClass: true } }, warehouse: { select: { name: true } } }, orderBy: { createdAt: 'desc' }, take: Math.min(Math.max(f.limit ?? 200, 1), 1000) });
    const users = await this.prisma.user.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.createdByUserId))] } }, select: { id: true, firstName: true, lastName: true } });
    const who = new Map(users.map((u) => [u.id, [u.firstName, u.lastName].filter(Boolean).join(' ')]));
    const reversed = new Set(rows.map((r) => r.reversalOfId).filter(Boolean));
    return {
      data: rows.map((r) => ({
        id: r.id, at: r.createdAt, type: r.type, quantity: r.quantity, item: r.item.name, unit: r.item.unit, stockClass: r.item.stockClass, itemId: r.itemId,
        warehouse: r.warehouse?.name ?? null, warehouseId: r.warehouseId, refType: r.refType, reason: r.reason, supplier: r.supplierName, batchNo: r.batchNo, expiresOn: r.expiresOn, note: r.note, by: who.get(r.createdByUserId) || null,
        reversed: reversed.has(r.id), isReversal: r.refType === 'REVERSAL',
      })),
    };
  }

  /** Everything held, one row per item and warehouse, with what is running low. */
  async overview(actor: RequestUser, f: { warehouseId?: string; stockClass?: string } = {}, mamcosIdParam?: string) {
    const mamcosId = tenantOf(this.ownership, actor, mamcosIdParam);
    const fallback = await this.defaultWarehouse(this.prisma, mamcosId);
    const items = await this.prisma.farmInputItem.findMany({ where: { mamcosId, ...(f.stockClass ? { stockClass: f.stockClass as never } : {}) }, include: { inputType: { select: { name: true } } }, orderBy: [{ isActive: 'desc' }, { name: 'asc' }] });
    const groups = await this.prisma.farmInputMovement.groupBy({ by: ['itemId', 'warehouseId'], where: { itemId: { in: items.map((i) => i.id) } }, _sum: { quantity: true } });
    const warehouses = await this.prisma.warehouse.findMany({ where: { mamcosId }, select: { id: true, name: true, isActive: true, isDefaultForInputs: true }, orderBy: { name: 'asc' } });
    const wname = new Map(warehouses.map((w) => [w.id, w.name]));
    const totals = new Map<string, number>();
    const cells = new Map<string, number>();
    for (const g of groups) {
      const wh = g.warehouseId ?? fallback;
      const key = `${g.itemId}|${wh}`;
      cells.set(key, r3((cells.get(key) ?? 0) + (g._sum.quantity ?? 0)));
      totals.set(g.itemId, r3((totals.get(g.itemId) ?? 0) + (g._sum.quantity ?? 0)));
    }
    const rows = items.flatMap((i) => {
      const own = [...cells.entries()].filter(([k]) => k.startsWith(`${i.id}|`)).map(([k, v]) => ({ warehouseId: k.split('|')[1], balance: v }));
      const shown = own.filter((c) => (!f.warehouseId || c.warehouseId === f.warehouseId) && (c.balance !== 0 || f.warehouseId));
      const base = { itemId: i.id, name: i.name, unit: i.unit, stockClass: i.stockClass, typeName: i.inputType?.name ?? null, unitCost: i.unitCost, reorderLevel: i.reorderLevel, isActive: i.isActive, packagingKg: i.packagingKg };
      const low = (t: number) => i.reorderLevel != null && t <= i.reorderLevel;
      if (!shown.length) return f.warehouseId ? [] : [{ ...base, warehouseId: null as string | null, warehouse: null as string | null, balance: 0, itemTotal: totals.get(i.id) ?? 0, low: low(totals.get(i.id) ?? 0) }];
      return shown.map((c) => ({ ...base, warehouseId: c.warehouseId as string | null, warehouse: wname.get(c.warehouseId) ?? null, balance: c.balance, itemTotal: totals.get(i.id) ?? 0, low: low(totals.get(i.id) ?? 0) }));
    });
    return { data: rows, warehouses: warehouses.filter((w) => w.isActive).map((w) => ({ id: w.id, name: w.name, isDefault: w.isDefaultForInputs })) };
  }

  /**
   * Every delivery batch: when it came in, when it expires, what is left and, once empty, when it finished.
   * `state` is ACTIVE, EXPIRING (30 days or less), EXPIRED (still has stock past its date) or FINISHED.
   */
  async batches(actor: RequestUser, f: { itemId?: string; warehouseId?: string; state?: string; from?: string; to?: string } = {}, mamcosIdParam?: string) {
    const mamcosId = tenantOf(this.ownership, actor, mamcosIdParam);
    const fallback = await this.defaultWarehouse(this.prisma, mamcosId);
    const where: Prisma.FarmInputMovementWhereInput = { item: { mamcosId }, ...(f.itemId ? { itemId: f.itemId } : {}) };
    const by = ['itemId', 'warehouseId', 'batchNo', 'expiresOn'] as const;
    const [net, ins] = await Promise.all([
      this.prisma.farmInputMovement.groupBy({ by: [...by], where, _sum: { quantity: true }, _min: { createdAt: true }, _max: { createdAt: true } }),
      this.prisma.farmInputMovement.groupBy({ by: [...by], where: { ...where, quantity: { gt: 0 }, type: { in: ['IN', 'TRANSFER_IN'] } }, _sum: { quantity: true }, _min: { createdAt: true } }),
    ]);
    const key = (g: { itemId: string; warehouseId: string | null; batchNo: string | null; expiresOn: Date | null }) => `${g.itemId}|${g.warehouseId ?? fallback}|${g.batchNo ?? ''}|${g.expiresOn?.toISOString() ?? ''}`;
    const merged = new Map<string, { itemId: string; warehouseId: string; batchNo: string | null; expiresOn: Date | null; remaining: number; received: number; firstIn: Date | null; last: Date | null }>();
    for (const g of net) {
      const k = key(g);
      const cur = merged.get(k) ?? { itemId: g.itemId, warehouseId: g.warehouseId ?? fallback, batchNo: g.batchNo, expiresOn: g.expiresOn, remaining: 0, received: 0, firstIn: null, last: null };
      cur.remaining = r3(cur.remaining + (g._sum.quantity ?? 0));
      cur.last = !cur.last || (g._max.createdAt && g._max.createdAt > cur.last) ? g._max.createdAt : cur.last;
      merged.set(k, cur);
    }
    for (const g of ins) {
      const cur = merged.get(key(g));
      if (!cur) continue;
      cur.received = r3(cur.received + (g._sum.quantity ?? 0));
      cur.firstIn = !cur.firstIn || (g._min.createdAt && g._min.createdAt < cur.firstIn) ? g._min.createdAt : cur.firstIn;
    }
    const items = new Map((await this.prisma.farmInputItem.findMany({ where: { mamcosId }, select: { id: true, name: true, unit: true, stockClass: true } })).map((i) => [i.id, i]));
    const whs = new Map((await this.prisma.warehouse.findMany({ where: { mamcosId }, select: { id: true, name: true } })).map((w) => [w.id, w.name]));
    const today = new Date();
    const rows = [...merged.values()].filter((b) => items.has(b.itemId) && (b.received > 0 || b.remaining !== 0)).map((b) => {
      const days = b.expiresOn ? Math.ceil((b.expiresOn.getTime() - today.getTime()) / 86_400_000) : null;
      const state = b.remaining <= EPS ? 'FINISHED' : days != null && days < 0 ? 'EXPIRED' : days != null && days <= 30 ? 'EXPIRING' : 'ACTIVE';
      const it = items.get(b.itemId)!;
      return {
        itemId: b.itemId, item: it.name, unit: it.unit, stockClass: it.stockClass, warehouseId: b.warehouseId, warehouse: whs.get(b.warehouseId) ?? null,
        batchNo: b.batchNo ?? 'Earlier stock', receivedKg: b.received, remaining: Math.max(b.remaining, 0), receivedOn: b.firstIn, expiresOn: b.expiresOn, daysToExpiry: days,
        finishedOn: state === 'FINISHED' ? b.last : null, state,
      };
    })
      .filter((b) => (!f.warehouseId || b.warehouseId === f.warehouseId) && (!f.state || b.state === f.state)
        && (!f.from || !b.receivedOn || b.receivedOn >= new Date(`${f.from}T00:00:00+03:00`)) && (!f.to || !b.receivedOn || b.receivedOn <= new Date(`${f.to}T23:59:59.999+03:00`)))
      .sort((a, b) => a.item.localeCompare(b.item) || (a.expiresOn?.getTime() ?? Infinity) - (b.expiresOn?.getTime() ?? Infinity));
    const count = (st: string) => rows.filter((r) => r.state === st).length;
    return { data: rows, summary: { active: count('ACTIVE'), expiring: count('EXPIRING'), expired: count('EXPIRED'), finished: count('FINISHED') } };
  }
}
