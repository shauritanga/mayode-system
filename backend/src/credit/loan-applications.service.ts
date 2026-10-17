import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SmsService } from '../messaging/sms.service';
import { AccountingService } from '../accounting/accounting.service';
import { canSeeTenantRow } from '../common/tenant';
import type { RequestUser } from '../common/ownership.service';
import { CreditProfileService } from './credit-profile.service';
import { allocateRepayments, buildSchedule, canMoveApplication, nextLoanReference, totalRepayable } from './credit-math';
import { ApproveApplicationDto, DisburseApplicationDto, RejectApplicationDto, SubmitApplicationDto } from './dto/credit.dto';

type Ctx =
  | { kind: 'farmer'; farmerId: string }
  | { kind: 'lender'; lenderId: string | null }
  | { kind: 'staff'; tenant: string | null; isSuper: boolean };

const OPEN = ['SUBMITTED', 'UNDER_REVIEW', 'APPROVED'] as const;
const fmt = (n: number) => `TZS ${Math.round(n).toLocaleString()}`;
const r2 = (n: number) => Math.round(n * 100) / 100;

@Injectable()
export class LoanApplicationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly profile: CreditProfileService,
    private readonly sms: SmsService,
    private readonly accounting: AccountingService,
  ) {}

  // ---------- who is asking ----------

  private phoneTail(p?: string | null) {
    const d = (p ?? '').replace(/\D/g, '');
    return d.length >= 9 ? d.slice(-9) : null;
  }

  /** A lender's login is matched to its lender record by contact phone or email. */
  private async lenderFor(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { phone: true, email: true } });
    if (!user) return null;
    const tail = this.phoneTail(user.phone);
    const email = user.email?.trim().toLowerCase();
    const lenders = await this.prisma.lender.findMany({ where: { isActive: true } });
    return (
      lenders.find((l) => (email && l.contactEmail?.trim().toLowerCase() === email) || (tail && (this.phoneTail(l.contactPhone) === tail || this.phoneTail(l.payoutPhone) === tail))) ?? null
    );
  }

  private async context(user: RequestUser): Promise<Ctx> {
    if (user.role === UserRole.FARMER) {
      const farmer = await this.prisma.farmer.findUnique({ where: { userId: user.id }, select: { id: true } });
      if (!farmer) throw new ForbiddenException('A farmer profile is required');
      return { kind: 'farmer', farmerId: farmer.id };
    }
    if (user.role === UserRole.FINANCIAL_PROVIDER) {
      return { kind: 'lender', lenderId: (await this.lenderFor(user.id))?.id ?? null };
    }
    return { kind: 'staff', tenant: user.role === UserRole.SUPER_ADMIN ? null : (user.mamcosId ?? null), isSuper: user.role === UserRole.SUPER_ADMIN };
  }

  private scopeWhere(ctx: Ctx): Prisma.LoanApplicationWhereInput {
    if (ctx.kind === 'farmer') return { farmerId: ctx.farmerId };
    if (ctx.kind === 'lender') return { lenderId: ctx.lenderId ?? '__none__' };
    return ctx.isSuper ? {} : { mamcosId: ctx.tenant };
  }

  private loanScope(ctx: Ctx): Prisma.LoanRecordWhereInput {
    if (ctx.kind === 'farmer') return { farmerId: ctx.farmerId };
    if (ctx.kind === 'lender') return { lenderId: ctx.lenderId ?? '__none__' };
    return ctx.isSuper ? {} : { farmer: { mamcosId: ctx.tenant } };
  }

  private async farmerContact(farmerId: string) {
    const f = await this.prisma.farmer.findUnique({ where: { id: farmerId }, select: { firstName: true, user: { select: { phone: true, language: true } } } });
    return f ? { name: f.firstName, phone: f.user.phone, en: f.user.language === 'en' } : null;
  }

  private async tell(farmerId: string, sw: string, en: string, type: string) {
    const c = await this.farmerContact(farmerId);
    if (c) await this.sms.send(c.phone, c.en ? en : sw, type);
  }

  // ---------- reading ----------

  private include = {
    farmer: { select: { id: true, firstName: true, lastName: true, controlNumber: true, village: true, district: true } },
    lender: { select: { id: true, name: true, interestRatePercent: true } },
  } satisfies Prisma.LoanApplicationInclude;

  private shape(a: Prisma.LoanApplicationGetPayload<{ include: { farmer: { select: { id: true; firstName: true; lastName: true; controlNumber: true; village: true; district: true } }; lender: { select: { id: true; name: true; interestRatePercent: true } } } }>) {
    const amount = a.approvedAmount ?? a.amountRequested;
    const rate = a.interestRatePercent ?? a.lender.interestRatePercent ?? 0;
    const total = totalRepayable(amount, rate, a.termMonths);
    return {
      ...a,
      farmerName: `${a.farmer.firstName} ${a.farmer.lastName}`,
      terms: {
        amount,
        ratePercent: rate,
        totalRepayable: total,
        instalment: r2(total / a.termMonths),
        indicative: a.status !== 'DISBURSED',
      },
    };
  }

  async list(user: RequestUser, filter: { status?: string } = {}) {
    const ctx = await this.context(user);
    const rows = await this.prisma.loanApplication.findMany({
      where: { ...this.scopeWhere(ctx), ...(filter.status ? { status: filter.status as never } : {}) },
      include: this.include,
      orderBy: { createdAt: 'desc' },
      take: 1000,
    });
    return rows.map((r) => this.shape(r));
  }

  private async load(id: string, ctx: Ctx) {
    const a = await this.prisma.loanApplication.findFirst({
      where: { id, ...this.scopeWhere(ctx) },
      include: { ...this.include, loan: { include: { instalments: true } } },
    });
    if (!a) throw new NotFoundException('Loan application not found');
    return a;
  }

  async detail(id: string, user: RequestUser) {
    const ctx = await this.context(user);
    const { loan, ...a } = await this.load(id, ctx);
    const schedule = loan
      ? allocateRepayments(loan.instalments, Math.max(loan.originalAmount - loan.amountOwed, 0))
      : null;
    return {
      ...this.shape(a),
      loan: loan ? { id: loan.id, originalAmount: loan.originalAmount, amountOwed: loan.amountOwed, isActive: loan.isActive } : null,
      schedule,
    };
  }

  /** The live credit profile, for anyone who may read this application. */
  async profileFor(id: string, user: RequestUser) {
    const ctx = await this.context(user);
    const a = await this.load(id, ctx);
    return this.profile.build(a.farmerId);
  }

  /** A farmer's profile for staff in their cooperative, the farmer themselves, or a lender they applied to. */
  async farmerProfile(farmerId: string, user: RequestUser) {
    const ctx = await this.context(user);
    const farmer = await this.prisma.farmer.findUnique({ where: { id: farmerId }, select: { id: true, mamcosId: true } });
    if (!farmer) throw new NotFoundException('Farmer not found');
    if (ctx.kind === 'farmer' && ctx.farmerId !== farmerId) throw new ForbiddenException('You can only see your own credit profile');
    if (ctx.kind === 'staff' && !ctx.isSuper && !canSeeTenantRow({ id: user.id, role: user.role, mamcosId: user.mamcosId }, farmer.mamcosId))
      throw new NotFoundException('Farmer not found');
    if (ctx.kind === 'lender') {
      const applied = ctx.lenderId && (await this.prisma.loanApplication.count({ where: { farmerId, lenderId: ctx.lenderId, status: { not: 'WITHDRAWN' } } }));
      if (!applied) throw new ForbiddenException('You can only see the profile of farmers who applied to you');
    }
    return this.profile.build(farmerId);
  }

  lenders() {
    return this.prisma.lender.findMany({
      where: { isActive: true },
      select: { id: true, name: true, interestRatePercent: true },
      orderBy: { name: 'asc' },
    });
  }

  // ---------- applying ----------

  async submit(dto: SubmitApplicationDto, user: RequestUser) {
    const ctx = await this.context(user);
    if (ctx.kind === 'lender') throw new ForbiddenException('Lenders cannot apply for loans');
    const farmerId = ctx.kind === 'farmer' ? ctx.farmerId : dto.farmerId;
    if (!farmerId) throw new BadRequestException('Choose the farmer this application is for');
    const farmer = await this.prisma.farmer.findUnique({ where: { id: farmerId }, select: { id: true, mamcosId: true, isBlacklisted: true, firstName: true, lastName: true } });
    if (!farmer) throw new NotFoundException('Farmer not found');
    if (ctx.kind === 'staff' && !ctx.isSuper && farmer.mamcosId !== ctx.tenant) throw new NotFoundException('Farmer not found');
    if (farmer.isBlacklisted) throw new ForbiddenException('This farmer cannot apply for finance');

    const lender = await this.prisma.lender.findUnique({ where: { id: dto.lenderId } });
    if (!lender || !lender.isActive) throw new NotFoundException('Lender not found');
    const open = await this.prisma.loanApplication.count({ where: { farmerId, lenderId: lender.id, status: { in: [...OPEN] } } });
    if (open) throw new ConflictException(`There is already an open application with ${lender.name}`);
    if (dto.cropCycleId) {
      const cycle = await this.prisma.cropCycle.findUnique({ where: { id: dto.cropCycleId }, select: { farmerId: true } });
      if (!cycle || cycle.farmerId !== farmerId) throw new BadRequestException('That crop season does not belong to this farmer');
    }

    const profile = await this.profile.build(farmerId);
    const year = new Date().getFullYear();
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const last = await this.prisma.loanApplication.findFirst({ where: { reference: { startsWith: `LA-${year}-` } }, orderBy: { reference: 'desc' }, select: { reference: true } });
      try {
        const created = await this.prisma.loanApplication.create({
          data: {
            reference: nextLoanReference(year, last?.reference),
            farmerId,
            mamcosId: farmer.mamcosId,
            lenderId: lender.id,
            amountRequested: dto.amountRequested,
            termMonths: dto.termMonths,
            purpose: dto.purpose,
            purposeNote: dto.purposeNote,
            cropCycleId: dto.cropCycleId,
            profileSnapshot: profile as unknown as Prisma.InputJsonValue,
            creditScore: profile.score.value,
            submittedByUserId: user.id,
            submittedOnBehalf: ctx.kind === 'staff',
          },
        });
        const name = `${farmer.firstName} ${farmer.lastName}`;
        if (lender.contactPhone) {
          await this.sms.send(lender.contactPhone, `MAYODE: new loan application ${created.reference} from ${name} for ${fmt(dto.amountRequested)} over ${dto.termMonths} months. Open the Credit Dashboard to review.`, 'loan_application');
        }
        if (ctx.kind === 'staff') {
          await this.tell(farmerId, `MAYODE: ombi lako la mkopo ${created.reference} (${fmt(dto.amountRequested)}) limetumwa kwa ${lender.name}.`, `MAYODE: your loan application ${created.reference} (${fmt(dto.amountRequested)}) was sent to ${lender.name}.`, 'loan_application');
        }
        return this.detail(created.id, user);
      } catch (e) {
        if ((e as { code?: string }).code !== 'P2002') throw e;
      }
    }
    throw new ConflictException('Could not allocate an application number; try again');
  }

  async withdraw(id: string, user: RequestUser) {
    const ctx = await this.context(user);
    if (ctx.kind === 'lender') throw new ForbiddenException('Only the applicant or their cooperative can withdraw an application');
    const a = await this.load(id, ctx);
    if (!canMoveApplication(a.status, 'WITHDRAWN')) throw new ConflictException(`A ${a.status.toLowerCase().replace('_', ' ')} application cannot be withdrawn`);
    await this.prisma.loanApplication.update({ where: { id }, data: { status: 'WITHDRAWN' } });
    return this.detail(id, user);
  }

  // ---------- the lender's decision ----------

  private async lenderApp(id: string, user: RequestUser) {
    const ctx = await this.context(user);
    if (ctx.kind !== 'lender') throw new ForbiddenException('Only the lender this application was sent to can decide it');
    const a = await this.prisma.loanApplication.findUnique({ where: { id }, include: { lender: true } });
    if (!a || a.lenderId !== ctx.lenderId) throw new NotFoundException('Loan application not found');
    return a;
  }

  private assertMove(from: string, to: string) {
    if (!canMoveApplication(from, to)) throw new ConflictException(`An application that is ${from.toLowerCase().replace('_', ' ')} cannot become ${to.toLowerCase().replace('_', ' ')}`);
  }

  async startReview(id: string, user: RequestUser) {
    const a = await this.lenderApp(id, user);
    this.assertMove(a.status, 'UNDER_REVIEW');
    await this.prisma.loanApplication.update({ where: { id }, data: { status: 'UNDER_REVIEW', reviewStartedAt: new Date() } });
    return this.detail(id, user);
  }

  async approve(id: string, dto: ApproveApplicationDto, user: RequestUser) {
    const a = await this.lenderApp(id, user);
    this.assertMove(a.status, 'APPROVED');
    if (dto.approvedAmount > a.amountRequested) throw new BadRequestException('The approved amount cannot be more than the amount requested');
    const rate = dto.interestRatePercent ?? a.lender.interestRatePercent ?? 0;
    await this.prisma.loanApplication.update({
      where: { id },
      data: {
        status: 'APPROVED',
        approvedAmount: dto.approvedAmount,
        termMonths: dto.termMonths ?? a.termMonths,
        interestRatePercent: rate,
        autoDeductPercent: dto.autoDeductPercent ?? 50,
        decisionNote: dto.note,
        decidedByUserId: user.id,
        decidedAt: new Date(),
      },
    });
    await this.tell(
      a.farmerId,
      `MAYODE: ombi lako la mkopo ${a.reference} limeidhinishwa na ${a.lender.name}: ${fmt(dto.approvedAmount)}. Utajulishwa fedha zikitolewa.`,
      `MAYODE: your loan application ${a.reference} was approved by ${a.lender.name} for ${fmt(dto.approvedAmount)}. You will be told when the money is released.`,
      'loan_decision',
    );
    return this.detail(id, user);
  }

  async reject(id: string, dto: RejectApplicationDto, user: RequestUser) {
    const a = await this.lenderApp(id, user);
    this.assertMove(a.status, 'REJECTED');
    await this.prisma.loanApplication.update({ where: { id }, data: { status: 'REJECTED', decisionNote: dto.note, decidedByUserId: user.id, decidedAt: new Date() } });
    await this.tell(
      a.farmerId,
      `MAYODE: samahani, ombi lako la mkopo ${a.reference} halikukubaliwa na ${a.lender.name}. Sababu: ${dto.note}`,
      `MAYODE: sorry, your loan application ${a.reference} was not accepted by ${a.lender.name}. Reason: ${dto.note}`,
      'loan_decision',
    );
    return this.detail(id, user);
  }

  /** Money released: the loan is recorded against the farmer with its repayment schedule. */
  async disburse(id: string, dto: DisburseApplicationDto, user: RequestUser) {
    const a = await this.lenderApp(id, user);
    this.assertMove(a.status, 'DISBURSED');
    const principal = dto.amount ?? a.approvedAmount ?? a.amountRequested;
    if (a.approvedAmount && principal > a.approvedAmount) throw new BadRequestException('You cannot release more than was approved');
    const when = dto.disbursedAt ? new Date(dto.disbursedAt) : new Date();
    const rate = a.interestRatePercent ?? a.lender.interestRatePercent ?? 0;
    const total = totalRepayable(principal, rate, a.termMonths);
    const schedule = buildSchedule(total, a.termMonths, when);
    const farmer = await this.prisma.farmer.findUnique({ where: { id: a.farmerId }, select: { id: true } });
    if (!farmer) throw new NotFoundException('Farmer not found');

    const loan = await this.prisma.$transaction(async (tx) => {
      const created = await tx.loanRecord.create({
        data: {
          farmerId: a.farmerId,
          lenderId: a.lenderId,
          lenderName: a.lender.name,
          // What the farmer must repay: principal plus any interest, so sale deductions run it down to zero.
          originalAmount: total,
          amountOwed: total,
          repaymentSchedule: `${a.termMonths} monthly instalments of ${fmt(total / a.termMonths)}`,
          autoDeductPercent: a.autoDeductPercent ?? 50,
          lenderPayoutPhone: a.lender.payoutPhone ?? undefined,
          lenderPayoutName: a.lender.payoutName ?? undefined,
        },
      });
      await tx.loanInstalment.createMany({ data: schedule.map((s) => ({ loanRecordId: created.id, number: s.number, dueDate: s.dueDate, amount: s.amount })) });
      await tx.loanApplication.update({
        where: { id },
        data: { status: 'DISBURSED', disbursedAmount: principal, disbursedAt: when, disbursementRef: dto.reference, loanRecordId: created.id },
      });
      return created;
    });
    await this.accounting.postToLedger('LoanDisbursement', loan.id, when, `Loan disbursement: ${a.lender.name} (${a.reference})`, [
      { code: '1000', debit: principal },
      { code: '2000', credit: principal },
    ]);
    await this.tell(
      a.farmerId,
      `MAYODE: mkopo wako ${a.reference} wa ${fmt(principal)} umetolewa. Marejesho: ${a.termMonths} ya kila mwezi ya ${fmt(total / a.termMonths)}. Sehemu ya mauzo yako itakatwa kulipa.`,
      `MAYODE: your loan ${a.reference} of ${fmt(principal)} has been released. Repayment: ${a.termMonths} monthly instalments of ${fmt(total / a.termMonths)}. Part of your sale payouts will be deducted to pay it.`,
      'loan_decision',
    );
    return this.detail(id, user);
  }

  // ---------- portfolio ----------

  async loans(user: RequestUser) {
    const ctx = await this.context(user);
    const loans = await this.prisma.loanRecord.findMany({
      where: this.loanScope(ctx),
      include: {
        farmer: { select: { firstName: true, lastName: true, controlNumber: true } },
        instalments: true,
        application: { select: { id: true, reference: true, purpose: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 2000,
    });
    const rows = loans.map((l) => {
      const repaid = Math.max(l.originalAmount - l.amountOwed, 0);
      const sched = l.instalments.length ? allocateRepayments(l.instalments, repaid) : null;
      const active = l.isActive && l.amountOwed > 0;
      return {
        id: l.id,
        reference: l.application?.reference ?? null,
        farmer: `${l.farmer.firstName} ${l.farmer.lastName}`,
        controlNumber: l.farmer.controlNumber,
        lender: l.lenderName,
        purpose: l.application?.purpose ?? null,
        original: r2(l.originalAmount),
        outstanding: r2(active ? l.amountOwed : 0),
        repaidPct: l.originalAmount > 0 ? Math.round((repaid / l.originalAmount) * 100) : 100,
        issued: l.createdAt,
        active,
        hasSchedule: !!sched,
        overdueCount: sched?.overdueCount ?? 0,
        overdueAmount: sched?.overdueAmount ?? 0,
        nextDue: sched?.nextDue ? { dueDate: sched.nextDue.dueDate, amount: sched.nextDue.balance } : null,
      };
    });
    return {
      summary: {
        loans: rows.length,
        active: rows.filter((r) => r.active).length,
        lent: r2(rows.reduce((t, r) => t + r.original, 0)),
        outstanding: r2(rows.reduce((t, r) => t + r.outstanding, 0)),
        overdueAmount: r2(rows.reduce((t, r) => t + r.overdueAmount, 0)),
        overdueLoans: rows.filter((r) => r.overdueCount > 0).length,
      },
      rows,
    };
  }

  async schedule(loanId: string, user: RequestUser) {
    const ctx = await this.context(user);
    const loan = await this.prisma.loanRecord.findFirst({ where: { id: loanId, ...this.loanScope(ctx) }, include: { instalments: true } });
    if (!loan) throw new NotFoundException('Loan not found');
    const repaid = Math.max(loan.originalAmount - loan.amountOwed, 0);
    return { loanId, original: loan.originalAmount, outstanding: loan.amountOwed, repaid, ...allocateRepayments(loan.instalments, repaid) };
  }

  async summary(user: RequestUser) {
    const ctx = await this.context(user);
    const rows = await this.prisma.loanApplication.groupBy({
      by: ['status'],
      where: this.scopeWhere(ctx),
      _count: { _all: true },
      _sum: { amountRequested: true, approvedAmount: true, disbursedAmount: true },
    });
    const get = (s: string) => rows.find((r) => r.status === s);
    return {
      counts: Object.fromEntries(['SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'DISBURSED', 'WITHDRAWN'].map((s) => [s, get(s)?._count._all ?? 0])),
      requested: r2(rows.filter((r) => r.status !== 'WITHDRAWN').reduce((t, r) => t + (r._sum.amountRequested ?? 0), 0)),
      approved: r2(['APPROVED', 'DISBURSED'].reduce((t, s) => t + (get(s)?._sum.approvedAmount ?? 0), 0)),
      disbursed: r2(get('DISBURSED')?._sum.disbursedAmount ?? 0),
      lenderLinked: ctx.kind !== 'lender' || ctx.lenderId !== null,
    };
  }
}
