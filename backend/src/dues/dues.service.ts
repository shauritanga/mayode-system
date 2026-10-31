import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DueCategory, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OwnershipService, RequestUser } from '../common/ownership.service';
import { AccountingService } from '../accounting/accounting.service';
import {
  ChargeDto, CreateDueDto, CreateDueTypeDto, DueListQueryDto, IssueFertiliserDto, RecordPaymentDto, UpdateDueTypeDto,
} from './dto/dues.dto';

const num = (v: unknown) => (v == null ? 0 : Number(v));
const cents = (n: number) => Math.round(n * 100) / 100;
const day = (value: string | Date) => new Date(`${(typeof value === 'string' ? value : value.toISOString()).slice(0, 10)}T00:00:00.000Z`);
const today = () => day(new Date());
const fullName = (f: { firstName: string; lastName: string }) => `${f.firstName} ${f.lastName}`.trim();

/** Where a payment of each kind of due is booked as income (or, for fertiliser, as the receivable coming down). */
const CREDIT_ACCOUNT: Record<DueCategory, string> = {
  LEVY: '4210', MEMBERSHIP_FEE: '4200', CANAL_CLEANING: '4220', FERTILISER: '1310', OTHER: '4210',
};

const farmerSelect = { id: true, firstName: true, lastName: true, controlNumber: true, user: { select: { phone: true } } } as const;
type FarmerLite = { id: string; firstName: string; lastName: string; controlNumber: string; user?: { phone: string } | null };
const farmerShape = (f: FarmerLite) => ({ id: f.id, name: fullName(f), memberNumber: f.controlNumber, phone: f.user?.phone ?? null });

