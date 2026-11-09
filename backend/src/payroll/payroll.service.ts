import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OwnershipService, RequestUser } from '../common/ownership.service';
import { AccountingService } from '../accounting/accounting.service';
import { SmsService } from '../messaging/sms.service';
import { writeAudit } from '../irrigation/irrigation-audit';
import { resolveCashAccount } from '../accounting/cash-resolve';
import { STAFF_ACCOUNT } from '../auth/farmer-role';
import { CreatePayeeDto, CreateRunDto, PostRunDto, UpdateLineDto, UpdatePayeeDto } from './dto/payroll.dto';

const num = (v: unknown) => (v == null ? 0 : Number(v));
const cents = (n: number) => Math.round(n * 100) / 100;
const day = (value: string | Date) => new Date(`${(typeof value === 'string' ? value : value.toISOString()).slice(0, 10)}T00:00:00.000Z`);
const today = () => day(new Date());
const periodNow = () => new Date().toISOString().slice(0, 7);
const periodEnd = (period: string) => { const [y, m] = period.split('-').map(Number); return new Date(Date.UTC(y, m, 0)); };
const fullName = (u: { firstName?: string | null; lastName?: string | null; phone?: string; farmer?: { firstName: string; lastName: string } | null }) =>
  `${u.firstName ?? u.farmer?.firstName ?? ''} ${u.lastName ?? u.farmer?.lastName ?? ''}`.trim() || u.phone || 'Unnamed';

const userSelect = {
  id: true, firstName: true, lastName: true, phone: true, language: true, isActive: true,
  customRole: { select: { name: true } },
  farmer: { select: { firstName: true, lastName: true } },
} satisfies Prisma.UserSelect;

