import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { Actor, assertVisible, batchBalances, lockBatches, nextRef, owner, OpsNotifyService, scope } from './ops-common';
import { r3 } from './ops-rules';
import { AdjustStockDto, ReceiveTransferDto, TransferDto } from './dto/warehouse.dto';

const day = (d?: string) => (d ? new Date(d) : undefined);
const endOfDay = (d?: string) => {
  if (!d) return undefined;
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
};

@Injectable()
export class StockService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notify: OpsNotifyService,
  ) {}

  /** Batches with how much is at each warehouse: physical, reserved for orders, and free to sell. */
  async batches(actor: Actor, f: { productId?: string; warehouseId?: string; category?: string; brand?: string; variety?: string; grade?: string; pack?: string; q?: string; inStock?: string } = {}) {
    const batches = await this.prisma.stockBatch.findMany({
      where: {
        ...scope(actor),
        ...(f.productId ? { productId: f.productId } : {}),
        ...(f.variety ? { riceVariety: { equals: f.variety, mode: 'insensitive' } } : {}),
        ...(f.grade ? { grade: { equals: f.grade, mode: 'insensitive' } } : {}),
        ...(f.q ? { reference: { contains: f.q, mode: 'insensitive' } } : {}),
        product: {
          ...(f.category ? { category: f.category as never } : {}),
          ...(f.brand ? { brand: { equals: f.brand, mode: 'insensitive' } } : {}),
          ...(f.pack ? { packSizeKg: Number(f.pack) } : {}),
        },
      },
      include: {
        product: { select: { name: true, brand: true, category: true, packSizeKg: true, riceVariety: true } },
        receipt: { select: { reference: true, farmer: { select: { firstName: true, lastName: true, controlNumber: true } }, sellerName: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
    const rows = await this.prisma.stockLedgerEntry.groupBy({
      by: ['batchId', 'warehouseId'],
      where: { batchId: { in: batches.map((b) => b.id) }, ...(f.warehouseId ? { warehouseId: f.warehouseId } : {}) },
      _sum: { quantityKg: true },
    });
    const wh = new Map((await this.prisma.warehouse.findMany({ select: { id: true, name: true } })).map((w) => [w.id, w.name]));
    const out: unknown[] = [];
    for (const b of batches) {
      for (const r of rows.filter((x) => x.batchId === b.id)) {
        const bal = (await batchBalances(this.prisma, [b.id], r.warehouseId)).get(b.id)!;
        if (f.inStock === 'true' && bal.physicalKg <= 0) continue;
        out.push({ ...b, warehouseId: r.warehouseId, warehouseName: wh.get(r.warehouseId) ?? null, ...bal });
      }
    }
    return out;
  }

  /** Opening, movements and closing stock for a period, grouped by product and warehouse, with reserved and available now. */
  async position(actor: Actor, f: { from?: string; to?: string; productId?: string; brand?: string; category?: string; warehouseId?: string; batchId?: string } = {}) {
    const from = day(f.from);
    const to = endOfDay(f.to);
    const entries = await this.prisma.stockLedgerEntry.findMany({
      where: {
        batch: {
          ...scope(actor),
          ...(f.batchId ? { id: f.batchId } : {}),
          ...(f.productId ? { productId: f.productId } : {}),
          product: { ...(f.category ? { category: f.category as never } : {}), ...(f.brand ? { brand: { equals: f.brand, mode: 'insensitive' } } : {}) },
        },
        ...(f.warehouseId ? { warehouseId: f.warehouseId } : {}),
        ...(to ? { createdAt: { lte: to } } : {}),
      },
      select: { type: true, quantityKg: true, createdAt: true, warehouseId: true, batch: { select: { id: true, productId: true } } },
    });
    const products = new Map((await this.prisma.product.findMany({ where: { id: { in: [...new Set(entries.map((e) => e.batch.productId))] } } })).map((p) => [p.id, p]));
    const wh = new Map((await this.prisma.warehouse.findMany({ select: { id: true, name: true } })).map((w) => [w.id, w.name]));
    type Row = { productId: string; warehouseId: string; opening: number; received: number; processedOut: number; produced: number; dispatched: number; adjustments: number; transfers: number; closing: number };
    const rows = new Map<string, Row>();
    for (const e of entries) {
      const key = `${e.batch.productId}|${e.warehouseId}`;
      const r = rows.get(key) ?? { productId: e.batch.productId, warehouseId: e.warehouseId, opening: 0, received: 0, processedOut: 0, produced: 0, dispatched: 0, adjustments: 0, transfers: 0, closing: 0 };
      r.closing += e.quantityKg;
      if (from && e.createdAt < from) r.opening += e.quantityKg;
      else {
        if (e.type === 'RECEIPT') r.received += e.quantityKg;
        else if (e.type === 'PROCESS_OUT') r.processedOut += -e.quantityKg;
        else if (e.type === 'PROCESS_IN') r.produced += e.quantityKg;
        else if (e.type === 'DISPATCH') r.dispatched += -e.quantityKg;
        else if (e.type === 'ADJUSTMENT' || e.type === 'WRITE_OFF') r.adjustments += e.quantityKg;
        else r.transfers += e.quantityKg;
      }
      rows.set(key, r);
    }
    // Reserved and available are "now", whatever the period.
    const allocs = await this.prisma.orderAllocation.findMany({
      where: { batch: { ...scope(actor) } },
      select: { warehouseId: true, quantityKg: true, dispatchedKg: true, releasedKg: true, batch: { select: { productId: true } } },
    });
    const transit = await this.prisma.stockTransfer.findMany({ where: { ...scope(actor), status: 'IN_TRANSIT' }, select: { quantityKg: true, toWarehouseId: true, batchId: true } });
    const transitBatches = new Map((await this.prisma.stockBatch.findMany({ where: { id: { in: transit.map((t) => t.batchId) } }, select: { id: true, productId: true } })).map((b) => [b.id, b.productId]));
    const result = [...rows.values()].map((r) => {
      const p = products.get(r.productId)!;
      const reservedKg = allocs.filter((a) => a.batch.productId === r.productId && a.warehouseId === r.warehouseId).reduce((t, a) => t + (a.quantityKg - a.dispatchedKg - a.releasedKg), 0);
      const inTransitKg = transit.filter((t) => transitBatches.get(t.batchId) === r.productId && t.toWarehouseId === r.warehouseId).reduce((t, x) => t + x.quantityKg, 0);
      return {
        productId: r.productId, product: p.name, brand: p.brand, category: p.category, variety: p.riceVariety, grade: p.grade, packSizeKg: p.packSizeKg,
        warehouseId: r.warehouseId, warehouse: wh.get(r.warehouseId) ?? null,
        openingKg: r3(r.opening), receivedKg: r3(r.received), processedOutKg: r3(r.processedOut), producedKg: r3(r.produced), dispatchedKg: r3(r.dispatched),
        adjustmentsKg: r3(r.adjustments), transfersKg: r3(r.transfers), closingKg: r3(r.closing), reservedKg: r3(reservedKg), availableKg: r3(r.closing - reservedKg), inTransitKg: r3(inTransitKg),
        indicativeValue: p.unitPrice ? Math.round(r.closing * p.unitPrice) : null,
        lowStock: p.reorderLevelKg != null && r.closing - reservedKg < p.reorderLevelKg,
        reorderLevelKg: p.reorderLevelKg,
      };
    });
    return result.sort((a, b) => a.category.localeCompare(b.category) || (a.brand ?? '').localeCompare(b.brand ?? '') || a.product.localeCompare(b.product));
  }

  async summary(actor: Actor) {
    const pos = await this.position(actor);
    const sum = (k: 'closingKg' | 'reservedKg' | 'availableKg' | 'inTransitKg', cat?: string) => r3(pos.filter((p) => !cat || p.category === cat).reduce((t, p) => t + p[k], 0));
    return {
      paddyKg: sum('closingKg', 'PADDY'),
      processedKg: sum('closingKg', 'PROCESSED'),
      brokenKg: sum('closingKg', 'BROKEN'),
      byproductKg: sum('closingKg', 'BYPRODUCT'),
      reservedKg: sum('reservedKg'),
      availableKg: sum('availableKg'),
      inTransitKg: sum('inTransitKg'),
      lowStock: pos.filter((p) => p.lowStock).map((p) => ({ product: p.product, brand: p.brand, warehouse: p.warehouse, availableKg: p.availableKg, reorderLevelKg: p.reorderLevelKg })),
    };
  }

  // ---------- adjustments: the only way to change stock by hand ----------

  async adjust(dto: AdjustStockDto, actor: Actor & { id: string }) {
    if (!dto.reason.trim()) throw new BadRequestException('Give the reason for the adjustment');
    if (dto.quantityKg === 0) throw new BadRequestException('The quantity cannot be zero');
    if (dto.type === 'WRITE_OFF' && dto.quantityKg > 0) throw new BadRequestException('A write-off removes stock, so the quantity must be negative');
    return this.prisma.$transaction(async (tx) => {
      const batch = await tx.stockBatch.findUnique({ where: { id: dto.batchId } });
      assertVisible(actor, batch, 'Batch');
      await lockBatches(tx, [batch.id]);
      const bal = (await batchBalances(tx, [batch.id], dto.warehouseId)).get(batch.id)!;
      if (dto.quantityKg < 0 && -dto.quantityKg > bal.availableKg + 0.0005)
        throw new ConflictException(`Only ${bal.availableKg} kg is free to remove (${bal.reservedKg} kg is reserved for orders)`);
      return tx.stockLedgerEntry.create({
        data: { batchId: batch.id, warehouseId: dto.warehouseId, type: dto.type, quantityKg: dto.quantityKg, reason: dto.reason.trim(), refType: 'adjustment', createdByUserId: actor.id, approvedByUserId: actor.id },
      });
    });
  }

  /** Corrects a manual adjustment by adding the opposite row; the original stays on record. */
  async reverse(entryId: string, reason: string, actor: Actor & { id: string }) {
    if (!reason.trim()) throw new BadRequestException('Give the reason for the reversal');
    return this.prisma.$transaction(async (tx) => {
      const e = await tx.stockLedgerEntry.findUnique({ where: { id: entryId }, include: { batch: true } });
      assertVisible(actor, e?.batch ?? null, 'Stock entry');
      if (!['ADJUSTMENT', 'WRITE_OFF'].includes(e!.type)) throw new BadRequestException('Only manual adjustments can be reversed here');
      await lockBatches(tx, [e!.batchId]);
      const bal = (await batchBalances(tx, [e!.batchId], e!.warehouseId)).get(e!.batchId)!;
      if (e!.quantityKg > 0 && e!.quantityKg > bal.availableKg + 0.0005) throw new ConflictException('That stock has already been used or reserved');
      try {
        return await tx.stockLedgerEntry.create({
          data: { batchId: e!.batchId, warehouseId: e!.warehouseId, type: e!.type, quantityKg: -e!.quantityKg, reason: `Reversal: ${reason.trim()}`, refType: 'reversal', refId: e!.id, reversalOfId: e!.id, createdByUserId: actor.id, approvedByUserId: actor.id },
        });
      } catch (err) {
        if ((err as { code?: string }).code === 'P2002') throw new ConflictException('This entry has already been reversed');
        throw err;
      }
    });
  }

  async ledger(actor: Actor, f: { batchId?: string; warehouseId?: string; type?: string; from?: string; to?: string } = {}) {
    return this.prisma.stockLedgerEntry.findMany({
      where: {
        batch: { ...scope(actor) },
        ...(f.batchId ? { batchId: f.batchId } : {}), ...(f.warehouseId ? { warehouseId: f.warehouseId } : {}), ...(f.type ? { type: f.type as never } : {}),
        ...(f.from || f.to ? { createdAt: { ...(f.from ? { gte: day(f.from) } : {}), ...(f.to ? { lte: endOfDay(f.to) } : {}) } } : {}),
      },
      include: { batch: { select: { reference: true, product: { select: { name: true, brand: true } } } } },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
  }

  // ---------- transfers between warehouses ----------

  async transfers(actor: Actor) {
    return this.prisma.stockTransfer.findMany({ where: scope(actor), orderBy: { sentAt: 'desc' }, take: 200 });
  }

  async sendTransfer(dto: TransferDto, actor: Actor & { id: string }) {
    if (dto.fromWarehouseId === dto.toWarehouseId) throw new BadRequestException('Choose a different destination warehouse');
    return this.prisma.$transaction(async (tx) => {
      const batch = await tx.stockBatch.findUnique({ where: { id: dto.batchId } });
      assertVisible(actor, batch, 'Batch');
      const dest = await tx.warehouse.findUnique({ where: { id: dto.toWarehouseId } });
      if (!dest || !dest.isActive) throw new NotFoundException('Destination warehouse not found');
      await lockBatches(tx, [batch.id]);
      const bal = (await batchBalances(tx, [batch.id], dto.fromWarehouseId)).get(batch.id)!;
      if (dto.quantityKg > bal.availableKg + 0.0005) throw new ConflictException(`Only ${bal.availableKg} kg is free to transfer`);
      const reference = await nextRef(tx, 'TRF');
      const t = await tx.stockTransfer.create({
        data: { reference, mamcosId: owner(actor), batchId: batch.id, fromWarehouseId: dto.fromWarehouseId, toWarehouseId: dto.toWarehouseId, quantityKg: dto.quantityKg, note: dto.note, sentByUserId: actor.id },
      });
      await tx.stockLedgerEntry.create({ data: { batchId: batch.id, warehouseId: dto.fromWarehouseId, type: 'TRANSFER_OUT', quantityKg: -dto.quantityKg, refType: 'transfer', refId: t.id, createdByUserId: actor.id } });
      return t;
    });
  }

  async receiveTransfer(id: string, dto: ReceiveTransferDto, actor: Actor & { id: string }) {
    const result = await this.prisma.$transaction(async (tx) => {
      const t = await tx.stockTransfer.findUnique({ where: { id } });
      assertVisible(actor, t, 'Transfer');
      const claimed = await tx.stockTransfer.updateMany({ where: { id, status: 'IN_TRANSIT' }, data: { status: 'RECEIVED', receivedKg: dto.receivedKg, receivedAt: new Date(), receivedByUserId: actor.id } });
      if (!claimed.count) throw new ConflictException('This transfer has already been received or cancelled');
      if (dto.receivedKg > t.quantityKg + 0.0005) throw new BadRequestException('You cannot receive more than was sent');
      await tx.stockLedgerEntry.create({ data: { batchId: t.batchId, warehouseId: t.toWarehouseId, type: 'TRANSFER_IN', quantityKg: dto.receivedKg, refType: 'transfer', refId: id, createdByUserId: actor.id } });
      const short = r3(t.quantityKg - dto.receivedKg);
      // Anything that did not arrive is a loss, recorded against the sending warehouse so the books balance.
      if (short > 0) await tx.stockLedgerEntry.create({ data: { batchId: t.batchId, warehouseId: t.fromWarehouseId, type: 'WRITE_OFF', quantityKg: 0, reason: `Short on arrival by ${short} kg (${dto.note ?? 'no note'})`, refType: 'transfer', refId: id, createdByUserId: actor.id } });
      return { transfer: t, short };
    });
    if (result.short > 0) await this.notify.tellPermission('ops_stock', 'EDIT', result.transfer.mamcosId, { type: 'OPS_TRANSFER_SHORT', title: 'Transfer arrived short', body: `${result.transfer.reference}: ${result.short} kg did not arrive.`, data: { transferId: id } });
    return this.prisma.stockTransfer.findUnique({ where: { id } });
  }

  async cancelTransfer(id: string, reason: string, actor: Actor & { id: string }) {
    return this.prisma.$transaction(async (tx) => {
      const t = await tx.stockTransfer.findUnique({ where: { id } });
      assertVisible(actor, t, 'Transfer');
      const claimed = await tx.stockTransfer.updateMany({ where: { id, status: 'IN_TRANSIT' }, data: { status: 'CANCELLED', note: reason } });
      if (!claimed.count) throw new ConflictException('Only a transfer still on the way can be cancelled');
      await tx.stockLedgerEntry.create({ data: { batchId: t.batchId, warehouseId: t.fromWarehouseId, type: 'TRANSFER_IN', quantityKg: t.quantityKg, reason: `Transfer ${t.reference} cancelled`, refType: 'transfer', refId: id, createdByUserId: actor.id } });
      return { ok: true };
    });
  }
}

export type { Prisma };
