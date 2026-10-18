import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { Actor, assertVisible, batchBalances, nextRef, owner, OpsNotifyService, scope, Tx } from './ops-common';
import { canMoveOrder, documentTotals, lineTotals, r3 } from './ops-rules';
import { CatalogService } from './catalog.service';
import { CreateOrderDto, CreateQuotationDto, DocLineDto, ReviewOrderDto, UpdateOrderDto } from './dto/commercial.dto';

type User = Actor & { id: string };

/** Kilograms behind a quantity: bagged products are counted in packs, everything else in kg. */
export const lineKg = (p: { unit: string; packSizeKg: number | null }, quantity: number) => r3(p.unit !== 'kg' && p.packSizeKg ? quantity * p.packSizeKg : quantity);

@Injectable()
export class SalesOpsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalog: CatalogService,
    private readonly notify: OpsNotifyService,
  ) {}

  // ---------- stock a salesperson may promise ----------

  /** Free-to-sell kilograms of each product across the warehouses this user can see. */
  async availability(actor: Actor, productIds: string[]) {
    const batches = await this.prisma.stockBatch.findMany({ where: { ...scope(actor), productId: { in: productIds } }, select: { id: true, productId: true } });
    const rows = await this.prisma.stockLedgerEntry.groupBy({ by: ['batchId', 'warehouseId'], where: { batchId: { in: batches.map((b) => b.id) } }, _sum: { quantityKg: true } });
    const out = new Map<string, number>();
    for (const r of rows) {
      const bal = (await batchBalances(this.prisma, [r.batchId], r.warehouseId)).get(r.batchId)!;
      const pid = batches.find((b) => b.id === r.batchId)!.productId;
      out.set(pid, r3((out.get(pid) ?? 0) + Math.max(bal.availableKg, 0)));
    }
    return out;
  }

  private async buildLines(lines: DocLineDto[], actor: Actor) {
    if (!lines.length) throw new BadRequestException('Add at least one product');
    const products = new Map((await this.prisma.product.findMany({ where: { id: { in: lines.map((l) => l.productId) }, ...scope(actor) } })).map((p) => [p.id, p]));
    const built = lines.map((l) => {
      const p = products.get(l.productId);
      if (!p || !p.isActive) throw new NotFoundException('A chosen product was not found or is inactive');
      const unitPrice = l.unitPrice ?? p.unitPrice;
      if (unitPrice == null) throw new BadRequestException(`Enter a price for ${p.name}`);
      const t = lineTotals({ quantity: l.quantity, unitPrice, discountPercent: l.discountPercent, taxRatePercent: p.taxRatePercent });
      return { productId: p.id, quantity: l.quantity, unitPrice, discountPercent: l.discountPercent ?? 0, taxRatePercent: p.taxRatePercent, lineTotal: t.total };
    });
    return { built, totals: documentTotals(built) };
  }

  private docInclude = {
    customer: { select: { id: true, reference: true, name: true, type: true, phone: true } },
    lines: { include: { product: { select: { name: true, brand: true, unit: true, packSizeKg: true, code: true } } } },
  } satisfies Prisma.QuotationInclude;

  // ---------- quotations ----------

  quotations(actor: Actor, f: { status?: string; customerId?: string; q?: string } = {}) {
    return this.prisma.quotation.findMany({
      where: {
        ...scope(actor),
        ...(f.status ? { status: f.status as never } : {}),
        ...(f.customerId ? { customerId: f.customerId } : {}),
        ...(f.q ? { OR: [{ reference: { contains: f.q, mode: 'insensitive' } }, { customer: { name: { contains: f.q, mode: 'insensitive' } } }] } : {}),
      },
      include: { customer: { select: { reference: true, name: true } }, order: { select: { id: true, reference: true } } },
      orderBy: { createdAt: 'desc' },
      take: 300,
    });
  }

  async quotation(id: string, actor: Actor) {
    const q = await this.prisma.quotation.findUnique({ where: { id }, include: { ...this.docInclude, order: { select: { id: true, reference: true } } } });
    assertVisible(actor, q, 'Quotation');
    const avail = await this.availability(actor, q.lines.map((l) => l.productId));
    return { ...q, lines: q.lines.map((l) => ({ ...l, availableKg: avail.get(l.productId) ?? 0, requiredKg: lineKg(l.product, l.quantity) })) };
  }

  async createQuotation(dto: CreateQuotationDto, actor: User) {
    await this.catalog.requireCustomer(dto.customerId, actor);
    const { built, totals } = await this.buildLines(dto.lines, actor);
    const q = await this.prisma.$transaction(async (tx) =>
      tx.quotation.create({
        data: {
          mamcosId: owner(actor), reference: await nextRef(tx, 'QT'), customerId: dto.customerId, validUntil: dto.validUntil ? new Date(dto.validUntil) : null,
          deliveryMode: dto.deliveryMode, deliveryNote: dto.deliveryNote, notes: dto.notes, createdByUserId: actor.id, ...totals,
          lines: { create: built },
        },
      }),
    );
    return this.quotation(q.id, actor);
  }

  async updateQuotation(id: string, dto: CreateQuotationDto, actor: User) {
    const q = await this.prisma.quotation.findUnique({ where: { id } });
    assertVisible(actor, q, 'Quotation');
    if (!['DRAFT', 'SENT'].includes(q.status)) throw new ConflictException('This quotation can no longer be changed');
    const { built, totals } = await this.buildLines(dto.lines, actor);
    await this.prisma.$transaction(async (tx) => {
      await tx.quotationLine.deleteMany({ where: { quotationId: id } });
      await tx.quotation.update({ where: { id }, data: { validUntil: dto.validUntil ? new Date(dto.validUntil) : null, deliveryMode: dto.deliveryMode, deliveryNote: dto.deliveryNote, notes: dto.notes, ...totals, lines: { create: built } } });
    });
    return this.quotation(id, actor);
  }

  async setQuotationStatus(id: string, status: 'SENT' | 'ACCEPTED' | 'CANCELLED', actor: User) {
    const q = await this.prisma.quotation.findUnique({ where: { id } });
    assertVisible(actor, q, 'Quotation');
    const allowed: Record<string, string[]> = { DRAFT: ['SENT', 'ACCEPTED', 'CANCELLED'], SENT: ['ACCEPTED', 'CANCELLED'], ACCEPTED: ['CANCELLED'] };
    if (!allowed[q.status]?.includes(status)) throw new ConflictException(`A ${q.status.toLowerCase()} quotation cannot become ${status.toLowerCase()}`);
    await this.prisma.quotation.update({ where: { id }, data: { status } });
    return this.quotation(id, actor);
  }

  // ---------- orders ----------

  private async event(tx: Tx, orderId: string, type: string, actorUserId: string | null, fromStatus: string | null, toStatus: string | null, note?: string | null) {
    await tx.opsOrderEvent.create({ data: { orderId, type, actorUserId, fromStatus, toStatus, note: note ?? null } });
  }

  async createOrder(dto: CreateOrderDto, actor: User) {
    await this.catalog.requireCustomer(dto.customerId, actor);
    let quotationId: string | null = null;
    if (dto.quotationId) {
      const q = await this.prisma.quotation.findUnique({ where: { id: dto.quotationId } });
      assertVisible(actor, q, 'Quotation');
      if (q.customerId !== dto.customerId) throw new BadRequestException('That quotation is for a different customer');
      if (['CONVERTED', 'CANCELLED'].includes(q.status)) throw new ConflictException('That quotation is closed');
      quotationId = q.id;
    }
    const { built, totals } = await this.buildLines(dto.lines, actor);
    const order = await this.prisma.$transaction(async (tx) => {
      const o = await tx.opsOrder.create({
        data: {
          mamcosId: owner(actor), reference: await nextRef(tx, 'ORD'), customerId: dto.customerId, quotationId, deliveryMode: dto.deliveryMode, deliveryNote: dto.deliveryNote,
          notes: dto.notes, createdByUserId: actor.id, ...totals, lines: { create: built },
        },
      });
      if (quotationId) await tx.quotation.update({ where: { id: quotationId }, data: { status: 'CONVERTED' } });
      await this.event(tx, o.id, 'order.created', actor.id, null, 'PENDING_ACCOUNTS_REVIEW', quotationId ? 'From a quotation' : null);
      return o;
    });
    await this.notify.tellPermission('ops_review', 'EDIT', order.mamcosId, { type: 'OPS_ORDER_REVIEW', title: 'New order to review', body: `${order.reference} is waiting for accounts review.`, data: { orderId: order.id } });
    return this.order(order.id, actor);
  }

  list(actor: Actor, f: { status?: string; paymentStatus?: string; fulfilState?: string; customerId?: string; q?: string; from?: string; to?: string } = {}) {
    const to = f.to ? new Date(f.to) : undefined;
    if (to) to.setHours(23, 59, 59, 999);
    return this.prisma.opsOrder.findMany({
      where: {
        ...scope(actor),
        ...(f.status ? { status: f.status as never } : {}), ...(f.paymentStatus ? { paymentStatus: f.paymentStatus as never } : {}),
        ...(f.fulfilState ? { fulfilState: f.fulfilState as never } : {}), ...(f.customerId ? { customerId: f.customerId } : {}),
        ...(f.from || to ? { createdAt: { ...(f.from ? { gte: new Date(f.from) } : {}), ...(to ? { lte: to } : {}) } } : {}),
        ...(f.q ? { OR: [{ reference: { contains: f.q, mode: 'insensitive' } }, { customer: { name: { contains: f.q, mode: 'insensitive' } } }, { invoices: { some: { invoiceNumber: { contains: f.q, mode: 'insensitive' } } } }] } : {}),
      },
      include: { customer: { select: { reference: true, name: true, phone: true } }, invoices: { where: { status: { not: 'VOID' } }, select: { invoiceNumber: true, id: true } } },
      orderBy: { createdAt: 'desc' },
      take: 400,
    });
  }

  async order(id: string, actor: Actor) {
    const o = await this.prisma.opsOrder.findUnique({
      where: { id },
      include: {
        customer: true,
        lines: { include: { product: { select: { name: true, brand: true, unit: true, packSizeKg: true, code: true } }, allocations: true }, orderBy: { id: 'asc' } },
        events: { orderBy: { createdAt: 'asc' } },
        invoices: { include: { payments: { orderBy: { createdAt: 'asc' } } }, orderBy: { createdAt: 'desc' } },
        dispatches: { select: { id: true, reference: true, status: true, releaseNoteNumber: true, releasedAt: true, vehiclePlate: true, deliveryState: true }, orderBy: { createdAt: 'asc' } },
      },
    });
    assertVisible(actor, o, 'Order');
    const avail = await this.availability(actor, o.lines.map((l) => l.productId));
    const names = new Map((await this.prisma.user.findMany({ where: { id: { in: [...new Set([o.createdByUserId, o.reviewedByUserId, o.authorizedByUserId, ...o.events.map((e) => e.actorUserId)].filter((x): x is string => !!x))] } }, select: { id: true, firstName: true, lastName: true } })).map((u) => [u.id, `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim()]));
    return {
      ...o,
      createdByName: names.get(o.createdByUserId) ?? null,
      reviewedByName: o.reviewedByUserId ? names.get(o.reviewedByUserId) ?? null : null,
      authorizedByName: o.authorizedByUserId ? names.get(o.authorizedByUserId) ?? null : null,
      events: o.events.map((e) => ({ ...e, actorName: e.actorUserId ? names.get(e.actorUserId) ?? null : null })),
      lines: o.lines.map((l) => {
        const requiredKg = lineKg(l.product, l.quantity);
        const allocatedKg = r3(l.allocations.reduce((t, a) => t + a.quantityKg - a.releasedKg, 0));
        return { ...l, requiredKg, allocatedKg, outstandingKg: r3(Math.max(requiredKg - l.dispatchedQty, 0)), availableKg: avail.get(l.productId) ?? 0 };
      }),
      outstandingValue: Math.round((o.total - o.amountPaid) * 100) / 100,
    };
  }

  async updateOrder(id: string, dto: UpdateOrderDto, actor: User) {
    const o = await this.prisma.opsOrder.findUnique({ where: { id } });
    assertVisible(actor, o, 'Order');
    if (o.status !== 'RETURNED_TO_SALES') throw new ConflictException('An order can only be corrected after accounts return it');
    const patch: Prisma.OpsOrderUpdateInput = { deliveryMode: dto.deliveryMode, deliveryNote: dto.deliveryNote, notes: dto.notes };
    await this.prisma.$transaction(async (tx) => {
      if (dto.lines) {
        const { built, totals } = await this.buildLines(dto.lines, actor);
        await tx.opsOrderLine.deleteMany({ where: { orderId: id } });
        Object.assign(patch, totals, { lines: { create: built } });
      }
      await tx.opsOrder.update({ where: { id }, data: patch });
    });
    return this.order(id, actor);
  }

  /** Sends a corrected order back to accounts. */
  async resubmit(id: string, actor: User) {
    const result = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.opsOrder.updateMany({ where: { id, status: 'RETURNED_TO_SALES', ...scope(actor) }, data: { status: 'PENDING_ACCOUNTS_REVIEW', reviewDecision: null } });
      if (!claimed.count) throw new ConflictException('Only a returned order can be sent back to accounts');
      await this.event(tx, id, 'order.resubmitted', actor.id, 'RETURNED_TO_SALES', 'PENDING_ACCOUNTS_REVIEW');
      return tx.opsOrder.findUnique({ where: { id } });
    });
    await this.notify.tellPermission('ops_review', 'EDIT', result!.mamcosId, { type: 'OPS_ORDER_REVIEW', title: 'Corrected order to review', body: `${result!.reference} was corrected and is waiting again.`, data: { orderId: id } });
    return this.order(id, actor);
  }

  /** Accounts approve the order for invoicing or send it back with a reason. The creator cannot review their own order. */
  async review(id: string, dto: ReviewOrderDto, actor: User & { role?: string }) {
    const o = await this.prisma.opsOrder.findUnique({ where: { id } });
    assertVisible(actor, o, 'Order');
    if (o.createdByUserId === actor.id && actor.role !== 'SUPER_ADMIN') throw new ConflictException('You cannot review an order you created');
    const to = dto.decision === 'APPROVE' ? 'APPROVED_FOR_INVOICING' : 'RETURNED_TO_SALES';
    if (dto.decision === 'RETURN' && !dto.comment?.trim()) throw new BadRequestException('Say what sales needs to correct');
    if (!canMoveOrder(o.status, to) || o.status !== 'PENDING_ACCOUNTS_REVIEW') throw new ConflictException('This order is not waiting for review');
    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.opsOrder.updateMany({
        where: { id, status: 'PENDING_ACCOUNTS_REVIEW' },
        data: { status: to, reviewedByUserId: actor.id, reviewDecision: dto.decision, reviewComment: dto.comment?.trim() || null, reviewedAt: new Date() },
      });
      if (!claimed.count) throw new ConflictException('This order has just been reviewed by someone else');
      await this.event(tx, id, dto.decision === 'APPROVE' ? 'order.approved' : 'order.returned', actor.id, o.status, to, dto.comment);
    });
    await this.notify.tell([o.createdByUserId], {
      type: dto.decision === 'APPROVE' ? 'OPS_ORDER_APPROVED' : 'OPS_ORDER_RETURNED',
      title: dto.decision === 'APPROVE' ? 'Order approved for invoicing' : 'Order returned for correction',
      body: `${o.reference}${dto.comment ? `: ${dto.comment}` : ''}`, data: { orderId: id },
    });
    return this.order(id, actor);
  }

  async cancel(id: string, reason: string, actor: User) {
    if (!reason.trim()) throw new BadRequestException('Give the reason for cancelling');
    await this.prisma.$transaction(async (tx) => {
      const o = await tx.opsOrder.findUnique({ where: { id }, include: { invoices: true, dispatches: true } });
      assertVisible(actor, o, 'Order');
      if (['CANCELLED', 'COMPLETED'].includes(o.status)) throw new ConflictException('This order is already closed');
      if (o.amountPaid > 0) throw new ConflictException('This order has payments recorded; ask accounts to settle them first');
      if (o.dispatches.some((d) => d.status === 'RELEASED' || d.status === 'PREPARED')) throw new ConflictException('Goods have already been prepared or released for this order');
      await tx.opsOrder.update({ where: { id }, data: { status: 'CANCELLED', fulfilState: 'NOT_AUTHORIZED' } });
      await tx.opsInvoice.updateMany({ where: { orderId: id, status: { not: 'VOID' } }, data: { status: 'VOID', voidReason: `Order cancelled: ${reason.trim()}` } });
      // Stock set aside for this order goes back on sale.
      const allocs = await tx.orderAllocation.findMany({ where: { orderId: id } });
      for (const a of allocs) {
        const free = a.quantityKg - a.dispatchedKg - a.releasedKg;
        if (free > 0) await tx.orderAllocation.update({ where: { id: a.id }, data: { releasedKg: a.releasedKg + free } });
      }
      await this.event(tx, id, 'order.cancelled', actor.id, o.status, 'CANCELLED', reason);
    });
    return this.order(id, actor);
  }
}