/** What farmers owe the AMCOS (levies, membership, canal cleaning, fertiliser) and what they have paid, kept on the AMCOS's own ledger. */
@Injectable()
export class DuesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ownership: OwnershipService,
    private readonly accounting: AccountingService,
  ) {}

  private tenant(actor: RequestUser, requested?: string): string {
    const own = this.ownership.resolveTenantMamcosId(actor);
    const id = own ?? requested ?? null;
    if (!id) throw new BadRequestException('Choose a cooperative');
    if (own && requested && requested !== own) throw new ForbiddenException('You can only manage dues for your own cooperative');
    return id;
  }

  private async farmerOf(mamcosId: string, farmerId: string) {
    const farmer = await this.prisma.farmer.findFirst({ where: { id: farmerId, mamcosId }, select: farmerSelect });
    if (!farmer) throw new NotFoundException('Farmer not found');
    return farmer;
  }

  /** Hectares each farmer currently holds in this AMCOS's schemes. */
  private async hectaresByFarmer(mamcosId: string, farmerIds?: string[]) {
    const rows = await this.prisma.irrigationHectareAllocation.findMany({
      where: { status: 'ACTIVE', ...(farmerIds ? { farmerId: { in: farmerIds } } : {}), hectare: { block: { canal: { scheme: { mamcosId } } } } },
      select: { farmerId: true, hectare: { select: { areaHectares: true } } },
    });
    const held = new Map<string, number>();
    for (const r of rows) held.set(r.farmerId, cents((held.get(r.farmerId) ?? 0) + num(r.hectare.areaHectares)));
    return held;
  }

  // ───────────────────────── charge types ─────────────────────────

  async listTypes(actor: RequestUser, q: { mamcosId?: string; includeInactive?: string }) {
    const mamcosId = this.tenant(actor, q.mamcosId);
    const types = await this.prisma.farmerDueType.findMany({
      where: { mamcosId, ...(q.includeInactive === 'true' ? {} : { isActive: true }) }, orderBy: [{ category: 'asc' }, { name: 'asc' }],
      include: { dues: { where: { status: 'ACTIVE' }, select: { amount: true, waivedAmount: true, payments: { where: { voidedAt: null }, select: { amount: true } } } } },
    });
    return types.map(({ dues, ...t }) => {
      const charged = dues.reduce((n, d) => n + num(d.amount), 0);
      const collected = dues.reduce((n, d) => n + d.payments.reduce((m, p) => m + num(p.amount), 0), 0);
      return { ...t, rate: num(t.rate), farmersCharged: dues.length, charged: cents(charged), collected: cents(collected) };
    });
  }

  async createType(actor: RequestUser, dto: CreateDueTypeDto, mamcosIdParam?: string) {
    const mamcosId = this.tenant(actor, mamcosIdParam);
    if (dto.category === 'FERTILISER') throw new BadRequestException('Fertiliser is issued to each farmer, not charged to everyone');
    try {
      return await this.prisma.farmerDueType.create({
        data: {
          mamcosId, name: dto.name.trim(), category: dto.category, basis: dto.basis, rate: dto.rate, season: dto.season?.trim() || null,
          dueDate: dto.dueDate ? day(dto.dueDate) : null, notes: dto.notes?.trim() || null, createdById: actor.id,
        },
      });
    } catch (e: any) {
      if (e?.code === 'P2002') throw new ConflictException(`A charge called "${dto.name.trim()}" already exists`);
      throw e;
    }
  }

  private async findType(mamcosId: string, id: string) {
    const type = await this.prisma.farmerDueType.findFirst({ where: { id, mamcosId } });
    if (!type) throw new NotFoundException('Charge not found');
    return type;
  }

  async updateType(actor: RequestUser, id: string, dto: UpdateDueTypeDto, mamcosIdParam?: string) {
    const mamcosId = this.tenant(actor, mamcosIdParam);
    await this.findType(mamcosId, id);
    try {
      return await this.prisma.farmerDueType.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}), ...(dto.rate !== undefined ? { rate: dto.rate } : {}),
          ...(dto.season !== undefined ? { season: dto.season.trim() || null } : {}), ...(dto.dueDate !== undefined ? { dueDate: day(dto.dueDate) } : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}), ...(dto.notes !== undefined ? { notes: dto.notes.trim() || null } : {}),
        },
      });
    } catch (e: any) {
      if (e?.code === 'P2002') throw new ConflictException('Another charge already has that name');
      throw e;
    }
  }

  /** Who would be charged, and how much, without charging anyone. A rate change only affects farmers charged afterwards. */
  private async plan(mamcosId: string, type: Prisma.FarmerDueTypeGetPayload<object>) {
    const [farmers, already, held] = await Promise.all([
      this.prisma.farmer.findMany({ where: { mamcosId, isBlacklisted: false }, select: { id: true, firstName: true, lastName: true } }),
      this.prisma.farmerDue.findMany({ where: { typeId: type.id }, select: { farmerId: true } }),
      type.basis === 'PER_HECTARE' ? this.hectaresByFarmer(mamcosId) : Promise.resolve(new Map<string, number>()),
    ]);
    const charged = new Set(already.map((a) => a.farmerId));
    const rows: { farmerId: string; hectares: number | null; amount: number }[] = [];
    let noLand = 0;
    for (const f of farmers) {
      if (charged.has(f.id)) continue;
      if (type.basis === 'FLAT') { rows.push({ farmerId: f.id, hectares: null, amount: cents(num(type.rate)) }); continue; }
      const h = held.get(f.id) ?? 0;
      if (h <= 0) { noLand++; continue; }
      rows.push({ farmerId: f.id, hectares: h, amount: cents(num(type.rate) * h) });
    }
    return { rows, alreadyCharged: charged.size, noHectares: noLand, total: cents(rows.reduce((n, r) => n + r.amount, 0)) };
  }

  async previewCharge(actor: RequestUser, id: string, q: { mamcosId?: string }) {
    const mamcosId = this.tenant(actor, q.mamcosId);
    const type = await this.findType(mamcosId, id);
    const p = await this.plan(mamcosId, type);
    return { farmers: p.rows.length, total: p.total, alreadyCharged: p.alreadyCharged, withoutHectares: p.noHectares };
  }

  async charge(actor: RequestUser, id: string, dto: ChargeDto, mamcosIdParam?: string) {
    const mamcosId = this.tenant(actor, mamcosIdParam);
    const type = await this.findType(mamcosId, id);
    if (!type.isActive) throw new BadRequestException('This charge is switched off');
    const dueDate = dto.dueDate ? day(dto.dueDate) : type.dueDate;
    const issuedOn = today();
    if (dueDate && dueDate < issuedOn) throw new BadRequestException('The due date cannot be in the past');
    const p = await this.plan(mamcosId, type);
    if (!p.rows.length) throw new BadRequestException('Every farmer has already been charged for this');
    const label = type.season ? `${type.name} · ${type.season}` : type.name;
    const made = await this.prisma.farmerDue.createMany({
      data: p.rows.map((r) => ({
        mamcosId, typeId: type.id, farmerId: r.farmerId, category: type.category, description: label, hectares: r.hectares,
        amount: r.amount, issuedOn, dueDate, createdById: actor.id,
      })),
      skipDuplicates: true,
    });
    return { charged: made.count, total: p.total, withoutHectares: p.noHectares };
  }

  // ───────────────────────── single dues ─────────────────────────

  async farmers(actor: RequestUser, q: { mamcosId?: string; q?: string }) {
    const mamcosId = this.tenant(actor, q.mamcosId);
    const text = (q.q ?? '').trim();
    if (text.length < 2) return [];
    const farmers = await this.prisma.farmer.findMany({
      where: {
        mamcosId, isBlacklisted: false,
        OR: [
          { firstName: { contains: text, mode: 'insensitive' } }, { lastName: { contains: text, mode: 'insensitive' } },
          { controlNumber: { contains: text, mode: 'insensitive' } }, { user: { phone: { contains: text } } },
        ],
      },
      select: farmerSelect, orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }], take: 20,
    });
    const held = await this.hectaresByFarmer(mamcosId, farmers.map((f) => f.id));
    return farmers.map((f) => ({ ...farmerShape(f), hectares: held.get(f.id) ?? 0 }));
  }

  async createDue(actor: RequestUser, dto: CreateDueDto, mamcosIdParam?: string) {
    const mamcosId = this.tenant(actor, mamcosIdParam);
    if (dto.category === 'FERTILISER') throw new BadRequestException('Use Issue fertiliser to record fertiliser taken on credit');
    await this.farmerOf(mamcosId, dto.farmerId);
    if (dto.typeId) await this.findType(mamcosId, dto.typeId);
    const dueDate = dto.dueDate ? day(dto.dueDate) : null;
    if (dueDate && dueDate < today()) throw new BadRequestException('The due date cannot be in the past');
    try {
      return await this.prisma.farmerDue.create({
        data: { mamcosId, typeId: dto.typeId ?? null, farmerId: dto.farmerId, category: dto.category, description: dto.description.trim(), amount: dto.amount, issuedOn: today(), dueDate, createdById: actor.id },
      });
    } catch (e: any) {
      if (e?.code === 'P2002') throw new ConflictException('This farmer has already been charged for that');
      throw e;
    }
  }

  async issueFertiliser(actor: RequestUser, dto: IssueFertiliserDto, mamcosIdParam?: string) {
    const mamcosId = this.tenant(actor, mamcosIdParam);
    await this.farmerOf(mamcosId, dto.farmerId);
    const issuedOn = day(dto.issuedOn);
    if (issuedOn > today()) throw new BadRequestException('The issue date cannot be in the future');
    const dueDate = dto.dueDate ? day(dto.dueDate) : null;
    if (dueDate && dueDate < issuedOn) throw new BadRequestException('The due date cannot be before the issue date');
    const amount = cents(dto.quantity * dto.unitPrice);
    const unit = dto.unit?.trim() || 'bags';
    const due = await this.prisma.farmerDue.create({
      data: {
        mamcosId, farmerId: dto.farmerId, category: 'FERTILISER', description: `${dto.itemName.trim()} · ${dto.quantity} ${unit}`, itemName: dto.itemName.trim(),
        quantity: dto.quantity, unit, unitPrice: dto.unitPrice, amount, issuedOn, dueDate, createdById: actor.id,
      },
    });
    if (dto.postToLedger) {
      try {
        await this.accounting.postToLedger('FertiliserIssue', due.id, issuedOn, `Fertiliser on credit: ${due.description}`,
          [{ code: '1310', debit: amount }, { code: '4230', credit: amount }], mamcosId);
        await this.prisma.farmerDue.update({ where: { id: due.id }, data: { postedIssue: true } });
      } catch (e) {
        await this.prisma.farmerDue.delete({ where: { id: due.id } }); // no due without its entry
        throw e;
      }
    }
    return this.detail(actor, due.id, mamcosId);
  }

  private async findDue(mamcosId: string, id: string) {
    const due = await this.prisma.farmerDue.findFirst({ where: { id, mamcosId } });
    if (!due) throw new NotFoundException('Due not found');
    return due;
  }

  async waive(actor: RequestUser, id: string, dto: { reason: string; amount?: number }, mamcosIdParam?: string) {
    const mamcosId = this.tenant(actor, mamcosIdParam);
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM farmer_dues WHERE id = ${id} AND mamcos_id = ${mamcosId} FOR UPDATE`;
      const due = await tx.farmerDue.findFirst({ where: { id, mamcosId }, include: { payments: { where: { voidedAt: null }, select: { amount: true } } } });
      if (!due) throw new NotFoundException('Due not found');
      if (due.status !== 'ACTIVE') throw new BadRequestException('A cancelled due cannot be waived');
      const balance = cents(num(due.amount) - num(due.waivedAmount) - due.payments.reduce((n, p) => n + num(p.amount), 0));
      if (balance <= 0) throw new BadRequestException('Nothing is left to waive');
      const amount = dto.amount ?? balance;
      if (amount > balance) throw new BadRequestException(`Only ${balance.toLocaleString('en-US')} is still owed`);
      await tx.farmerDue.update({ where: { id }, data: { waivedAmount: cents(num(due.waivedAmount) + amount), waivedReason: dto.reason.trim() } });
      return { waived: amount };
    });
  }

  async cancel(actor: RequestUser, id: string, reason: string, mamcosIdParam?: string) {
    const mamcosId = this.tenant(actor, mamcosIdParam);
    const due = await this.findDue(mamcosId, id);
    if (due.status === 'CANCELLED') throw new ConflictException('This due is already cancelled');
    const paid = await this.prisma.duePayment.count({ where: { dueId: id, voidedAt: null } });
    if (paid) throw new BadRequestException('Void its payments before cancelling it');
    await this.prisma.farmerDue.update({ where: { id }, data: { status: 'CANCELLED', cancelReason: reason.trim() } });
    if (due.postedIssue) {
      await this.accounting.postToLedger('FertiliserIssueVoid', id, today(), `Cancelled: ${due.description}`,
        [{ code: '4230', debit: num(due.amount) }, { code: '1310', credit: num(due.amount) }], mamcosId);
    }
    return { cancelled: true };
  }

  // ───────────────────────── payments ─────────────────────────

  private async nextReceipt(tx: Prisma.TransactionClient, mamcosId: string) {
    const last = await tx.duePayment.findFirst({ where: { mamcosId, receiptNo: { startsWith: 'RCT-' } }, orderBy: { receiptNo: 'desc' }, select: { receiptNo: true } });
    const n = last ? parseInt(last.receiptNo.slice(4), 10) || 0 : 0;
    return `RCT-${String(n + 1).padStart(6, '0')}`;
  }

  async recordPayment(actor: RequestUser, id: string, dto: RecordPaymentDto, mamcosIdParam?: string) {
    const mamcosId = this.tenant(actor, mamcosIdParam);
    const paidOn = dto.paidOn ? day(dto.paidOn) : today();
    if (paidOn > today()) throw new BadRequestException('The payment date cannot be in the future');
    let payment: Prisma.DuePaymentGetPayload<object> | undefined;
    let due: Prisma.FarmerDueGetPayload<object> | undefined;
    for (let attempt = 0; !payment; attempt++) {
      try {
        // the row lock stops two cashiers from overpaying the same due; the retry covers two receipts taking the same number
        payment = await this.prisma.$transaction(async (tx) => {
          await tx.$queryRaw`SELECT id FROM farmer_dues WHERE id = ${id} AND mamcos_id = ${mamcosId} FOR UPDATE`;
          const found = await tx.farmerDue.findFirst({ where: { id, mamcosId }, include: { payments: { where: { voidedAt: null }, select: { amount: true } } } });
          if (!found) throw new NotFoundException('Due not found');
          if (found.status !== 'ACTIVE') throw new BadRequestException('This due is cancelled');
          if (paidOn < found.issuedOn) throw new BadRequestException('The payment cannot be dated before the charge was made');
          const balance = cents(num(found.amount) - num(found.waivedAmount) - found.payments.reduce((n, p) => n + num(p.amount), 0));
          if (balance <= 0) throw new BadRequestException('This due is already paid');
          if (cents(dto.amount) > balance) throw new BadRequestException(`Only ${balance.toLocaleString('en-US')} is still owed`);
          due = found;
          return tx.duePayment.create({
            data: {
              mamcosId, dueId: id, farmerId: found.farmerId, receiptNo: await this.nextReceipt(tx, mamcosId), amount: cents(dto.amount), paidOn,
              method: dto.method, reference: dto.reference?.trim() || null, note: dto.note?.trim() || null, recordedById: actor.id,
            },
          });
        });
      } catch (e: any) {
        if (e?.code === 'P2002' && attempt < 3) continue;
        if (e?.code === 'P2002') throw new ConflictException('Could not number the receipt, try again');
        throw e;
      }
    }
    const amount = num(payment.amount);
    const debit = payment.method === 'HARVEST_DEDUCTION' ? '2200' : '1000';
    try {
      await this.accounting.postToLedger('DuePayment', payment.id, paidOn, `${payment.receiptNo} · ${due!.description}`,
        [{ code: debit, debit: amount }, { code: CREDIT_ACCOUNT[due!.category], credit: amount }], mamcosId);
    } catch (e) {
      await this.prisma.duePayment.delete({ where: { id: payment.id } }); // no receipt without its entry
      throw e;
    }
    return payment;
  }

  async voidPayment(actor: RequestUser, paymentId: string, reason: string, mamcosIdParam?: string) {
    const mamcosId = this.tenant(actor, mamcosIdParam);
    const payment = await this.prisma.duePayment.findFirst({ where: { id: paymentId, mamcosId }, include: { due: true } });
    if (!payment) throw new NotFoundException('Payment not found');
    if (payment.voidedAt) throw new ConflictException('This payment has already been voided');
    const claimed = await this.prisma.duePayment.updateMany({
      where: { id: paymentId, voidedAt: null }, data: { voidedAt: new Date(), voidReason: reason.trim(), voidedById: actor.id },
    });
    if (!claimed.count) throw new ConflictException('This payment has already been voided');
    const amount = num(payment.amount);
    const debit = payment.method === 'HARVEST_DEDUCTION' ? '2200' : '1000';
    try {
      await this.accounting.postToLedger('DuePaymentVoid', paymentId, today(), `Voided ${payment.receiptNo}: ${reason.trim()}`,
        [{ code: CREDIT_ACCOUNT[payment.due.category], debit: amount }, { code: debit, credit: amount }], mamcosId);
    } catch (e) {
      await this.prisma.duePayment.update({ where: { id: paymentId }, data: { voidedAt: null, voidReason: null, voidedById: null } });
      throw e;
    }
    return { voided: true, receiptNo: payment.receiptNo };
  }

  // ───────────────────────── reading ─────────────────────────

  private shapeDue(d: Prisma.FarmerDueGetPayload<{ include: { farmer: { select: typeof farmerSelect }; type: { select: { id: true; name: true } }; payments: true } }>) {
    const paid = cents(d.payments.filter((p) => !p.voidedAt).reduce((n, p) => n + num(p.amount), 0));
    const waived = num(d.waivedAmount);
    const balance = d.status === 'CANCELLED' ? 0 : cents(num(d.amount) - waived - paid);
    const overdue = d.status === 'ACTIVE' && balance > 0 && !!d.dueDate && d.dueDate < today();
    const state = d.status === 'CANCELLED' ? 'CANCELLED' : balance <= 0 ? 'PAID' : paid > 0 ? 'PARTIAL' : 'OPEN';
    return {
      id: d.id, category: d.category, description: d.description, farmer: farmerShape(d.farmer), type: d.type, hectares: d.hectares == null ? null : num(d.hectares),
      itemName: d.itemName, quantity: d.quantity == null ? null : num(d.quantity), unit: d.unit, unitPrice: d.unitPrice == null ? null : num(d.unitPrice),
      amount: num(d.amount), waivedAmount: waived, waivedReason: d.waivedReason, cancelReason: d.cancelReason, paid, balance, state, overdue,
      issuedOn: d.issuedOn, dueDate: d.dueDate, postedIssue: d.postedIssue,
    };
  }

  private readonly include = { farmer: { select: farmerSelect }, type: { select: { id: true, name: true } }, payments: { orderBy: { createdAt: 'asc' as const } } };

  async list(actor: RequestUser, q: DueListQueryDto) {
    const mamcosId = this.tenant(actor, q.mamcosId);
    const text = q.q?.trim();
    const rows = await this.prisma.farmerDue.findMany({
      where: {
        mamcosId, ...(q.category ? { category: q.category } : {}), ...(q.typeId ? { typeId: q.typeId } : {}), ...(q.farmerId ? { farmerId: q.farmerId } : {}),
        ...(text ? { OR: [
          { farmer: { firstName: { contains: text, mode: 'insensitive' } } }, { farmer: { lastName: { contains: text, mode: 'insensitive' } } },
          { farmer: { controlNumber: { contains: text, mode: 'insensitive' } } }, { description: { contains: text, mode: 'insensitive' } },
        ] } : {}),
      },
      include: this.include, orderBy: [{ createdAt: 'desc' }],
    });
    // state is derived from payments, so it is filtered here rather than in SQL
    const shaped = rows.map((r) => this.shapeDue(r)).filter((d) => !q.state || (q.state === 'OVERDUE' ? d.overdue : d.state === q.state));
    const page = q.page ?? 1, pageSize = q.pageSize ?? 15;
    const active = shaped.filter((d) => d.state !== 'CANCELLED');
    const totals = {
      charged: cents(active.reduce((n, d) => n + d.amount, 0)), collected: cents(active.reduce((n, d) => n + d.paid, 0)),
      waived: cents(active.reduce((n, d) => n + d.waivedAmount, 0)), outstanding: cents(active.reduce((n, d) => n + d.balance, 0)),
      overdue: cents(active.filter((d) => d.overdue).reduce((n, d) => n + d.balance, 0)),
    };
    return {
      data: shaped.slice((page - 1) * pageSize, page * pageSize).map(({ ...d }) => d),
      meta: { total: shaped.length, page, pageSize, pages: Math.max(1, Math.ceil(shaped.length / pageSize)) }, totals,
    };
  }

  async detail(actor: RequestUser, id: string, mamcosIdParam?: string) {
    const mamcosId = this.tenant(actor, mamcosIdParam);
    const d = await this.prisma.farmerDue.findFirst({ where: { id, mamcosId }, include: this.include });
    if (!d) throw new NotFoundException('Due not found');
    return { ...this.shapeDue(d), payments: d.payments.map((p) => ({ ...p, amount: num(p.amount) })) };
  }

  /** A farmer's whole account with the AMCOS: everything charged, every receipt, what is still owed. */
  async statement(actor: RequestUser, farmerId: string, mamcosIdParam?: string) {
    const mamcosId = this.tenant(actor, mamcosIdParam);
    const farmer = await this.farmerOf(mamcosId, farmerId);
    const rows = await this.prisma.farmerDue.findMany({ where: { mamcosId, farmerId }, include: this.include, orderBy: { issuedOn: 'desc' } });
    const dues = rows.map((r) => ({ ...this.shapeDue(r), payments: r.payments.map((p) => ({ ...p, amount: num(p.amount) })) }));
    const live = dues.filter((d) => d.state !== 'CANCELLED');
    return {
      farmer: farmerShape(farmer), dues,
      totals: { charged: cents(live.reduce((n, d) => n + d.amount, 0)), paid: cents(live.reduce((n, d) => n + d.paid, 0)), outstanding: cents(live.reduce((n, d) => n + d.balance, 0)) },
    };
  }

  /** Farmers who still owe, most overdue first. */
  async arrears(actor: RequestUser, q: { mamcosId?: string; category?: DueCategory }) {
    const mamcosId = this.tenant(actor, q.mamcosId);
    const rows = await this.prisma.farmerDue.findMany({
      where: { mamcosId, status: 'ACTIVE', ...(q.category ? { category: q.category } : {}) }, include: this.include,
    });
    const byFarmer = new Map<string, { farmer: ReturnType<typeof farmerShape>; balance: number; overdue: number; dues: number; oldest: Date | null }>();
    for (const r of rows) {
      const d = this.shapeDue(r);
      if (d.balance <= 0) continue;
      const row = byFarmer.get(d.farmer.id) ?? { farmer: d.farmer, balance: 0, overdue: 0, dues: 0, oldest: null };
      row.balance = cents(row.balance + d.balance);
      if (d.overdue) row.overdue = cents(row.overdue + d.balance);
      row.dues++;
      if (d.dueDate && (!row.oldest || d.dueDate < row.oldest)) row.oldest = d.dueDate;
      byFarmer.set(d.farmer.id, row);
    }
    const items = [...byFarmer.values()].sort((a, b) => b.overdue - a.overdue || b.balance - a.balance);
    return { farmers: items.length, outstanding: cents(items.reduce((n, i) => n + i.balance, 0)), overdue: cents(items.reduce((n, i) => n + i.overdue, 0)), items };
  }
}