/** Salaries for the people the AMCOS employs (staff and leaders) and the monthly pay run, posted to the AMCOS's own ledger. */
@Injectable()
export class PayrollService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ownership: OwnershipService,
    private readonly accounting: AccountingService,
    private readonly sms: SmsService,
  ) {}

  private tenant(actor: RequestUser, requested?: string): string {
    const own = this.ownership.resolveTenantMamcosId(actor);
    const id = own ?? requested ?? null;
    if (!id) throw new BadRequestException('Choose a cooperative');
    if (own && requested && requested !== own) throw new ForbiddenException('You can only manage payroll for your own cooperative');
    return id;
  }

  // ───────────────────────── who is paid ─────────────────────────

  private shapePayee(p: { id: string; title: string; monthlySalary: Prisma.Decimal; startDate: Date; isActive: boolean; user: Prisma.UserGetPayload<{ select: typeof userSelect }> }) {
    return {
      id: p.id, userId: p.user.id, name: fullName(p.user), phone: p.user.phone, roleName: p.user.customRole?.name ?? null,
      title: p.title, monthlySalary: num(p.monthlySalary), startDate: p.startDate, isActive: p.isActive,
    };
  }

  async payees(actor: RequestUser, mamcosIdParam?: string) {
    const mamcosId = this.tenant(actor, mamcosIdParam);
    const rows = await this.prisma.payrollPayee.findMany({ where: { mamcosId }, include: { user: { select: userSelect } }, orderBy: { createdAt: 'asc' } });
    const data = rows.map((r) => this.shapePayee(r)).sort((a, b) => Number(b.isActive) - Number(a.isActive) || a.name.localeCompare(b.name));
    const active = data.filter((d) => d.isActive);
    return { data, summary: { people: active.length, monthlyTotal: cents(active.reduce((n, d) => n + d.monthlySalary, 0)) } };
  }

  /** Staff and leaders of this AMCOS who are not on the payroll yet, with a suggested title. */
  async candidates(actor: RequestUser, mamcosIdParam?: string) {
    const mamcosId = this.tenant(actor, mamcosIdParam);
    const users = await this.prisma.user.findMany({
      where: {
        AND: [STAFF_ACCOUNT], isActive: true,
        OR: [{ mamcosId }, { mamcosStaff: { mamcosId } }],
        payrollPayees: { none: { mamcosId } },
      },
      select: {
        ...userSelect,
        mamcosStaff: { select: { role: true } },
        farmer: { select: { firstName: true, lastName: true, irrigationLeaderships: { where: { status: 'ACTIVE' }, select: { position: true, canal: { select: { code: true } }, block: { select: { code: true } } } } } },
      },
      orderBy: [{ firstName: 'asc' }],
    });
    return users.map((u) => {
      const office = u.farmer?.irrigationLeaderships?.[0];
      const title = office ? `${office.position === 'CANAL_LEADER' ? 'Canal leader' : 'Block leader'} ${office.block?.code ?? office.canal.code}`
        : u.customRole?.name ?? (u.mamcosStaff?.role === 'SECRETARY' ? 'Secretary' : u.mamcosStaff?.role === 'FIELD_OFFICER' ? 'Field officer' : '');
      return { userId: u.id, name: fullName(u), phone: u.phone, suggestedTitle: title };
    });
  }

  async addPayee(actor: RequestUser, dto: CreatePayeeDto, mamcosIdParam?: string) {
    const mamcosId = this.tenant(actor, mamcosIdParam);
    const user = await this.prisma.user.findFirst({
      where: { id: dto.userId, AND: [STAFF_ACCOUNT], OR: [{ mamcosId }, { mamcosStaff: { mamcosId } }] },
      select: { id: true },
    });
    if (!user) throw new NotFoundException('That person is not staff or a leader of this cooperative');
    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const row = await tx.payrollPayee.create({
          data: { mamcosId, userId: dto.userId, title: dto.title.trim(), monthlySalary: dto.monthlySalary, startDate: dto.startDate ? day(dto.startDate) : today(), createdById: actor.id },
          include: { user: { select: userSelect } },
        });
        await writeAudit(tx, actor, 'payroll', row.id, 'add_payee', null, { userId: dto.userId, title: row.title, monthlySalary: dto.monthlySalary });
        return row;
      });
      return this.shapePayee(created);
    } catch (e: any) {
      if (e?.code === 'P2002') throw new ConflictException('That person is already on the payroll');
      throw e;
    }
  }

  async updatePayee(actor: RequestUser, id: string, dto: UpdatePayeeDto, mamcosIdParam?: string) {
    const mamcosId = this.tenant(actor, mamcosIdParam);
    const before = await this.prisma.payrollPayee.findFirst({ where: { id, mamcosId } });
    if (!before) throw new NotFoundException('Payee not found');
    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.payrollPayee.update({
        where: { id },
        data: { ...(dto.title ? { title: dto.title.trim() } : {}), ...(dto.monthlySalary != null ? { monthlySalary: dto.monthlySalary } : {}), ...(dto.isActive != null ? { isActive: dto.isActive } : {}) },
        include: { user: { select: userSelect } },
      });
      await writeAudit(tx, actor, 'payroll', id, 'update_payee',
        { title: before.title, monthlySalary: num(before.monthlySalary), isActive: before.isActive },
        { title: row.title, monthlySalary: num(row.monthlySalary), isActive: row.isActive });
      return row;
    });
    return this.shapePayee(updated);
  }

  // ───────────────────────── pay runs ─────────────────────────

  private async findRun(mamcosId: string, id: string) {
    const run = await this.prisma.payrollRun.findFirst({ where: { id, mamcosId }, include: { lines: { orderBy: { name: 'asc' } } } });
    if (!run) throw new NotFoundException('Pay run not found');
    return run;
  }

  private shapeRun(r: Awaited<ReturnType<PayrollService['findRun']>>) {
    return {
      ...r, totalGross: num(r.totalGross), totalDeductions: num(r.totalDeductions), totalNet: num(r.totalNet),
      lines: r.lines.map((l) => ({ ...l, gross: num(l.gross), deductions: num(l.deductions), net: num(l.net) })),
    };
  }

  async runs(actor: RequestUser, mamcosIdParam?: string) {
    const mamcosId = this.tenant(actor, mamcosIdParam);
    const rows = await this.prisma.payrollRun.findMany({ where: { mamcosId }, orderBy: { period: 'desc' }, include: { _count: { select: { lines: true } } } });
    return rows.map(({ _count, ...r }) => ({ ...r, people: _count.lines, totalGross: num(r.totalGross), totalDeductions: num(r.totalDeductions), totalNet: num(r.totalNet) }));
  }

  async run(actor: RequestUser, id: string, mamcosIdParam?: string) {
    return this.shapeRun(await this.findRun(this.tenant(actor, mamcosIdParam), id));
  }

  /** Starts a month's pay run with everyone currently on the payroll at their salary. It is a draft until posted. */
  async createRun(actor: RequestUser, dto: CreateRunDto, mamcosIdParam?: string) {
    const mamcosId = this.tenant(actor, mamcosIdParam);
    if (dto.period > periodNow()) throw new BadRequestException('You cannot run payroll for a future month');
    const payees = await this.prisma.payrollPayee.findMany({
      where: { mamcosId, isActive: true, startDate: { lte: periodEnd(dto.period) } }, include: { user: { select: userSelect } },
    });
    if (!payees.length) throw new BadRequestException('Nobody is on the payroll for that month. Add people and their salaries first.');
    let id: string;
    try {
      id = await this.prisma.$transaction(async (tx) => {
        const lines = payees.map((p) => ({ payeeId: p.id, name: fullName(p.user), title: p.title, gross: num(p.monthlySalary), deductions: 0, net: num(p.monthlySalary) }));
        const total = cents(lines.reduce((n, l) => n + l.gross, 0));
        const run = await tx.payrollRun.create({
          data: { mamcosId, period: dto.period, note: dto.note?.trim() || null, createdById: actor.id, totalGross: total, totalNet: total, lines: { create: lines } },
        });
        await writeAudit(tx, actor, 'payroll', run.id, 'create_run', null, { period: dto.period, people: lines.length, totalGross: total });
        return run.id;
      });
    } catch (e: any) {
      if (e?.code === 'P2002') throw new ConflictException(`A pay run for ${dto.period} already exists`);
      throw e;
    }
    return this.run(actor, id, mamcosIdParam);
  }

  private async recompute(tx: Prisma.TransactionClient, runId: string) {
    const lines = await tx.payrollLine.findMany({ where: { runId } });
    await tx.payrollRun.update({
      where: { id: runId },
      data: {
        totalGross: cents(lines.reduce((n, l) => n + num(l.gross), 0)),
        totalDeductions: cents(lines.reduce((n, l) => n + num(l.deductions), 0)),
        totalNet: cents(lines.reduce((n, l) => n + num(l.net), 0)),
      },
    });
  }

  async updateLine(actor: RequestUser, runId: string, lineId: string, dto: UpdateLineDto, mamcosIdParam?: string) {
    const mamcosId = this.tenant(actor, mamcosIdParam);
    const run = await this.findRun(mamcosId, runId);
    if (run.status !== 'DRAFT') throw new ConflictException('A posted pay run cannot be changed');
    const line = run.lines.find((l) => l.id === lineId);
    if (!line) throw new NotFoundException('Pay line not found');
    const gross = dto.gross ?? num(line.gross);
    const deductions = dto.deductions ?? num(line.deductions);
    if (deductions > gross) throw new BadRequestException('Deductions cannot be more than the pay');
    await this.prisma.$transaction(async (tx) => {
      await tx.payrollLine.update({
        where: { id: lineId },
        data: { gross, deductions, net: cents(gross - deductions), ...(dto.deductionNote !== undefined ? { deductionNote: dto.deductionNote.trim() || null } : {}) },
      });
      await this.recompute(tx, runId);
      await writeAudit(tx, actor, 'payroll', runId, 'update_line',
        { name: line.name, gross: num(line.gross), deductions: num(line.deductions) }, { name: line.name, gross, deductions });
    });
    return this.run(actor, runId, mamcosIdParam);
  }

  async deleteRun(actor: RequestUser, id: string, mamcosIdParam?: string) {
    const mamcosId = this.tenant(actor, mamcosIdParam);
    const run = await this.findRun(mamcosId, id);
    if (run.status !== 'DRAFT') throw new ConflictException('A posted pay run cannot be deleted');
    await this.prisma.$transaction(async (tx) => {
      await tx.payrollRun.delete({ where: { id } });
      await writeAudit(tx, actor, 'payroll', id, 'delete_run', { period: run.period, status: run.status }, null);
    });
    return { deleted: true };
  }

  /**
   * Pays the run and writes the AMCOS ledger: salaries expense for the full pay, cash for what was paid out, and any
   * deductions held as a payable until they are remitted. The ledger is written first (idempotent per run), then the run
   * is locked as posted, so a failure in between can be retried and never leaves a posted run without its entries.
   */
  async post(actor: RequestUser, id: string, dto: PostRunDto, mamcosIdParam?: string) {
    const mamcosId = this.tenant(actor, mamcosIdParam);
    const run = await this.findRun(mamcosId, id);
    if (run.status !== 'DRAFT') throw new ConflictException('This pay run is already posted');
    const paidOn = dto.paidOn ? day(dto.paidOn) : today();
    if (paidOn > today()) throw new BadRequestException('The payment date cannot be in the future');
    const gross = cents(run.lines.reduce((n, l) => n + num(l.gross), 0));
    const deductions = cents(run.lines.reduce((n, l) => n + num(l.deductions), 0));
    const net = cents(gross - deductions);
    if (!run.lines.length || gross <= 0) throw new BadRequestException('There is nothing to pay in this run');

    const wallet = await resolveCashAccount(this.prisma, mamcosId, { cashAccountId: dto.cashAccountId, method: dto.payMethod });
    await this.accounting.postToLedger('Payroll', run.id, paidOn, `Salaries for ${run.period}`,
      [{ code: '5500', debit: gross }, { code: '1000', credit: net, cashAccountId: wallet }, ...(deductions > 0 ? [{ code: '2300', credit: deductions }] : [])], mamcosId);

    const locked = await this.prisma.$transaction(async (tx) => {
      const res = await tx.payrollRun.updateMany({
        where: { id, status: 'DRAFT' },
        data: { status: 'POSTED', payMethod: dto.payMethod, cashAccountId: wallet, paidOn, postedAt: new Date(), postedById: actor.id, totalGross: gross, totalDeductions: deductions, totalNet: net },
      });
      if (res.count === 1) await writeAudit(tx, actor, 'payroll', id, 'post_run', { status: 'DRAFT' }, { status: 'POSTED', period: run.period, totalGross: gross, totalNet: net, payMethod: dto.payMethod });
      return res.count === 1;
    });
    if (!locked) throw new ConflictException('This pay run was posted by someone else just now');

    const notified = dto.notify ? await this.notify(run.id, run.period, mamcosId) : null;
    return { ...(await this.run(actor, id, mamcosIdParam)), notified };
  }

  /** Texts each person their net pay for the month. Returns how many were sent and how many could not be. */
  private async notify(runId: string, period: string, mamcosId: string) {
    const [mamcos, lines] = await Promise.all([
      this.prisma.mamcos.findUnique({ where: { id: mamcosId }, select: { name: true } }),
      this.prisma.payrollLine.findMany({ where: { runId }, include: { payee: { include: { user: { select: { phone: true, language: true } } } } } }),
    ]);
    let sent = 0, failed = 0;
    for (const l of lines) {
      const amount = num(l.net).toLocaleString('en-US');
      const text = l.payee.user.language === 'en'
        ? `${mamcos?.name ?? 'AMCOS'}: your salary for ${period} has been paid, TZS ${amount}.`
        : `${mamcos?.name ?? 'AMCOS'}: mshahara wako wa ${period} umelipwa, TZS ${amount}.`;
      try { (await this.sms.sendTransactional(l.payee.user.phone, text, 'payroll')) ? sent++ : failed++; } catch { failed++; }
    }
    return { sent, failed };
  }

  async payslip(actor: RequestUser, runId: string, lineId: string, mamcosIdParam?: string) {
    const mamcosId = this.tenant(actor, mamcosIdParam);
    const run = await this.findRun(mamcosId, runId);
    const line = run.lines.find((l) => l.id === lineId);
    if (!line) throw new NotFoundException('Pay line not found');
    const mamcos = await this.prisma.mamcos.findUnique({ where: { id: mamcosId }, select: { name: true } });
    return {
      amcos: mamcos?.name ?? '', period: run.period, status: run.status, paidOn: run.paidOn, payMethod: run.payMethod,
      name: line.name, title: line.title, gross: num(line.gross), deductions: num(line.deductions), deductionNote: line.deductionNote, net: num(line.net),
    };
  }
}
