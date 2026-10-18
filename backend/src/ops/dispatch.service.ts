import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { Actor, assertVisible, batchBalances, lockBatches, nextRef, OpsNotifyService, scope, Tx } from './ops-common';
import { r3, suggestAllocation } from './ops-rules';
import { lineKg } from './sales-ops.service';
import { AllocateDto, DeliveryDto, PrepareDispatchDto } from './dto/commercial.dto';

type User = Actor & { id: string };
const OPEN_STATES = ['AUTHORIZED', 'SHORTAGE', 'ALLOCATED', 'PARTIALLY_DISPATCHED'] as const;

@Injectable()
export class DispatchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notify: OpsNotifyService,
  ) {}

  /** Only orders accounts have released appear here; nothing else is the warehouse's to prepare. */
  async queue(actor: Actor) {
    const orders = await this.prisma.opsOrder.findMany({
      where: { ...scope(actor), status: 'INVOICED', fulfilState: { in: [...OPEN_STATES] } },
      include: { customer: { select: { reference: true, name: true, phone: true } }, lines: { include: { product: { select: { name: true, brand: true, unit: true, packSizeKg: true } } } } },
      orderBy: { authorizedAt: 'asc' },
    });
    return orders.map((o) => {
      const requiredKg = r3(o.lines.reduce((t, l) => t + lineKg(l.product, l.quantity), 0));
      const dispatchedKg = r3(o.lines.reduce((t, l) => t + l.dispatchedQty, 0));
      return { id: o.id, reference: o.reference, customer: o.customer, fulfilState: o.fulfilState, paymentStatus: o.paymentStatus, deliveryMode: o.deliveryMode, deliveryNote: o.deliveryNote, authorizedAt: o.authorizedAt, shortageNote: o.shortageNote, requiredKg, dispatchedKg, outstandingKg: r3(requiredKg - dispatchedKg), lines: o.lines.length };
    });
  }

  /** Everything the warehouse officer needs on one screen. */
  async prepareView(orderId: string, actor: Actor) {
    const o = await this.prisma.opsOrder.findUnique({
      where: { id: orderId },
      include: {
        customer: { select: { reference: true, name: true, phone: true, type: true } },
        lines: { include: { product: true, allocations: { include: { batch: { select: { reference: true, createdAt: true, riceVariety: true, grade: true } } } }, dispatchLines: { include: { dispatch: { select: { status: true } } } } } },
        dispatches: { orderBy: { createdAt: 'asc' }, include: { lines: true } },
      },
    });
    assertVisible(actor, o, 'Order');
    const lines: Record<string, unknown>[] = [];
    for (const l of o.lines) {
      const requiredKg = lineKg(l.product, l.quantity);
      const live = l.allocations.filter((a) => a.quantityKg - a.dispatchedKg - a.releasedKg > 0 || a.dispatchedKg > 0);
      const preparedKg = l.dispatchLines.filter((d) => d.dispatch.status === 'PREPARED').reduce((t, d) => t + d.quantityKg, 0);
      const allocatedKg = r3(l.allocations.reduce((t, a) => t + a.quantityKg - a.dispatchedKg - a.releasedKg, 0));
      // Batches of this product that could still be picked for the order.
      const batches = await this.prisma.stockBatch.findMany({ where: { ...scope(actor), productId: l.productId }, select: { id: true, reference: true, createdAt: true, riceVariety: true, grade: true, warehouseId: true } });
      const rows = await this.prisma.stockLedgerEntry.groupBy({ by: ['batchId', 'warehouseId'], where: { batchId: { in: batches.map((b) => b.id) } }, _sum: { quantityKg: true } });
      const candidates: Record<string, unknown>[] = [];
      for (const r of rows) {
        const bal = (await batchBalances(this.prisma, [r.batchId], r.warehouseId)).get(r.batchId)!;
        if (bal.availableKg > 0) candidates.push({ ...batches.find((b) => b.id === r.batchId)!, warehouseId: r.warehouseId, availableKg: bal.availableKg });
      }
      lines.push({
        id: l.id, product: { id: l.product.id, name: l.product.name, brand: l.product.brand, unit: l.product.unit, packSizeKg: l.product.packSizeKg }, quantity: l.quantity, requiredKg,
        dispatchedKg: l.dispatchedQty, allocatedKg, preparedKg: r3(preparedKg), outstandingKg: r3(Math.max(requiredKg - l.dispatchedQty, 0)),
        unallocatedKg: r3(Math.max(requiredKg - l.dispatchedQty - allocatedKg, 0)), allocations: live, candidates,
      });
    }
    return { id: o.id, reference: o.reference, customer: o.customer, fulfilState: o.fulfilState, paymentStatus: o.paymentStatus, status: o.status, deliveryMode: o.deliveryMode, deliveryNote: o.deliveryNote, notes: o.notes, shortageNote: o.shortageNote, lines, dispatches: o.dispatches };
  }

  private statusFor(lines: { required: number; dispatched: number; allocated: number }[]): 'ALLOCATED' | 'SHORTAGE' | 'PARTIALLY_DISPATCHED' | 'DISPATCHED' {
    const done = lines.every((l) => l.dispatched >= l.required - 0.0005);
    if (done) return 'DISPATCHED';
    const anyDispatched = lines.some((l) => l.dispatched > 0);
    const covered = lines.every((l) => l.dispatched + l.allocated >= l.required - 0.0005);
    if (anyDispatched) return 'PARTIALLY_DISPATCHED';
    return covered ? 'ALLOCATED' : 'SHORTAGE';
  }

  private async refreshState(tx: Tx, orderId: string) {
    const o = await tx.opsOrder.findUnique({ where: { id: orderId }, include: { lines: { include: { product: true, allocations: true } } } });
    const lines = o!.lines.map((l) => ({
      required: lineKg(l.product, l.quantity), dispatched: l.dispatchedQty, allocated: l.allocations.reduce((t, a) => t + a.quantityKg - a.dispatchedKg - a.releasedKg, 0),
    }));
    const state = this.statusFor(lines);
    await tx.opsOrder.update({ where: { id: orderId }, data: { fulfilState: state, ...(state === 'ALLOCATED' || state === 'DISPATCHED' ? { shortageNote: null } : {}) } });
    return { state, order: o! };
  }

  /** Reserves stock for the order. Stock set aside here cannot be sold, processed or allocated to another order. */
  async allocate(orderId: string, dto: AllocateDto, actor: User) {
    const result = await this.prisma.$transaction(async (tx) => {
      const order = await tx.opsOrder.findUnique({ where: { id: orderId }, include: { lines: { include: { product: true, allocations: true } } } });
      assertVisible(actor, order, 'Order');
      if (order.status !== 'INVOICED' || !(OPEN_STATES as readonly string[]).includes(order.fulfilState)) throw new ConflictException('This order has not been released to the warehouse');
      const wh = await tx.warehouse.findUnique({ where: { id: dto.warehouseId } });
      if (!wh || !wh.isActive) throw new NotFoundException('Warehouse not found');

      const picksByLine = new Map<string, { batchId: string; quantityKg: number }[]>();
      const shortages: string[] = [];
      if (dto.auto) {
        for (const l of order.lines) {
          const need = r3(lineKg(l.product, l.quantity) - l.dispatchedQty - l.allocations.reduce((t, a) => t + a.quantityKg - a.dispatchedKg - a.releasedKg, 0));
          if (need <= 0) continue;
          const batches = await tx.stockBatch.findMany({ where: { productId: l.productId, ...scope(actor) }, select: { id: true, createdAt: true } });
          const bal = await batchBalances(tx, batches.map((b) => b.id), dto.warehouseId);
          const sug = suggestAllocation(batches.map((b) => ({ batchId: b.id, createdAt: b.createdAt, availableKg: bal.get(b.id)!.availableKg })), need);
          picksByLine.set(l.id, sug.picks);
          if (sug.shortageKg > 0) shortages.push(`${l.product.name}: short by ${sug.shortageKg} kg`);
        }
      } else {
        for (const ln of dto.lines ?? []) picksByLine.set(ln.orderLineId, ln.picks);
      }
      const allBatchIds = [...picksByLine.values()].flat().map((p) => p.batchId);
      if (!allBatchIds.length && !shortages.length) throw new BadRequestException('Choose the batches to set aside');
      await lockBatches(tx, allBatchIds);
      const bal = await batchBalances(tx, allBatchIds, dto.warehouseId);
      const asked = new Map<string, number>();
      for (const [lineId, picks] of picksByLine) {
        const line = order.lines.find((l) => l.id === lineId);
        if (!line) throw new BadRequestException('A chosen line is not part of this order');
        const needed = r3(lineKg(line.product, line.quantity) - line.dispatchedQty - line.allocations.reduce((t, a) => t + a.quantityKg - a.dispatchedKg - a.releasedKg, 0));
        const total = r3(picks.reduce((t, p) => t + p.quantityKg, 0));
        if (total > needed + 0.0005) throw new BadRequestException(`${line.product.name}: you picked ${total} kg but only ${needed} kg is still needed`);
        for (const p of picks) {
          const batch = await tx.stockBatch.findUnique({ where: { id: p.batchId } });
          assertVisible(actor, batch, 'Batch');
          if (batch.productId !== line.productId) throw new BadRequestException(`Batch ${batch.reference} is not ${line.product.name}`);
          asked.set(p.batchId, (asked.get(p.batchId) ?? 0) + p.quantityKg);
          if ((asked.get(p.batchId) ?? 0) > (bal.get(p.batchId)?.availableKg ?? 0) + 0.0005)
            throw new ConflictException(`Batch ${batch.reference} has only ${bal.get(p.batchId)?.availableKg ?? 0} kg free at ${wh.name}`);
          await tx.orderAllocation.create({ data: { orderId, orderLineId: line.id, batchId: p.batchId, warehouseId: dto.warehouseId, quantityKg: p.quantityKg, createdByUserId: actor.id } });
        }
      }
      const { state } = await this.refreshState(tx, orderId);
      if (state === 'SHORTAGE') await tx.opsOrder.update({ where: { id: orderId }, data: { shortageNote: shortages.join('; ') || 'Not enough eligible stock to cover the whole order' } });
      await tx.opsOrderEvent.create({ data: { orderId, type: 'order.allocated', actorUserId: actor.id, note: state === 'SHORTAGE' ? `Shortage: ${shortages.join('; ')}` : 'Stock set aside' } });
      return { state, order, shortages };
    });
    if (result.state === 'SHORTAGE') {
      await this.notify.tellPermission('ops_payments', 'EDIT', result.order.mamcosId, { type: 'OPS_STOCK_SHORTAGE', title: 'Stock shortage on a paid order', body: `${result.order.reference}: ${result.shortages.join('; ') || 'not enough stock'}. Please decide how to resolve it.`, data: { orderId } }, [result.order.createdByUserId]);
    }
    return this.prepareView(orderId, actor);
  }

  async releaseAllocation(allocationId: string, actor: User) {
    await this.prisma.$transaction(async (tx) => {
      const a = await tx.orderAllocation.findUnique({ where: { id: allocationId }, include: { order: true } });
      assertVisible(actor, a?.order ?? null, 'Allocation');
      const prepared = await tx.opsDispatchLine.aggregate({ where: { orderLineId: a!.orderLineId, batchId: a!.batchId, dispatch: { status: 'PREPARED' } }, _sum: { quantityKg: true } });
      const free = r3(a!.quantityKg - a!.dispatchedKg - a!.releasedKg - (prepared._sum.quantityKg ?? 0));
      if (free <= 0) throw new ConflictException('Nothing is left to release; it is already prepared for a dispatch');
      await tx.orderAllocation.update({ where: { id: allocationId }, data: { releasedKg: a!.releasedKg + free } });
      await this.refreshState(tx, a!.orderId);
      await tx.opsOrderEvent.create({ data: { orderId: a!.orderId, type: 'order.allocation_released', actorUserId: actor.id, note: `${free} kg returned to stock` } });
    });
    return { ok: true };
  }

  /** The warehouse tells accounts it cannot fill the order; accounts and sales decide what happens next. */
  async reportShortage(orderId: string, note: string, actor: User) {
    if (!note.trim()) throw new BadRequestException('Say what is missing');
    const o = await this.prisma.opsOrder.findUnique({ where: { id: orderId } });
    assertVisible(actor, o, 'Order');
    if (o.status !== 'INVOICED' || !(OPEN_STATES as readonly string[]).includes(o.fulfilState)) throw new ConflictException('This order is not with the warehouse');
    await this.prisma.$transaction(async (tx) => {
      await tx.opsOrder.update({ where: { id: orderId }, data: { fulfilState: 'SHORTAGE', shortageNote: note.trim() } });
      await tx.opsOrderEvent.create({ data: { orderId, type: 'order.shortage', actorUserId: actor.id, note: note.trim() } });
    });
    await this.notify.tellPermission('ops_payments', 'EDIT', o.mamcosId, { type: 'OPS_STOCK_SHORTAGE', title: 'Stock shortage reported', body: `${o.reference}: ${note.trim()}`, data: { orderId } }, [o.createdByUserId]);
    return this.prepareView(orderId, actor);
  }

  /** Accounts close an order short after part-delivery. The refund still owed is worked out and shown, not paid out here. */
  async closeShort(orderId: string, reason: string, actor: User) {
    if (!reason.trim()) throw new BadRequestException('Give the reason');
    const out = await this.prisma.$transaction(async (tx) => {
      const o = await tx.opsOrder.findUnique({ where: { id: orderId }, include: { lines: { include: { product: true } } } });
      assertVisible(actor, o, 'Order');
      if (!['PARTIALLY_DISPATCHED', 'SHORTAGE'].includes(o.fulfilState) || o.status !== 'INVOICED') throw new ConflictException('Only a part-delivered or short order can be closed short');
      if (!o.lines.some((l) => l.dispatchedQty > 0)) throw new ConflictException('Nothing has been delivered; cancel the order instead');
      const delivered = o.lines.reduce((t, l) => t + l.lineTotal * Math.min(l.dispatchedQty / Math.max(lineKg(l.product, l.quantity), 0.001), 1), 0);
      const refundDue = Math.max(Math.round((o.amountPaid - delivered) * 100) / 100, 0);
      const allocs = await tx.orderAllocation.findMany({ where: { orderId } });
      for (const a of allocs) {
        const free = a.quantityKg - a.dispatchedKg - a.releasedKg;
        if (free > 0) await tx.orderAllocation.update({ where: { id: a.id }, data: { releasedKg: a.releasedKg + free } });
      }
      await tx.opsOrder.update({ where: { id: orderId }, data: { status: 'COMPLETED', fulfilState: 'DISPATCHED', shortageNote: `Closed short: ${reason.trim()}` } });
      await tx.opsOrderEvent.create({ data: { orderId, type: 'order.closed_short', actorUserId: actor.id, note: `${reason.trim()} (refund due about TZS ${refundDue.toLocaleString()})` } });
      return { refundDue };
    });
    return { ...out, order: await this.prepareView(orderId, actor) };
  }

  // ---------- dispatch ----------

  dispatches(actor: Actor, f: { status?: string; orderId?: string; q?: string; from?: string; to?: string } = {}) {
    const to = f.to ? new Date(f.to) : undefined;
    if (to) to.setHours(23, 59, 59, 999);
    return this.prisma.opsDispatch.findMany({
      where: {
        ...scope(actor), ...(f.status ? { status: f.status as never } : {}), ...(f.orderId ? { orderId: f.orderId } : {}),
        ...(f.from || to ? { dispatchAt: { ...(f.from ? { gte: new Date(f.from) } : {}), ...(to ? { lte: to } : {}) } } : {}),
        ...(f.q ? { OR: [{ reference: { contains: f.q, mode: 'insensitive' } }, { releaseNoteNumber: { contains: f.q, mode: 'insensitive' } }, { vehiclePlate: { contains: f.q, mode: 'insensitive' } }, { order: { reference: { contains: f.q, mode: 'insensitive' } } }] } : {}),
      },
      include: { order: { select: { reference: true, customer: { select: { name: true } } } }, lines: { select: { quantityKg: true } } },
      orderBy: { createdAt: 'desc' },
      take: 300,
    });
  }

  async dispatch(id: string, actor: Actor) {
    const d = await this.prisma.opsDispatch.findUnique({
      where: { id },
      include: {
        order: { include: { customer: true } },
        warehouse: { select: { name: true, location: true } },
        lines: { include: { batch: { select: { reference: true, riceVariety: true, grade: true } }, orderLine: { include: { product: { select: { name: true, brand: true, unit: true, packSizeKg: true } } } } } },
      },
    });
    assertVisible(actor, d, 'Dispatch');
    return d;
  }

  /** Records the load and vehicle and prepares the release note. No stock moves yet: that happens when the goods actually leave. */
  async prepare(orderId: string, dto: PrepareDispatchDto, actor: User) {
    const created = await this.prisma.$transaction(async (tx) => {
      const order = await tx.opsOrder.findUnique({ where: { id: orderId }, include: { lines: { include: { product: true, allocations: true } } } });
      assertVisible(actor, order, 'Order');
      if (order.status !== 'INVOICED' || !(OPEN_STATES as readonly string[]).includes(order.fulfilState)) throw new ConflictException('This order has not been released to the warehouse');
      const wh = await tx.warehouse.findUnique({ where: { id: dto.warehouseId } });
      if (!wh || !wh.isActive) throw new NotFoundException('Warehouse not found');
      const want = new Map<string, number>();
      for (const l of dto.lines) {
        const line = order.lines.find((x) => x.id === l.orderLineId);
        if (!line) throw new BadRequestException('A chosen line is not part of this order');
        const key = `${l.orderLineId}|${l.batchId}`;
        want.set(key, r3((want.get(key) ?? 0) + l.quantityKg));
      }
      for (const [key, qty] of want) {
        const [lineId, batchId] = key.split('|');
        const line = order.lines.find((x) => x.id === lineId)!;
        const reserved = r3(line.allocations.filter((a) => a.batchId === batchId && a.warehouseId === dto.warehouseId).reduce((t, a) => t + a.quantityKg - a.dispatchedKg - a.releasedKg, 0));
        const prepared = await tx.opsDispatchLine.aggregate({ where: { orderLineId: lineId, batchId, dispatch: { status: 'PREPARED' } }, _sum: { quantityKg: true } });
        const free = r3(reserved - (prepared._sum.quantityKg ?? 0));
        if (qty > free + 0.0005) throw new ConflictException(`${line.product.name}: only ${free} kg of that batch is set aside for loading. Allocate stock first.`);
      }
      // A load cannot exceed what is still owed on the line.
      for (const line of order.lines) {
        const loading = [...want.entries()].filter(([k]) => k.startsWith(`${line.id}|`)).reduce((t, [, q]) => t + q, 0);
        if (!loading) continue;
        const prepared = await tx.opsDispatchLine.aggregate({ where: { orderLineId: line.id, dispatch: { status: 'PREPARED' } }, _sum: { quantityKg: true } });
        const outstanding = r3(lineKg(line.product, line.quantity) - line.dispatchedQty - (prepared._sum.quantityKg ?? 0));
        if (loading > outstanding + 0.0005) throw new ConflictException(`${line.product.name}: only ${outstanding} kg is still to be delivered`);
      }
      const invoice = await tx.opsInvoice.findFirst({ where: { orderId, status: { not: 'VOID' } }, select: { id: true } });
      const d = await tx.opsDispatch.create({
        data: {
          mamcosId: order.mamcosId, reference: await nextRef(tx, 'DSP'), orderId, invoiceId: invoice?.id ?? null, warehouseId: dto.warehouseId,
          vehiclePlate: dto.vehiclePlate.trim().toUpperCase(), driverName: dto.driverName.trim(), driverPhone: dto.driverPhone?.trim() || null, transporter: dto.transporter?.trim() || null,
          dispatchAt: dto.dispatchAt ? new Date(dto.dispatchAt) : new Date(), releasingOfficerId: actor.id, supervisorUserId: dto.supervisorUserId ?? null, supervisorName: dto.supervisorName?.trim() || null,
          destination: dto.destination?.trim() || order.deliveryNote || null, notes: dto.notes?.trim() || null, attachments: dto.attachments ?? [],
          releaseNoteNumber: await nextRef(tx, 'RN'), shareToken: randomBytes(24).toString('hex'),
          lines: { create: dto.lines.map((l) => ({ orderLineId: l.orderLineId, productId: order.lines.find((x) => x.id === l.orderLineId)!.productId, batchId: l.batchId, quantityKg: l.quantityKg, packages: l.packages ?? null })) },
        },
      });
      await tx.opsOrderEvent.create({ data: { orderId, type: 'dispatch.prepared', actorUserId: actor.id, note: `${d.reference} · ${d.vehiclePlate}` } });
      return d;
    });
    return this.dispatch(created.id, actor);
  }

  /**
   * The goods have left. The first call claims the dispatch and deducts stock in the same transaction;
   * a repeated call finds it already released and changes nothing.
   */
  async release(id: string, actor: User) {
    const out = await this.prisma.$transaction(async (tx) => {
      const d = await tx.opsDispatch.findUnique({ where: { id }, include: { lines: true, order: { include: { lines: { include: { product: true } } } } } });
      assertVisible(actor, d, 'Dispatch');
      if (d.status === 'RELEASED') return { already: true as const, d };
      if (d.status !== 'PREPARED') throw new ConflictException('This dispatch was cancelled');
      const o = d.order;
      if (o.status !== 'INVOICED' || !(OPEN_STATES as readonly string[]).includes(o.fulfilState)) throw new ConflictException('This order is no longer released for dispatch');
      const claimed = await tx.opsDispatch.updateMany({ where: { id, status: 'PREPARED' }, data: { status: 'RELEASED', releasedAt: new Date(), releasingOfficerId: actor.id } });
      if (!claimed.count) return { already: true as const, d };
      const batchIds = d.lines.map((l) => l.batchId);
      await lockBatches(tx, batchIds);
      const bal = await batchBalances(tx, batchIds, d.warehouseId);
      const perBatch = new Map<string, number>();
      for (const l of d.lines) perBatch.set(l.batchId, r3((perBatch.get(l.batchId) ?? 0) + l.quantityKg));
      for (const [batchId, qty] of perBatch) {
        if (qty > (bal.get(batchId)?.physicalKg ?? 0) + 0.0005) throw new ConflictException('The stock is not physically there any more. Recount the batch before releasing.');
      }
      for (const [batchId, qty] of perBatch) {
        await tx.stockLedgerEntry.create({ data: { batchId, warehouseId: d.warehouseId, type: 'DISPATCH', quantityKg: -qty, refType: 'dispatch', refId: d.id, createdByUserId: actor.id } });
      }
      for (const l of d.lines) {
        // Take the quantity off the oldest reservation for this line and batch first.
        let left = l.quantityKg;
        const allocs = await tx.orderAllocation.findMany({ where: { orderLineId: l.orderLineId, batchId: l.batchId, warehouseId: d.warehouseId }, orderBy: { createdAt: 'asc' } });
        for (const a of allocs) {
          const room = a.quantityKg - a.dispatchedKg - a.releasedKg;
          const take = r3(Math.min(room, left));
          if (take > 0) { await tx.orderAllocation.update({ where: { id: a.id }, data: { dispatchedKg: a.dispatchedKg + take } }); left = r3(left - take); }
          if (left <= 0) break;
        }
        await tx.opsOrderLine.update({ where: { id: l.orderLineId }, data: { dispatchedQty: { increment: l.quantityKg } } });
      }
      const { state, order } = await this.refreshState(tx, o.id);
      const completes = state === 'DISPATCHED' && order.paymentStatus === 'PAID';
      if (completes) await tx.opsOrder.update({ where: { id: o.id }, data: { status: 'COMPLETED' } });
      await tx.opsOrderEvent.create({ data: { orderId: o.id, type: 'dispatch.released', actorUserId: actor.id, fromStatus: o.fulfilState, toStatus: state, note: `${d.reference} · ${d.releaseNoteNumber}` } });
      return { already: false as const, d, state };
    });
    if (!out.already) {
      await this.notify.tellPermission('ops_payments', 'VIEW', out.d.mamcosId, { type: 'OPS_GOODS_DISPATCHED', title: 'Goods dispatched', body: `${out.d.reference} left the warehouse (${out.d.vehiclePlate}).`, data: { dispatchId: id, orderId: out.d.orderId } }, [out.d.order.createdByUserId]);
    }
    return this.dispatch(id, actor);
  }

  async cancel(id: string, reason: string, actor: User) {
    if (!reason.trim()) throw new BadRequestException('Give the reason for cancelling');
    const claimed = await this.prisma.opsDispatch.updateMany({ where: { id, status: 'PREPARED', ...scope(actor) }, data: { status: 'CANCELLED', cancelReason: reason.trim() } });
    if (!claimed.count) throw new ConflictException('Only a dispatch that has not left can be cancelled');
    return this.dispatch(id, actor);
  }

  /** Proof of delivery. An exception is reported to accounts and sales straight away. */
  async delivery(id: string, dto: DeliveryDto, actor: User) {
    const d = await this.prisma.opsDispatch.findUnique({ where: { id }, include: { order: true } });
    assertVisible(actor, d, 'Dispatch');
    if (d.status !== 'RELEASED') throw new ConflictException('Only released goods can be marked delivered');
    if (dto.state === 'DELIVERED' && !dto.receivedBy?.trim()) throw new BadRequestException('Write the name of the person who received the goods');
    if (dto.state === 'EXCEPTION' && !dto.note?.trim()) throw new BadRequestException('Describe the problem');
    await this.prisma.$transaction(async (tx) => {
      await tx.opsDispatch.update({ where: { id }, data: { deliveryState: dto.state, deliveredAt: dto.state === 'DELIVERED' ? new Date() : null, receivedBy: dto.receivedBy?.trim() || null, deliveryNote: dto.note?.trim() || null } });
      await tx.opsOrderEvent.create({ data: { orderId: d.orderId, type: dto.state === 'DELIVERED' ? 'dispatch.delivered' : 'dispatch.exception', actorUserId: actor.id, note: `${d.reference}: ${dto.note ?? dto.receivedBy ?? ''}` } });
    });
    if (dto.state === 'EXCEPTION') {
      await this.notify.tellPermission('ops_payments', 'VIEW', d.mamcosId, { type: 'OPS_DELIVERY_EXCEPTION', title: 'Delivery problem', body: `${d.reference}: ${dto.note}`, data: { dispatchId: id } }, [d.order.createdByUserId]);
    }
    return this.dispatch(id, actor);
  }
}

