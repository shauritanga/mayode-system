import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { createHmac, timingSafeEqual } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { ClickPesaService } from '../payments/clickpesa.service';
import { hasGrant } from '../auth/role-access';
import type { RequestUser } from '../common/ownership.service';
import { Actor, assertVisible, nextRef, OpsNotifyService, scope, Tx } from './ops-common';
import { paymentState, r2 } from './ops-rules';
import { AuthorizeDto, ControlNumberDto, IssueInvoiceDto, MobilePaymentDto, RecordPaymentDto } from './dto/commercial.dto';

type User = Actor & { id: string };
const TOLERANCE = 0.005;

/** Keys sorted at every level, so the same payload always produces the same signature input. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value as object).sort().map((k) => `${JSON.stringify(k)}:${canonicalJson((value as Record<string, unknown>)[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function verifySignature(secret: string, body: unknown, signature: string | undefined): boolean {
  if (!signature) return false;
  const expected = createHmac('sha256', secret).update(canonicalJson(body)).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(signature.trim().toLowerCase());
  return a.length === b.length && timingSafeEqual(a, b);
}

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly clickPesa: ClickPesaService,
    private readonly notify: OpsNotifyService,
  ) {}

  // ---------- invoices ----------

  async invoices(actor: Actor, f: { status?: string; orderId?: string; customerId?: string; q?: string; outstanding?: string } = {}) {
    const rows = await this.prisma.opsInvoice.findMany({
      where: {
        ...scope(actor),
        ...(f.status ? { status: f.status as never } : {}), ...(f.orderId ? { orderId: f.orderId } : {}), ...(f.customerId ? { customerId: f.customerId } : {}),
        ...(f.outstanding === 'true' ? { status: { in: ['ISSUED', 'PARTIALLY_PAID'] } } : {}),
        ...(f.q ? { OR: [{ invoiceNumber: { contains: f.q, mode: 'insensitive' } }, { customerName: { contains: f.q, mode: 'insensitive' } }, { controlNumber: { contains: f.q } }] } : {}),
      },
      include: { order: { select: { reference: true } } },
      orderBy: { createdAt: 'desc' },
      take: 400,
    });
    const now = Date.now();
    return rows.map((i) => ({ ...i, balance: r2(i.total - i.amountPaid), overdue: !!i.dueDate && i.dueDate.getTime() < now && ['ISSUED', 'PARTIALLY_PAID'].includes(i.status) }));
  }

  async invoice(id: string, actor: Actor) {
    const i = await this.prisma.opsInvoice.findUnique({ where: { id }, include: { lines: true, payments: { orderBy: { createdAt: 'asc' } }, order: { select: { reference: true, status: true, paymentStatus: true, fulfilState: true } } } });
    assertVisible(actor, i, 'Invoice');
    return { ...i, balance: r2(i.total - i.amountPaid) };
  }

  async issueInvoice(orderId: string, dto: IssueInvoiceDto, actor: User) {
    const inv = await this.prisma.$transaction(async (tx) => {
      const o = await tx.opsOrder.findUnique({ where: { id: orderId }, include: { customer: true, lines: { include: { product: true } } } });
      assertVisible(actor, o, 'Order');
      if (o.status !== 'APPROVED_FOR_INVOICING') throw new ConflictException('Only an order approved for invoicing can be invoiced');
      const existing = await tx.opsInvoice.count({ where: { orderId, status: { not: 'VOID' } } });
      if (existing) throw new ConflictException('This order already has an invoice');
      const c = o.customer;
      const invoice = await tx.opsInvoice.create({
        data: {
          mamcosId: o.mamcosId, invoiceNumber: await nextRef(tx, 'INV'), orderId, customerId: c.id, customerName: c.name,
          customerDetails: { reference: c.reference, type: c.type, phone: c.phone, email: c.email, address: c.billingAddress ?? c.address, tin: c.tin, vrn: c.vrn, contactPerson: c.contactPerson, businessRegNo: c.businessRegNo, idNumber: c.idNumber },
          subtotal: o.subtotal, discountTotal: o.discountTotal, taxTotal: o.taxTotal, total: o.total,
          dueDate: dto.dueDate ? new Date(dto.dueDate) : new Date(Date.now() + 7 * 86_400_000), paymentInstructions: dto.paymentInstructions?.trim() || null, issuedByUserId: actor.id,
          lines: { create: o.lines.map((l) => ({ description: l.product.name, brand: l.product.brand, quantity: l.quantity, unit: l.product.unit, unitPrice: l.unitPrice, discountPercent: l.discountPercent, taxRatePercent: l.taxRatePercent, lineTotal: l.lineTotal })) },
        },
      });
      await tx.opsOrder.update({ where: { id: orderId }, data: { status: 'INVOICED' } });
      await tx.opsOrderEvent.create({ data: { orderId, type: 'invoice.issued', actorUserId: actor.id, fromStatus: o.status, toStatus: 'INVOICED', note: invoice.invoiceNumber } });
      return { invoice, order: o };
    });
    await this.notify.tell([inv.order.createdByUserId], { type: 'OPS_INVOICE_ISSUED', title: 'Invoice generated', body: `${inv.invoice.invoiceNumber} for ${inv.order.reference} is ready to share with the customer.`, data: { invoiceId: inv.invoice.id, orderId } });
    return this.invoice(inv.invoice.id, actor);
  }

  async voidInvoice(id: string, reason: string, actor: User) {
    if (!reason.trim()) throw new BadRequestException('Give the reason for voiding the invoice');
    await this.prisma.$transaction(async (tx) => {
      const i = await tx.opsInvoice.findUnique({ where: { id } });
      assertVisible(actor, i, 'Invoice');
      if (i.amountPaid > 0) throw new ConflictException('Payments are recorded against this invoice, so it cannot be voided');
      const claimed = await tx.opsInvoice.updateMany({ where: { id, status: { not: 'VOID' } }, data: { status: 'VOID', voidReason: reason.trim() } });
      if (!claimed.count) throw new ConflictException('This invoice is already void');
      await tx.opsOrder.updateMany({ where: { id: i.orderId, status: 'INVOICED' }, data: { status: 'APPROVED_FOR_INVOICING', fulfilState: 'NOT_AUTHORIZED' } });
      await tx.opsOrderEvent.create({ data: { orderId: i.orderId, type: 'invoice.voided', actorUserId: actor.id, fromStatus: 'INVOICED', toStatus: 'APPROVED_FOR_INVOICING', note: `${i.invoiceNumber}: ${reason.trim()}` } });
    });
    return this.invoice(id, actor);
  }

  async markShared(id: string, actor: Actor) {
    const i = await this.prisma.opsInvoice.findUnique({ where: { id } });
    assertVisible(actor, i, 'Invoice');
    await this.prisma.opsInvoice.update({ where: { id }, data: { sharedAt: new Date() } });
    return { ok: true };
  }

  // ---------- control numbers ----------

  async setControlNumber(id: string, dto: ControlNumberDto, actor: Actor) {
    const i = await this.prisma.opsInvoice.findUnique({ where: { id } });
    assertVisible(actor, i, 'Invoice');
    if (i.status === 'VOID') throw new ConflictException('This invoice is void');
    try {
      await this.prisma.opsInvoice.update({ where: { id }, data: { controlNumber: dto.controlNumber.trim(), controlNumberAt: new Date(), controlNumberSource: dto.source?.trim() || 'MANUAL' } });
    } catch (e) {
      if ((e as { code?: string }).code === 'P2002') throw new ConflictException('That control number is already used on another invoice');
      throw e;
    }
    return this.invoice(id, actor);
  }

  /**
   * Asks the configured control-number service for a number. The service must accept
   * POST { invoiceNumber, amount, currency, customerName, customerPhone } with a bearer token and answer
   * { controlNumber }. Without CONTROL_NUMBER_URL, accounts enter the number they receive from the bank or GePG.
   */
  async requestControlNumber(id: string, actor: Actor) {
    const url = this.config.get<string>('CONTROL_NUMBER_URL');
    if (!url) return { mode: 'MANUAL', message: 'No control-number service is connected. Enter the number you received from the bank or GePG.' };
    const i = await this.prisma.opsInvoice.findUnique({ where: { id } });
    assertVisible(actor, i, 'Invoice');
    if (i.controlNumber) return { mode: 'EXISTING', controlNumber: i.controlNumber };
    const details = i.customerDetails as { phone?: string };
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.config.get<string>('CONTROL_NUMBER_TOKEN') ?? ''}` },
      body: JSON.stringify({ invoiceNumber: i.invoiceNumber, amount: i.total - i.amountPaid, currency: 'TZS', customerName: i.customerName, customerPhone: details.phone }),
    });
    if (!res.ok) throw new ServiceUnavailableException(`The control-number service answered ${res.status}`);
    const body = (await res.json()) as { controlNumber?: string };
    if (!body.controlNumber) throw new ServiceUnavailableException('The control-number service did not return a number');
    await this.setControlNumber(id, { controlNumber: body.controlNumber, source: 'GATEWAY' }, actor);
    return { mode: 'GATEWAY', controlNumber: body.controlNumber };
  }

  // ---------- payments ----------

  payments(actor: Actor, f: { orderId?: string; status?: string } = {}) {
    return this.prisma.opsPayment.findMany({
      where: { ...scope(actor), ...(f.orderId ? { orderId: f.orderId } : {}), ...(f.status ? { status: f.status as never } : {}) },
      include: { invoice: { select: { invoiceNumber: true, customerName: true } }, order: { select: { reference: true } } },
      orderBy: { createdAt: 'desc' },
      take: 400,
    });
  }

  /** Re-adds every confirmed payment and brings invoice and order to the same truth. The caller holds the invoice lock. */
  private async applyTotals(tx: Tx, invoiceId: string) {
    const inv = await tx.opsInvoice.findUnique({ where: { id: invoiceId } });
    if (!inv) throw new NotFoundException('Invoice not found');
    const sum = await tx.opsPayment.aggregate({ where: { invoiceId, status: 'CONFIRMED' }, _sum: { amount: true } });
    const paid = r2(sum._sum.amount ?? 0);
    const state = paymentState(inv.total, paid);
    await tx.opsInvoice.update({ where: { id: invoiceId }, data: { amountPaid: paid, status: state === 'PAID' ? 'PAID' : state === 'PARTIALLY_PAID' ? 'PARTIALLY_PAID' : 'ISSUED' } });
    const order = await tx.opsOrder.update({ where: { id: inv.orderId }, data: { amountPaid: paid, paymentStatus: state } });
    return { inv, order, paid, state };
  }

  private async lockInvoice(tx: Tx, id: string) {
    await tx.$queryRaw`SELECT id FROM ops_invoices WHERE id = ${id} FOR UPDATE`;
  }

  private async afterPayment(order: { id: string; reference: string; mamcosId: string | null; createdByUserId: string; paymentStatus: string }, amount: number, confirmed: boolean) {
    const title = confirmed ? (order.paymentStatus === 'PAID' ? 'Payment confirmed — order fully paid' : 'Payment confirmed') : 'Payment rejected';
    const note = { type: confirmed ? 'OPS_PAYMENT_CONFIRMED' : 'OPS_PAYMENT_REJECTED', title, body: `${order.reference}: TZS ${Math.round(amount).toLocaleString()}`, data: { orderId: order.id } as Prisma.InputJsonValue };
    await this.notify.tellPermission('ops_payments', 'VIEW', order.mamcosId, note, [order.createdByUserId]);
  }

  /** Accounts confirm money they have verified themselves (bank slip, cash receipt). The reference can be used only once. */
  async recordPayment(invoiceId: string, dto: RecordPaymentDto, actor: User) {
    const reference = dto.reference.trim();
    if (!reference) throw new BadRequestException('Enter the receipt or transaction reference');
    const out = await this.prisma.$transaction(async (tx) => {
      await this.lockInvoice(tx, invoiceId);
      const inv = await tx.opsInvoice.findUnique({ where: { id: invoiceId } });
      assertVisible(actor, inv, 'Invoice');
      if (inv.status === 'VOID') throw new ConflictException('This invoice is void');
      const balance = r2(inv.total - inv.amountPaid);
      if (balance <= 0) throw new ConflictException('This invoice is already fully paid');
      if (dto.amount > balance + TOLERANCE) throw new BadRequestException(`That is more than the balance of TZS ${balance.toLocaleString()}`);
      try {
        await tx.opsPayment.create({
          data: {
            mamcosId: inv.mamcosId, invoiceId, orderId: inv.orderId, amount: dto.amount, method: dto.method, provider: 'MANUAL', providerReference: reference, status: 'CONFIRMED',
            paidAt: dto.paidAt ? new Date(dto.paidAt) : new Date(), source: 'MANUAL', payerName: dto.payerName?.trim() || null, recordedByUserId: actor.id, confirmedByUserId: actor.id,
          },
        });
      } catch (e) {
        if ((e as { code?: string }).code === 'P2002') throw new ConflictException('A payment with this reference has already been recorded');
        throw e;
      }
      const t = await this.applyTotals(tx, invoiceId);
      await tx.opsOrderEvent.create({ data: { orderId: inv.orderId, type: 'payment.confirmed', actorUserId: actor.id, note: `TZS ${dto.amount.toLocaleString()} (${reference})` } });
      return t;
    });
    await this.afterPayment(out.order, dto.amount, true);
    return this.invoice(invoiceId, actor);
  }

  /** Mobile-money prompt on the customer's phone. The order is NOT marked paid until the provider confirms it. */
  async initiateMobilePayment(invoiceId: string, dto: MobilePaymentDto, actor: User) {
    const inv = await this.prisma.opsInvoice.findUnique({ where: { id: invoiceId } });
    assertVisible(actor, inv, 'Invoice');
    if (inv.status === 'VOID') throw new ConflictException('This invoice is void');
    const balance = r2(inv.total - inv.amountPaid);
    const amount = dto.amount ?? balance;
    if (balance <= 0) throw new ConflictException('This invoice is already fully paid');
    if (amount > balance + TOLERANCE) throw new BadRequestException(`That is more than the balance of TZS ${balance.toLocaleString()}`);
    const attempt = (await this.prisma.opsPayment.count({ where: { invoiceId, provider: 'CLICKPESA' } })) + 1;
    const orderReference = `${inv.invoiceNumber.replace(/[^A-Za-z0-9]/g, '')}A${attempt}`;
    const push = await this.clickPesa.initiateUssdPush({ amount: String(amount), orderReference, phoneNumber: dto.phoneNumber });
    await this.prisma.opsPayment.create({
      data: { mamcosId: inv.mamcosId, invoiceId, orderId: inv.orderId, amount, method: 'MOBILE_MONEY', provider: 'CLICKPESA', providerReference: orderReference, status: 'PENDING', source: 'RECONCILED', recordedByUserId: actor.id, rawPayload: push as unknown as Prisma.InputJsonValue },
    });
    return { orderReference, status: push.status };
  }

  /** Authoritative check with ClickPesa: only a SUCCESS/SETTLED answer from the provider confirms the payment. */
  async reconcileClickPesa(orderReference: string): Promise<{ matched: boolean; status?: string }> {
    const pay = await this.prisma.opsPayment.findUnique({ where: { provider_providerReference: { provider: 'CLICKPESA', providerReference: orderReference } } });
    if (!pay) return { matched: false };
    if (pay.status !== 'PENDING') return { matched: true, status: pay.status };
    const remote = await this.clickPesa.queryPayment(orderReference);
    if (!remote) return { matched: true, status: 'PENDING' };
    if (['FAILED', 'CANCELLED', 'REJECTED'].includes(remote.status)) {
      const o = await this.prisma.opsPayment.updateMany({ where: { id: pay.id, status: 'PENDING' }, data: { status: 'REJECTED', rejectReason: `Provider status ${remote.status}`, rawPayload: remote as unknown as Prisma.InputJsonValue } });
      if (o.count) {
        const order = await this.prisma.opsOrder.findUnique({ where: { id: pay.orderId } });
        if (order) await this.afterPayment(order, pay.amount, false);
      }
      return { matched: true, status: 'REJECTED' };
    }
    if (!['SUCCESS', 'SETTLED'].includes(remote.status)) return { matched: true, status: 'PENDING' };
    const collected = Number(remote.collectedAmount ?? pay.amount);
    if (Math.abs(collected - pay.amount) > 1) {
      this.logger.error(`ClickPesa amount mismatch for ${orderReference}: expected ${pay.amount}, collected ${collected}`);
      await this.notify.tellPermission('ops_payments', 'EDIT', pay.mamcosId, { type: 'OPS_PAYMENT_MISMATCH', title: 'Payment amount does not match', body: `${orderReference}: expected ${pay.amount}, provider collected ${collected}. Check it before confirming.`, data: { paymentId: pay.id } });
      return { matched: true, status: 'PENDING' };
    }
    const out = await this.prisma.$transaction(async (tx) => {
      await this.lockInvoice(tx, pay.invoiceId);
      const claimed = await tx.opsPayment.updateMany({ where: { id: pay.id, status: 'PENDING' }, data: { status: 'CONFIRMED', paidAt: new Date(), rawPayload: remote as unknown as Prisma.InputJsonValue } });
      if (!claimed.count) return null;
      const t = await this.applyTotals(tx, pay.invoiceId);
      await tx.opsOrderEvent.create({ data: { orderId: pay.orderId, type: 'payment.confirmed', actorUserId: null, note: `TZS ${pay.amount.toLocaleString()} (ClickPesa ${orderReference})` } });
      return t;
    });
    if (out) await this.afterPayment(out.order, pay.amount, true);
    return { matched: true, status: 'CONFIRMED' };
  }

  async reconcile(paymentId: string, actor: Actor) {
    const p = await this.prisma.opsPayment.findUnique({ where: { id: paymentId } });
    assertVisible(actor, p, 'Payment');
    if (p.provider !== 'CLICKPESA') throw new BadRequestException('Only mobile-money payments can be re-checked with the provider');
    return this.reconcileClickPesa(p.providerReference);
  }

  @Cron('*/10 * * * *', { name: 'ops-payment-reconcile' })
  async reconcilePendingJob() {
    try {
      const pending = await this.prisma.opsPayment.findMany({ where: { provider: 'CLICKPESA', status: 'PENDING', createdAt: { gt: new Date(Date.now() - 3 * 86_400_000), lt: new Date(Date.now() - 60_000) } }, take: 100 });
      for (const p of pending) await this.reconcileClickPesa(p.providerReference).catch((e) => this.logger.warn(`Reconcile ${p.providerReference}: ${e instanceof Error ? e.message : e}`));
    } catch (e) {
      this.logger.error(`Payment reconcile job failed: ${e instanceof Error ? e.message : e}`);
    }
  }

  async rejectPending(paymentId: string, reason: string, actor: User) {
    if (!reason.trim()) throw new BadRequestException('Give the reason for rejecting the payment');
    const p = await this.prisma.opsPayment.findUnique({ where: { id: paymentId } });
    assertVisible(actor, p, 'Payment');
    const claimed = await this.prisma.opsPayment.updateMany({ where: { id: paymentId, status: 'PENDING' }, data: { status: 'REJECTED', rejectReason: reason.trim(), confirmedByUserId: actor.id } });
    if (!claimed.count) throw new ConflictException('Only a pending payment can be rejected');
    const order = await this.prisma.opsOrder.findUnique({ where: { id: p.orderId } });
    if (order) await this.afterPayment(order, p.amount, false);
    return { ok: true };
  }

  /** Accounts confirm a pending payment after checking the bank or provider themselves. */
  async confirmPending(paymentId: string, actor: User) {
    const p = await this.prisma.opsPayment.findUnique({ where: { id: paymentId } });
    assertVisible(actor, p, 'Payment');
    const out = await this.prisma.$transaction(async (tx) => {
      await this.lockInvoice(tx, p.invoiceId);
      const inv = await tx.opsInvoice.findUnique({ where: { id: p.invoiceId } });
      if (p.amount > r2(inv!.total - inv!.amountPaid) + TOLERANCE) throw new BadRequestException('That would be more than the invoice balance');
      const claimed = await tx.opsPayment.updateMany({ where: { id: paymentId, status: 'PENDING' }, data: { status: 'CONFIRMED', paidAt: new Date(), confirmedByUserId: actor.id, source: 'MANUAL' } });
      if (!claimed.count) throw new ConflictException('Only a pending payment can be confirmed');
      const t = await this.applyTotals(tx, p.invoiceId);
      await tx.opsOrderEvent.create({ data: { orderId: p.orderId, type: 'payment.confirmed', actorUserId: actor.id, note: `TZS ${p.amount.toLocaleString()} (${p.providerReference})` } });
      return t;
    });
    await this.afterPayment(out.order, p.amount, true);
    return { ok: true };
  }

  // ---------- provider callbacks ----------

  /**
   * Signed callback from a bank, GePG or other gateway. The body must be signed with OPS_PAYMENT_WEBHOOK_SECRET
   * (HMAC-SHA256 over the key-sorted JSON). A reference seen before is acknowledged without recording anything new.
   */
  async handleCallback(body: { provider?: string; event?: string; reference?: string; invoiceNumber?: string; controlNumber?: string; amount?: number; paidAt?: string; payerName?: string }, signature: string | undefined) {
    const secret = this.config.get<string>('OPS_PAYMENT_WEBHOOK_SECRET');
    if (!secret) throw new ServiceUnavailableException('Payment callbacks are not configured');
    if (!verifySignature(secret, body, signature)) throw new ForbiddenException('The signature is not valid');
    const provider = (body.provider ?? 'GATEWAY').toUpperCase();
    const inv = await this.prisma.opsInvoice.findFirst({ where: { OR: [...(body.invoiceNumber ? [{ invoiceNumber: body.invoiceNumber }] : []), ...(body.controlNumber ? [{ controlNumber: body.controlNumber }] : [])] } });
    if (!inv) throw new NotFoundException('No invoice matches this callback');
    if (body.event === 'control_number.issued') {
      if (body.controlNumber && !inv.controlNumber) await this.prisma.opsInvoice.update({ where: { id: inv.id }, data: { controlNumber: body.controlNumber, controlNumberAt: new Date(), controlNumberSource: provider } }).catch(() => undefined);
      return { received: true };
    }
    if (body.event !== 'payment.confirmed' || !body.reference || !body.amount || body.amount <= 0) throw new BadRequestException('Unsupported callback');
    const out = await this.prisma
      .$transaction(async (tx) => {
        await this.lockInvoice(tx, inv.id);
        const fresh = await tx.opsInvoice.findUnique({ where: { id: inv.id } });
        if (fresh!.status === 'VOID') throw new ConflictException('This invoice is void');
        const balance = r2(fresh!.total - fresh!.amountPaid);
        try {
          await tx.opsPayment.create({
            data: {
              mamcosId: inv.mamcosId, invoiceId: inv.id, orderId: inv.orderId, amount: body.amount!, method: 'CONTROL_NUMBER', provider, providerReference: body.reference!, status: 'CONFIRMED',
              paidAt: body.paidAt ? new Date(body.paidAt) : new Date(), source: 'CALLBACK', payerName: body.payerName ?? null, rawPayload: body as unknown as Prisma.InputJsonValue,
            },
          });
        } catch (e) {
          if ((e as { code?: string }).code === 'P2002') return null; // already recorded: do not count it twice
          throw e;
        }
        if (body.amount! > balance + TOLERANCE) this.logger.warn(`Callback ${body.reference} exceeds the invoice balance`);
        const t = await this.applyTotals(tx, inv.id);
        await tx.opsOrderEvent.create({ data: { orderId: inv.orderId, type: 'payment.confirmed', actorUserId: null, note: `TZS ${body.amount!.toLocaleString()} (${provider} ${body.reference})` } });
        return t;
      });
    if (out) await this.afterPayment(out.order, body.amount, true);
    return { received: true, duplicate: !out };
  }

  // ---------- release for fulfilment ----------

  /** Explicit authorisation. Full payment is required; releasing earlier needs the override permission and a recorded reason. */
  async authorize(orderId: string, dto: AuthorizeDto, actor: RequestUser) {
    const order = await this.prisma.$transaction(async (tx) => {
      const o = await tx.opsOrder.findUnique({ where: { id: orderId } });
      assertVisible(actor, o, 'Order');
      if (o.status !== 'INVOICED') throw new ConflictException('Only an invoiced order can be released for fulfilment');
      if (o.fulfilState !== 'NOT_AUTHORIZED') throw new ConflictException('This order has already been released to the warehouse');
      let override: string | null = null;
      if (o.paymentStatus !== 'PAID') {
        if (!dto.overrideReason?.trim()) throw new ConflictException('This order is not fully paid. Release is only possible after payment is confirmed.');
        if (!hasGrant(actor as never, 'ops_payments', 'DELETE')) throw new ForbiddenException('Releasing an unpaid order needs management approval');
        override = dto.overrideReason.trim();
      }
      const claimed = await tx.opsOrder.updateMany({ where: { id: orderId, fulfilState: 'NOT_AUTHORIZED' }, data: { fulfilState: 'AUTHORIZED', authorizedByUserId: actor.id, authorizedAt: new Date(), authorizationOverride: override } });
      if (!claimed.count) throw new ConflictException('This order has just been released by someone else');
      await tx.opsOrderEvent.create({ data: { orderId, type: 'fulfilment.authorized', actorUserId: actor.id, note: override ? `Override: ${override}` : 'Payment verified' } });
      return o;
    });
    await this.notify.tellPermission('ops_dispatch', 'VIEW', order.mamcosId, { type: 'OPS_ORDER_AUTHORIZED', title: 'Order ready for the warehouse', body: `${order.reference} is released for preparation and dispatch.`, data: { orderId } }, [order.createdByUserId]);
    return { ok: true };
  }

  async revokeAuthorization(orderId: string, reason: string, actor: User) {
    if (!reason.trim()) throw new BadRequestException('Give the reason');
    await this.prisma.$transaction(async (tx) => {
      const o = await tx.opsOrder.findUnique({ where: { id: orderId }, include: { dispatches: true } });
      assertVisible(actor, o, 'Order');
      if (o.dispatches.some((d) => d.status === 'RELEASED' || d.status === 'PREPARED') || o.fulfilState === 'PARTIALLY_DISPATCHED' || o.fulfilState === 'DISPATCHED') throw new ConflictException('Goods have already been prepared or released');
      if (o.fulfilState === 'NOT_AUTHORIZED') throw new ConflictException('This order is not released');
      await tx.opsOrder.update({ where: { id: orderId }, data: { fulfilState: 'NOT_AUTHORIZED', authorizedByUserId: null, authorizedAt: null, authorizationOverride: null } });
      const allocs = await tx.orderAllocation.findMany({ where: { orderId } });
      for (const a of allocs) {
        const free = a.quantityKg - a.dispatchedKg - a.releasedKg;
        if (free > 0) await tx.orderAllocation.update({ where: { id: a.id }, data: { releasedKg: a.releasedKg + free } });
      }
      await tx.opsOrderEvent.create({ data: { orderId, type: 'fulfilment.revoked', actorUserId: actor.id, note: reason.trim() } });
    });
    return { ok: true };
  }
}
