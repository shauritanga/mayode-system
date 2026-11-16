import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OwnershipService, RequestUser } from '../common/ownership.service';
import { NotificationsService } from '../notifications/notifications.service';
import { InputStockService } from '../input-stock/input-stock.service';
import { tenantOf } from './common';

const r3 = (n: number) => Math.round(n * 1000) / 1000;

/**
 * The warehouse side of input distribution: the least each warehouse should hold of each input, the alert when it runs low,
 * the history of what was received, moved and handed to farmers, and the books that make every movement traceable.
 */
@Injectable()
export class InputWarehouseService {
  private readonly logger = new Logger(InputWarehouseService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly ownership: OwnershipService,
    private readonly stock: InputStockService,
    private readonly notifications: NotificationsService,
  ) {}

  private async inputItems(mamcosId: string) {
    return this.prisma.farmInputItem.findMany({ where: { mamcosId, isActive: true, stockClass: 'INPUT' }, select: { id: true, name: true, unit: true }, orderBy: { name: 'asc' } });
  }

  // ───────────────────────── minimum stock ─────────────────────────

  /** One row for every input in every warehouse: what it holds and the minimum set for it. */
  async minimums(actor: RequestUser, mamcosIdParam?: string) {
    const mamcosId = tenantOf(this.ownership, actor, mamcosIdParam);
    const [items, warehouses, rows] = await Promise.all([
      this.inputItems(mamcosId),
      this.prisma.warehouse.findMany({ where: { mamcosId, isActive: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
      this.prisma.inputStockThreshold.findMany({ where: { mamcosId } }),
    ]);
    const data: any[] = [];
    for (const w of warehouses) for (const i of items) {
      const have = r3(await this.stock.availableIn(i.id, mamcosId, w.id));
      const t = rows.find((r) => r.warehouseId === w.id && r.itemId === i.id);
      data.push({ warehouseId: w.id, warehouse: w.name, itemId: i.id, item: i.name, unit: i.unit, balance: have, minQuantity: t?.minQuantity ?? null, low: t ? have <= t.minQuantity : false });
    }
    return { data };
  }

  async setMinimum(actor: RequestUser, dto: { warehouseId: string; itemId: string; minQuantity: number | null }, mamcosIdParam?: string) {
    const mamcosId = tenantOf(this.ownership, actor, mamcosIdParam);
    const [w, i] = await Promise.all([
      this.prisma.warehouse.findFirst({ where: { id: dto.warehouseId, mamcosId }, select: { id: true } }),
      this.prisma.farmInputItem.findFirst({ where: { id: dto.itemId, mamcosId, stockClass: 'INPUT' }, select: { id: true } }),
    ]);
    if (!w || !i) throw new NotFoundException('Warehouse or input not found');
    if (dto.minQuantity == null) await this.prisma.inputStockThreshold.deleteMany({ where: { warehouseId: w.id, itemId: i.id } });
    else {
      if (!(dto.minQuantity >= 0)) throw new BadRequestException('The minimum cannot be negative');
      await this.prisma.inputStockThreshold.upsert({ where: { warehouseId_itemId: { warehouseId: w.id, itemId: i.id } }, create: { mamcosId, warehouseId: w.id, itemId: i.id, minQuantity: dto.minQuantity, updatedById: actor.id }, update: { minQuantity: dto.minQuantity, updatedById: actor.id, lowSince: null } });
      await this.checkLow(mamcosId, w.id, [i.id]);
    }
    return this.minimums(actor, mamcosId);
  }

  /**
   * Tells management once when an input in a warehouse reaches its minimum, and again only after it has been topped up and run down again.
   * The text names the warehouse and suggests replenishing or opening another one.
   */
  async checkLow(mamcosId: string, warehouseId: string, itemIds?: string[]) {
    const rows = await this.prisma.inputStockThreshold.findMany({ where: { mamcosId, warehouseId, ...(itemIds ? { itemId: { in: itemIds } } : {}) } });
    if (!rows.length) return 0;
    const [wh, items] = await Promise.all([
      this.prisma.warehouse.findUnique({ where: { id: warehouseId }, select: { name: true } }),
      this.prisma.farmInputItem.findMany({ where: { id: { in: rows.map((r) => r.itemId) } }, select: { id: true, name: true, unit: true } }),
    ]);
    let alerts = 0;
    for (const t of rows) {
      const have = r3(await this.stock.availableIn(t.itemId, mamcosId, warehouseId));
      const it = items.find((x) => x.id === t.itemId); if (!it) continue;
      if (have <= t.minQuantity && !t.lowSince) {
        const claimed = await this.prisma.inputStockThreshold.updateMany({ where: { id: t.id, lowSince: null }, data: { lowSince: new Date() } });
        if (!claimed.count) continue;
        alerts++;
        await this.tell(mamcosId, warehouseId, { type: 'WAREHOUSE_LOW_STOCK', title: `${wh?.name ?? 'Warehouse'}: low stock`, body: `${wh?.name ?? 'Warehouse'} is approaching its minimum ${it.name} stock level: ${have} ${it.unit} left (minimum ${t.minQuantity}). Management should consider opening another warehouse or replenishing the existing stock if fertiliser distribution is continuing.` });
      } else if (have > t.minQuantity && t.lowSince) {
        await this.prisma.inputStockThreshold.update({ where: { id: t.id }, data: { lowSince: null } });
      }
    }
    return alerts;
  }

  private async tell(mamcosId: string, warehouseId: string, note: { type: string; title: string; body: string }) {
    const [managers, keepers] = await Promise.all([
      this.prisma.user.findMany({ where: { isActive: true, mamcosId, customRole: { isActive: true, permissions: { some: { action: { in: ['VIEW', 'EDIT'] }, resource: { key: { in: ['input_distribution', 'amcos_settings'] } } } } } }, select: { id: true } }),
      this.prisma.warehouseKeeper.findMany({ where: { warehouseId }, select: { userId: true } }),
    ]);
    const ids = [...new Set([...managers.map((m) => m.id), ...keepers.map((k) => k.userId)])];
    await Promise.all(ids.map((userId) => this.notifications.create({ userId, ...note, data: { warehouseId } }).catch(() => undefined)));
  }

  /** Every morning's catch-up (stock can also drop through transfers and adjustments). */
  async sweepAll() {
    const groups = await this.prisma.inputStockThreshold.findMany({ select: { mamcosId: true, warehouseId: true }, distinct: ['mamcosId', 'warehouseId'] });
    let n = 0;
    for (const g of groups) { try { n += await this.checkLow(g.mamcosId, g.warehouseId); } catch (e) { this.logger.warn(`Low-stock check failed: ${e instanceof Error ? e.message : e}`); } }
    return n;
  }

  // ───────────────────────── traceability ─────────────────────────

  /** For each warehouse and input: received, moved between warehouses, handed to farmers, and what remains. */
  async books(actor: RequestUser, q: { warehouseId?: string }, mamcosIdParam?: string) {
    const mamcosId = tenantOf(this.ownership, actor, mamcosIdParam);
    const [items, warehouses, thresholds] = await Promise.all([
      this.inputItems(mamcosId),
      this.prisma.warehouse.findMany({ where: { mamcosId, ...(q.warehouseId ? { id: q.warehouseId } : {}) }, select: { id: true, name: true, isActive: true }, orderBy: { name: 'asc' } }),
      this.prisma.inputStockThreshold.findMany({ where: { mamcosId } }),
    ]);
    const fallback = await this.stock.defaultWarehouse(this.prisma, mamcosId);
    const moves = await this.prisma.farmInputMovement.groupBy({ by: ['itemId', 'warehouseId', 'refType'], where: { itemId: { in: items.map((i) => i.id) } }, _sum: { quantity: true } });
    const data: any[] = [];
    for (const w of warehouses) {
      const lines: any[] = [];
      for (const i of items) {
        const mine = moves.filter((m) => m.itemId === i.id && (m.warehouseId ?? fallback) === w.id);
        const sum = (f: (m: (typeof mine)[number]) => boolean) => r3(mine.filter(f).reduce((n, m) => n + (m._sum.quantity ?? 0), 0));
        const received = sum((m) => (m._sum.quantity ?? 0) > 0 && !['TRANSFER', 'REVERSAL', 'ADJUSTMENT'].includes(m.refType ?? ''));
        const transferIn = sum((m) => m.refType === 'TRANSFER' && (m._sum.quantity ?? 0) > 0);
        const transferOut = -sum((m) => m.refType === 'TRANSFER' && (m._sum.quantity ?? 0) < 0);
        const issued = -sum((m) => m.refType === 'DISTRIBUTION');
        const remaining = sum(() => true);
        if (!received && !transferIn && !transferOut && !issued && !remaining) continue;
        const t = thresholds.find((x) => x.warehouseId === w.id && x.itemId === i.id);
        lines.push({ itemId: i.id, item: i.name, unit: i.unit, received, transferIn, transferOut, issued, other: r3(remaining - received - transferIn + transferOut + issued), remaining, minQuantity: t?.minQuantity ?? null, low: t ? remaining <= t.minQuantity : false });
      }
      data.push({ warehouseId: w.id, warehouse: w.name, isActive: w.isActive, lines });
    }
    return { data };
  }

  /** Every handover: who collected, which hectares, what, where, which keeper, when, and the stock before and after. */
  async collections(actor: RequestUser, q: { warehouseId?: string; itemId?: string }, mamcosIdParam?: string) {
    const mamcosId = tenantOf(this.ownership, actor, mamcosIdParam);
    const issues = await this.prisma.inputIssue.findMany({ where: { mamcosId, applicationId: { not: null }, ...(q.warehouseId ? { warehouseId: q.warehouseId } : {}), ...(q.itemId ? { itemId: q.itemId } : {}) }, orderBy: { issuedAt: 'desc' }, take: 100 });
    const [farmers, keepers, whs, apps] = await Promise.all([
      this.prisma.farmer.findMany({ where: { id: { in: issues.map((i) => i.farmerId) } }, select: { id: true, firstName: true, lastName: true, controlNumber: true } }),
      this.prisma.user.findMany({ where: { id: { in: issues.map((i) => i.issuedById) } }, select: { id: true, firstName: true, lastName: true } }),
      this.prisma.warehouse.findMany({ where: { mamcosId }, select: { id: true, name: true } }),
      this.prisma.inputApplication.findMany({ where: { id: { in: issues.flatMap((i) => (i.applicationId ? [i.applicationId] : [])) } }, select: { id: true, reference: true, collectCodeHint: true } }),
    ]);
    const fallback = await this.stock.defaultWarehouse(this.prisma, mamcosId);
    const out: any[] = [];
    for (const i of issues) {
      const wid = i.warehouseId ?? fallback;
      const moved = await this.prisma.farmInputMovement.findMany({ where: { refType: 'DISTRIBUTION', refId: i.id }, select: { createdAt: true } });
      const at = moved.length ? new Date(Math.min(...moved.map((m) => +m.createdAt))) : i.issuedAt;
      const before = await this.prisma.farmInputMovement.aggregate({ where: { itemId: i.itemId, ...(wid === fallback ? { OR: [{ warehouseId: wid }, { warehouseId: null }] } : { warehouseId: wid }), createdAt: { lt: at } }, _sum: { quantity: true } });
      const prev = r3(before._sum.quantity ?? 0);
      const f = farmers.find((x) => x.id === i.farmerId); const k = keepers.find((x) => x.id === i.issuedById); const a = apps.find((x) => x.id === i.applicationId);
      out.push({
        id: i.id, reference: i.reference, applicationRef: a?.reference ?? null, codeEnding: a?.collectCodeHint ?? null, at: i.issuedAt,
        farmer: f ? { name: `${f.firstName} ${f.lastName}`, memberNumber: f.controlNumber } : null, farmIds: i.farmIds,
        item: i.itemName, unit: i.unit, previous: prev, issued: i.quantity, remaining: r3(prev - i.quantity),
        warehouse: whs.find((w) => w.id === wid)?.name ?? null, keeper: k ? `${k.firstName} ${k.lastName}` : null, amount: Number(i.amount),
      });
    }
    return { data: out };
  }
}
