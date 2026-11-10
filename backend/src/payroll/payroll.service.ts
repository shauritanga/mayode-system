import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ComplianceKind, CostCenter, PayrollTier, Prisma, WageType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OwnershipService, RequestUser } from '../common/ownership.service';
import { AccountingService } from '../accounting/accounting.service';
import { SmsService } from '../messaging/sms.service';
import { writeAudit } from '../irrigation/irrigation-audit';
import { resolveCashAccount } from '../accounting/cash-resolve';
import { STAFF_ACCOUNT } from '../auth/farmer-role';
import { hasGrant } from '../auth/role-access';
import { localDate } from '../accounting/tax';
import { normalizeMsisdn } from '../messaging/sms.service';
import {
  ApproveRunDto, AttendanceDayDto, AttendanceDto, CreatePayeeDto, CreateRunDto, CreateTitleDto, OutputDto, PostRunDto, SubmitRunDto, UpdateLineDto, UpdatePayeeDto, UpdateTitleDto,
} from './dto/payroll.dto';
import { complianceResult, daysOfPeriod, scheduledDays, type ComplianceResult } from './payroll-compliance';

const num = (v: unknown) => (v == null ? 0 : Number(v));
const cents = (n: number) => Math.round(n * 100) / 100;
const tzs = (n: number) => `TZS ${Math.round(n).toLocaleString('en-US')}`;
const day = (value: string | Date) => new Date(`${(typeof value === 'string' ? value : value.toISOString()).slice(0, 10)}T00:00:00.000Z`);
const today = () => day(localDate(new Date()));
const periodNow = () => localDate(new Date()).slice(0, 7);
const periodStart = (period: string) => { const [y, m] = period.split('-').map(Number); return new Date(Date.UTC(y, m - 1, 1)); };
const periodEnd = (period: string) => { const [y, m] = period.split('-').map(Number); return new Date(Date.UTC(y, m, 0)); };

/** The ledger account each budget line's wages are booked to. */
export const WAGE_ACCOUNT: Record<CostCenter, string> = {
  ADMIN_OVERHEAD: '5500', FACILITY_MAINTENANCE: '5510', SECURITY: '5520', IRRIGATION_OPS: '5530', WAREHOUSE_OPS: '5540',
};
export const COST_CENTER_LABEL: Record<CostCenter, string> = {
  ADMIN_OVERHEAD: 'Administrative overhead', FACILITY_MAINTENANCE: 'Facility maintenance', SECURITY: 'Security fund', IRRIGATION_OPS: 'Irrigation operations', WAREHOUSE_OPS: 'Warehouse operations',
};

/** The titles an AMCOS starts with (it can add its own). Created the first time the list is opened. */
const STANDARD_TITLES: { name: string; tier: PayrollTier; costCenter: CostCenter; wageType: WageType; compliance: ComplianceKind }[] = [
  { name: 'Manager', tier: 'CORE_ADMIN', costCenter: 'ADMIN_OVERHEAD', wageType: 'MONTHLY', compliance: 'NONE' },
  { name: 'Accountant', tier: 'CORE_ADMIN', costCenter: 'ADMIN_OVERHEAD', wageType: 'MONTHLY', compliance: 'NONE' },
  { name: 'Cashier', tier: 'CORE_ADMIN', costCenter: 'ADMIN_OVERHEAD', wageType: 'MONTHLY', compliance: 'NONE' },
  { name: 'Procurement Officer', tier: 'CORE_ADMIN', costCenter: 'ADMIN_OVERHEAD', wageType: 'MONTHLY', compliance: 'NONE' },
  { name: 'Canal Chairman', tier: 'FIELD_LEADERSHIP', costCenter: 'IRRIGATION_OPS', wageType: 'MONTHLY', compliance: 'CHAIRMAN_LOG' },
  { name: 'Block Chairman', tier: 'FIELD_LEADERSHIP', costCenter: 'IRRIGATION_OPS', wageType: 'MONTHLY', compliance: 'CHAIRMAN_LOG' },
  { name: 'Water Gate Opener', tier: 'FIELD_LEADERSHIP', costCenter: 'IRRIGATION_OPS', wageType: 'MONTHLY', compliance: 'WATER_LOG' },
  { name: 'Office Cleaner', tier: 'SUPPORT', costCenter: 'FACILITY_MAINTENANCE', wageType: 'MONTHLY', compliance: 'NONE' },
  { name: 'Night Security Guard', tier: 'SUPPORT', costCenter: 'SECURITY', wageType: 'MONTHLY', compliance: 'NONE' },
  { name: 'Warehouse Loader', tier: 'SUPPORT', costCenter: 'WAREHOUSE_OPS', wageType: 'DAILY', compliance: 'NONE' },
  { name: 'Irrigation Maintenance Hand', tier: 'SUPPORT', costCenter: 'IRRIGATION_OPS', wageType: 'DAILY', compliance: 'NONE' },
  { name: 'Seasonal Sorter', tier: 'SUPPORT', costCenter: 'WAREHOUSE_OPS', wageType: 'PIECE', compliance: 'NONE' },
];

const userSelect = {
  id: true, firstName: true, lastName: true, phone: true, language: true, isActive: true,
  customRole: { select: { name: true } },
  farmer: { select: { firstName: true, lastName: true } },
} satisfies Prisma.UserSelect;
type PayeeRow = Prisma.PayrollPayeeGetPayload<{ include: { user: { select: typeof userSelect } } }>;

const nameOf = (p: PayeeRow) => p.fullName?.trim()
  || `${p.user?.firstName ?? p.user?.farmer?.firstName ?? ''} ${p.user?.lastName ?? p.user?.farmer?.lastName ?? ''}`.trim()
  || p.user?.phone || p.phone || 'Unnamed';

/**
 * Pay for everyone the AMCOS employs: staff and leaders with a login, and support workers without one. Pay terms are verified by a
 * Manager; a month's run is compiled from salaries, attendance, output and water-log compliance, reconciled by the Accountant,
 * approved by the Manager against the available money, and only then paid and booked by cost center.
 */
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

  // ───────────────────────── job titles ─────────────────────────

  async titles(actor: RequestUser, mamcosIdParam?: string) {
    const mamcosId = this.tenant(actor, mamcosIdParam);
    if (!(await this.prisma.payrollJobTitle.count({ where: { mamcosId } }))) {
      await this.prisma.payrollJobTitle.createMany({ data: STANDARD_TITLES.map((t) => ({ ...t, mamcosId })), skipDuplicates: true });
    }
    return { data: await this.prisma.payrollJobTitle.findMany({ where: { mamcosId }, orderBy: [{ tier: 'asc' }, { name: 'asc' }] }) };
  }

  async createTitle(actor: RequestUser, dto: CreateTitleDto, mamcosIdParam?: string) {
    const mamcosId = this.tenant(actor, mamcosIdParam);
    try {
      return await this.prisma.payrollJobTitle.create({ data: { mamcosId, name: dto.name.trim(), tier: dto.tier, costCenter: dto.costCenter, wageType: dto.wageType, compliance: dto.compliance ?? 'NONE' } });
    } catch (e: any) {
      if (e?.code === 'P2002') throw new ConflictException('A job title with that name already exists');
      throw e;
    }
  }

  async updateTitle(actor: RequestUser, id: string, dto: UpdateTitleDto, mamcosIdParam?: string) {
    const mamcosId = this.tenant(actor, mamcosIdParam);
    if (!(await this.prisma.payrollJobTitle.findFirst({ where: { id, mamcosId }, select: { id: true } }))) throw new NotFoundException('Job title not found');
    try {
      return await this.prisma.payrollJobTitle.update({ where: { id }, data: { ...(dto.name ? { name: dto.name.trim() } : {}), tier: dto.tier, costCenter: dto.costCenter, wageType: dto.wageType, compliance: dto.compliance, isActive: dto.isActive } });
    } catch (e: any) {
      if (e?.code === 'P2002') throw new ConflictException('A job title with that name already exists');
      throw e;
    }
  }

  // ───────────────────────── who is paid ─────────────────────────

  private shapePayee(p: PayeeRow) {
    return {
      id: p.id, workerCode: p.workerCode, userId: p.userId, hasLogin: !!p.userId, name: nameOf(p), phone: p.phone ?? p.user?.phone ?? null, roleName: p.user?.customRole?.name ?? null,
      idType: p.idType, idNumber: p.idNumber, title: p.title, titleId: p.titleId, tier: p.tier, costCenter: p.costCenter, wageType: p.wageType, compliance: p.compliance,
      monthlySalary: num(p.monthlySalary), rate: p.rate == null ? null : num(p.rate), pieceUnit: p.pieceUnit,
      payoutMethod: p.payoutMethod, payoutAccount: p.payoutAccount, payoutName: p.payoutName,
      startDate: p.startDate, contractEnd: p.contractEnd, contractEnded: !!p.contractEnd && p.contractEnd < today(), isActive: p.isActive,
      verified: !!p.verifiedAt, verifiedAt: p.verifiedAt, createdById: p.createdById,
    };
  }

  async payees(actor: RequestUser, mamcosIdParam?: string) {
    const mamcosId = this.tenant(actor, mamcosIdParam);
    const rows = await this.prisma.payrollPayee.findMany({ where: { mamcosId }, include: { user: { select: userSelect } }, orderBy: { createdAt: 'asc' } });
    const data = rows.map((r) => this.shapePayee(r)).sort((a, b) => Number(b.isActive) - Number(a.isActive) || a.name.localeCompare(b.name));
    const active = data.filter((d) => d.isActive);
    const byTier = (t: PayrollTier) => active.filter((d) => d.tier === t);
    return {
      data,
      summary: {
        people: active.length, monthlyTotal: cents(active.filter((d) => d.wageType === 'MONTHLY').reduce((n, d) => n + d.monthlySalary, 0)),
        unverified: active.filter((d) => !d.verified).length,
        tiers: { CORE_ADMIN: byTier('CORE_ADMIN').length, FIELD_LEADERSHIP: byTier('FIELD_LEADERSHIP').length, SUPPORT: byTier('SUPPORT').length },
      },
    };
  }

  /** Staff and leaders of this AMCOS who are not on the payroll yet, with a suggested title. */
  async candidates(actor: RequestUser, mamcosIdParam?: string) {
    const mamcosId = this.tenant(actor, mamcosIdParam);
    const users = await this.prisma.user.findMany({
      where: { AND: [STAFF_ACCOUNT], isActive: true, OR: [{ mamcosId }, { mamcosStaff: { mamcosId } }], payrollPayees: { none: { mamcosId } } },
      select: {
        ...userSelect,
        mamcosStaff: { select: { role: true } },
        farmer: { select: { firstName: true, lastName: true, irrigationLeaderships: { where: { status: 'ACTIVE' }, select: { position: true, canal: { select: { code: true } }, block: { select: { code: true } } } } } },
      },
      orderBy: [{ firstName: 'asc' }],
    });
    return users.map((u) => {
      const office = u.farmer?.irrigationLeaderships?.[0];
      const title = office ? (office.position === 'CANAL_LEADER' ? 'Canal Chairman' : 'Block Chairman')
        : u.customRole?.name ?? (u.mamcosStaff?.role === 'SECRETARY' ? 'Secretary' : u.mamcosStaff?.role === 'FIELD_OFFICER' ? 'Field officer' : '');
      const name = `${u.firstName ?? u.farmer?.firstName ?? ''} ${u.lastName ?? u.farmer?.lastName ?? ''}`.trim() || u.phone;
      return { userId: u.id, name, phone: u.phone, suggestedTitle: title, office: office ? (office.block?.code ?? office.canal.code) : null };
    });
  }

  private checkWage(wageType: WageType, monthlySalary: number | undefined, rate: number | undefined, pieceUnit: string | undefined) {
    if (wageType === 'MONTHLY' && !(monthlySalary && monthlySalary > 0)) throw new BadRequestException('Enter the monthly salary');
    if (wageType === 'DAILY' && !(rate && rate > 0)) throw new BadRequestException('Enter the daily rate');
    if (wageType === 'PIECE' && !(rate && rate > 0)) throw new BadRequestException('Enter the price per unit');
    if (wageType === 'PIECE' && !pieceUnit?.trim()) throw new BadRequestException('Say what one unit is (a bag, a load, a hectare)');
  }

  private async nextWorkerCode(db: Prisma.TransactionClient | PrismaService, mamcosId: string) {
    const last = await db.payrollPayee.findMany({ where: { mamcosId }, select: { workerCode: true } });
    const max = last.reduce((n, p) => Math.max(n, Number(p.workerCode.replace(/\D/g, '')) || 0), 0);
    return `WK-${String(max + 1).padStart(4, '0')}`;
  }

  /** Adds someone to the payroll. They are not paid until a Manager other than you verifies their pay terms. */
  async addPayee(actor: RequestUser, dto: CreatePayeeDto, mamcosIdParam?: string) {
    const mamcosId = this.tenant(actor, mamcosIdParam);
    // what they are, from a title in the list or from the fields given
    const titleRow = dto.titleId ? await this.prisma.payrollJobTitle.findFirst({ where: { id: dto.titleId, mamcosId, isActive: true } }) : null;
    if (dto.titleId && !titleRow) throw new NotFoundException('Job title not found');
    const title = titleRow?.name ?? dto.title?.trim();
    if (!title) throw new BadRequestException('Choose a job title');
    const tier = titleRow?.tier ?? dto.tier ?? 'SUPPORT';
    const costCenter = titleRow?.costCenter ?? dto.costCenter ?? 'ADMIN_OVERHEAD';
    const wageType = dto.wageType ?? titleRow?.wageType ?? 'MONTHLY';
    const compliance = titleRow?.compliance ?? 'NONE';
    this.checkWage(wageType, dto.monthlySalary, dto.rate, dto.pieceUnit);
    const startDate = dto.startDate ? day(dto.startDate) : today();
    const contractEnd = dto.contractEnd ? day(dto.contractEnd) : null;
    if (contractEnd && contractEnd < startDate) throw new BadRequestException('The contract cannot end before it starts');

    let userId: string | null = null; let fullName: string | null = null; let phone: string | null = null;
    if (dto.userId) {
      const user = await this.prisma.user.findFirst({ where: { id: dto.userId, AND: [STAFF_ACCOUNT], OR: [{ mamcosId }, { mamcosStaff: { mamcosId } }] }, select: { id: true, phone: true } });
      if (!user) throw new NotFoundException('That person is not staff or a leader of this cooperative');
      userId = user.id; phone = user.phone;
    } else {
      if (!dto.fullName?.trim() || !dto.phone?.trim()) throw new BadRequestException('Give the worker’s full name and phone number, or choose a staff member');
      if (!dto.idNumber?.trim()) throw new BadRequestException('Give an ID number (national ID, voter ID or the village letter number), so the worker can be verified');
      fullName = dto.fullName.trim(); phone = normalizeMsisdn(dto.phone);
    }
    const payoutMethod = dto.payoutMethod ?? 'MOBILE_MONEY';
    const payoutAccount = dto.payoutAccount?.trim() || (payoutMethod === 'MOBILE_MONEY' ? phone : null);
    if (!payoutAccount) throw new BadRequestException('Give the bank account number for the payout');

    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const created = await this.prisma.$transaction(async (tx) => {
          const row = await tx.payrollPayee.create({
            data: {
              mamcosId, userId, workerCode: await this.nextWorkerCode(tx, mamcosId), fullName, phone, idType: dto.idType?.trim() || null, idNumber: dto.idNumber?.trim() || null,
              payoutMethod, payoutAccount, payoutName: dto.payoutName?.trim() || fullName, titleId: titleRow?.id ?? null, title, tier, costCenter, wageType, compliance,
              monthlySalary: wageType === 'MONTHLY' ? dto.monthlySalary! : 0, rate: wageType === 'MONTHLY' ? null : dto.rate!, pieceUnit: wageType === 'PIECE' ? dto.pieceUnit!.trim() : null,
              startDate, contractEnd, createdById: actor.id,
            },
            include: { user: { select: userSelect } },
          });
          await writeAudit(tx, actor, 'payroll', row.id, 'add_payee', null, { workerCode: row.workerCode, userId, title, tier, wageType, monthlySalary: num(row.monthlySalary), rate: row.rate == null ? null : num(row.rate) });
          return row;
        });
        return this.shapePayee(created);
      } catch (e: any) {
        const target = JSON.stringify(e?.meta?.target ?? e?.message ?? '');
        if (e?.code === 'P2002' && /worker_code|workerCode/.test(target) && attempt < 3) continue;
        if (e?.code === 'P2002' && /phone/.test(target)) throw new ConflictException('Someone with this phone number is already on the payroll');
        if (e?.code === 'P2002') throw new ConflictException('That person is already on the payroll');
        throw e;
      }
    }
    throw new ConflictException('Could not give the worker an ID. Try again');
  }

  async updatePayee(actor: RequestUser, id: string, dto: UpdatePayeeDto, mamcosIdParam?: string) {
    const mamcosId = this.tenant(actor, mamcosIdParam);
    const before = await this.prisma.payrollPayee.findFirst({ where: { id, mamcosId }, include: { user: { select: userSelect } } });
    if (!before) throw new NotFoundException('Payee not found');
    const titleRow = dto.titleId ? await this.prisma.payrollJobTitle.findFirst({ where: { id: dto.titleId, mamcosId } }) : null;
    if (dto.titleId && !titleRow) throw new NotFoundException('Job title not found');
    const wageType = dto.wageType ?? before.wageType;
    const monthlySalary = dto.monthlySalary ?? num(before.monthlySalary);
    const rate = dto.rate ?? (before.rate == null ? undefined : num(before.rate));
    const pieceUnit = dto.pieceUnit ?? before.pieceUnit ?? undefined;
    if (dto.wageType || dto.monthlySalary != null || dto.rate != null || dto.pieceUnit) this.checkWage(wageType, monthlySalary, rate, pieceUnit);
    const contractEnd = dto.contractEnd ? day(dto.contractEnd) : undefined;
    if (contractEnd && contractEnd < before.startDate) throw new BadRequestException('The contract cannot end before it starts');
    // any change to what they are paid, or where it goes, must be verified again
    const termsChanged = (dto.wageType && dto.wageType !== before.wageType) || (dto.monthlySalary != null && dto.monthlySalary !== num(before.monthlySalary))
      || (dto.rate != null && dto.rate !== num(before.rate)) || (dto.payoutAccount != null && dto.payoutAccount.trim() !== before.payoutAccount)
      || (dto.payoutMethod != null && dto.payoutMethod !== before.payoutMethod);
    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.payrollPayee.update({
        where: { id },
        data: {
          ...(titleRow ? { titleId: titleRow.id, title: titleRow.name, tier: titleRow.tier, costCenter: titleRow.costCenter, compliance: titleRow.compliance } : dto.title ? { title: dto.title.trim() } : {}),
          wageType, monthlySalary: wageType === 'MONTHLY' ? monthlySalary : 0, rate: wageType === 'MONTHLY' ? null : rate ?? null, pieceUnit: wageType === 'PIECE' ? pieceUnit ?? null : null,
          ...(dto.payoutMethod ? { payoutMethod: dto.payoutMethod } : {}), ...(dto.payoutAccount != null ? { payoutAccount: dto.payoutAccount.trim() } : {}), ...(dto.payoutName != null ? { payoutName: dto.payoutName.trim() } : {}),
          ...(contractEnd ? { contractEnd } : {}), ...(dto.isActive != null ? { isActive: dto.isActive } : {}),
          ...(termsChanged ? { verifiedAt: null, verifiedById: null } : {}),
        },
        include: { user: { select: userSelect } },
      });
      await writeAudit(tx, actor, 'payroll', id, 'update_payee',
        { title: before.title, wageType: before.wageType, monthlySalary: num(before.monthlySalary), rate: before.rate == null ? null : num(before.rate), isActive: before.isActive, payoutAccount: before.payoutAccount },
        { title: row.title, wageType: row.wageType, monthlySalary: num(row.monthlySalary), rate: row.rate == null ? null : num(row.rate), isActive: row.isActive, payoutAccount: row.payoutAccount, verificationCleared: termsChanged });
      return row;
    });
    return this.shapePayee(updated);
  }

  /** The Manager confirms the person is real and the pay terms are right. Not the person who added them. */
  async verifyPayee(actor: RequestUser, id: string, mamcosIdParam?: string) {
    const mamcosId = this.tenant(actor, mamcosIdParam);
    const p = await this.prisma.payrollPayee.findFirst({ where: { id, mamcosId } });
    if (!p) throw new NotFoundException('Payee not found');
    if (p.verifiedAt) throw new ConflictException('This person is already verified');
    if (p.createdById && p.createdById === actor.id) throw new ConflictException('Someone other than the person who added this worker must verify them');
    const row = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.payrollPayee.updateMany({ where: { id, verifiedAt: null }, data: { verifiedAt: new Date(), verifiedById: actor.id } });
      if (!claimed.count) throw new ConflictException('This person is already verified');
      await writeAudit(tx, actor, 'payroll', id, 'verify_payee', null, { workerCode: p.workerCode });
      return tx.payrollPayee.findUniqueOrThrow({ where: { id }, include: { user: { select: userSelect } } });
    });
    return this.shapePayee(row);
  }

  /** Everything this person has been paid, run by run: the auditable payment history. */
  async history(actor: RequestUser, id: string, mamcosIdParam?: string) {
    const mamcosId = this.tenant(actor, mamcosIdParam);
    const p = await this.prisma.payrollPayee.findFirst({ where: { id, mamcosId }, include: { user: { select: userSelect } } });
    if (!p) throw new NotFoundException('Payee not found');
    const lines = await this.prisma.payrollLine.findMany({ where: { payeeId: id, run: { status: 'POSTED' } }, include: { run: { select: { period: true, paidOn: true, payMethod: true } } }, orderBy: { run: { period: 'desc' } } });
    return {
      payee: this.shapePayee(p),
      payments: lines.map((l) => ({ period: l.run.period, paidOn: l.run.paidOn, payMethod: l.run.payMethod, title: l.title, basis: l.basis, gross: num(l.gross), deductions: num(l.deductions), net: num(l.net) })),
      totalPaid: cents(lines.reduce((n, l) => n + num(l.net), 0)),
    };
  }

  // ───────────────────────── attendance and output ─────────────────────────

  private async worker(mamcosId: string, payeeId: string, wageType: WageType) {
    const p = await this.prisma.payrollPayee.findFirst({ where: { id: payeeId, mamcosId } });
    if (!p) throw new NotFoundException('Worker not found');
    if (!p.isActive) throw new ConflictException('This worker is no longer on the payroll');
    if (p.wageType !== wageType) throw new ConflictException(wageType === 'DAILY' ? 'Only workers paid by the day have attendance' : 'Only workers paid per piece have output recorded');
    return p;
  }

  private checkDay(p: { startDate: Date; contractEnd: Date | null; userId: string | null }, date: Date, actor: RequestUser) {
    if (date > today()) throw new BadRequestException('You cannot record a day that has not happened');
    if (date < new Date(today().getTime() - 62 * 86_400_000)) throw new BadRequestException('That day is too long ago to record');
    if (date < p.startDate || (p.contractEnd && date > p.contractEnd)) throw new BadRequestException('That day is outside the worker’s contract');
    if (p.userId && p.userId === actor.id) throw new ForbiddenException('You cannot record your own attendance or output');
  }

  async markAttendance(actor: RequestUser, dto: AttendanceDto, mamcosIdParam?: string) {
    const mamcosId = this.tenant(actor, mamcosIdParam);
    const p = await this.worker(mamcosId, dto.payeeId, 'DAILY');
    const date = day(dto.date);
    this.checkDay(p, date, actor);
    const fraction = dto.fraction ?? 1;
    return this.prisma.payrollAttendance.upsert({
      where: { payeeId_date: { payeeId: p.id, date } },
      create: { mamcosId, payeeId: p.id, date, fraction, note: dto.note?.trim() || null, recordedById: actor.id },
      update: { fraction, note: dto.note?.trim() || null, recordedById: actor.id },
    });
  }

  /** Marks several workers present for one day. */
  async markDay(actor: RequestUser, dto: AttendanceDayDto, mamcosIdParam?: string) {
    const mamcosId = this.tenant(actor, mamcosIdParam);
    let marked = 0;
    for (const payeeId of [...new Set(dto.payeeIds)]) {
      const p = await this.worker(mamcosId, payeeId, 'DAILY');
      const date = day(dto.date);
      this.checkDay(p, date, actor);
      await this.prisma.payrollAttendance.upsert({ where: { payeeId_date: { payeeId, date } }, create: { mamcosId, payeeId, date, fraction: 1, recordedById: actor.id }, update: { recordedById: actor.id } });
      marked++;
    }
    return { marked };
  }

  async removeAttendance(actor: RequestUser, id: string, mamcosIdParam?: string) {
    const mamcosId = this.tenant(actor, mamcosIdParam);
    const a = await this.prisma.payrollAttendance.findFirst({ where: { id, mamcosId } });
    if (!a) throw new NotFoundException('Attendance entry not found');
    const frozen = await this.prisma.payrollRun.findFirst({ where: { mamcosId, period: a.date.toISOString().slice(0, 7), status: { in: ['SUBMITTED', 'APPROVED', 'POSTED'] } }, select: { id: true } });
    if (frozen) throw new ConflictException('That month’s pay run is already with the Manager or paid: it cannot change');
    await this.prisma.payrollAttendance.delete({ where: { id } });
    return { removed: true };
  }

  async attendance(actor: RequestUser, q: { period?: string; payeeId?: string }, mamcosIdParam?: string) {
    const mamcosId = this.tenant(actor, mamcosIdParam);
    const period = q.period && /^\d{4}-\d{2}$/.test(q.period) ? q.period : periodNow();
    const rows = await this.prisma.payrollAttendance.findMany({
      where: { mamcosId, date: { gte: periodStart(period), lte: periodEnd(period) }, ...(q.payeeId ? { payeeId: q.payeeId } : {}) }, orderBy: [{ date: 'desc' }], include: { payee: { include: { user: { select: userSelect } } } },
    });
    return { period, data: rows.map((r) => ({ id: r.id, payeeId: r.payeeId, name: nameOf(r.payee), workerCode: r.payee.workerCode, date: r.date, fraction: num(r.fraction), note: r.note, recordedById: r.recordedById })) };
  }

  async addOutput(actor: RequestUser, dto: OutputDto, mamcosIdParam?: string) {
    const mamcosId = this.tenant(actor, mamcosIdParam);
    const p = await this.worker(mamcosId, dto.payeeId, 'PIECE');
    const date = day(dto.date);
    this.checkDay(p, date, actor);
    return this.prisma.payrollOutput.create({ data: { mamcosId, payeeId: p.id, date, quantity: dto.quantity, note: dto.note?.trim() || null, recordedById: actor.id } });
  }

  async outputs(actor: RequestUser, q: { period?: string; payeeId?: string }, mamcosIdParam?: string) {
    const mamcosId = this.tenant(actor, mamcosIdParam);
    const period = q.period && /^\d{4}-\d{2}$/.test(q.period) ? q.period : periodNow();
    const rows = await this.prisma.payrollOutput.findMany({
      where: { mamcosId, date: { gte: periodStart(period), lte: periodEnd(period) }, ...(q.payeeId ? { payeeId: q.payeeId } : {}) }, orderBy: [{ date: 'desc' }], include: { payee: { include: { user: { select: userSelect } } } },
    });
    return { period, data: rows.map((r) => ({ id: r.id, payeeId: r.payeeId, name: nameOf(r.payee), unit: r.payee.pieceUnit, date: r.date, quantity: num(r.quantity), note: r.note })) };
  }

  // ───────────────────────── budgets ─────────────────────────

  async budgets(actor: RequestUser, mamcosIdParam?: string) {
    const mamcosId = this.tenant(actor, mamcosIdParam);
    const rows = await this.prisma.payrollBudget.findMany({ where: { mamcosId } });
    const byCenter = new Map(rows.map((r) => [r.costCenter, num(r.monthlyLimit)]));
    return { data: (Object.keys(WAGE_ACCOUNT) as CostCenter[]).map((c) => ({ costCenter: c, label: COST_CENTER_LABEL[c], monthlyLimit: byCenter.get(c) ?? null })) };
  }

  async setBudget(actor: RequestUser, costCenter: CostCenter, monthlyLimit: number, mamcosIdParam?: string) {
    const mamcosId = this.tenant(actor, mamcosIdParam);
    if (!(costCenter in WAGE_ACCOUNT)) throw new BadRequestException('Choose a budget line');
    await this.prisma.payrollBudget.upsert({ where: { mamcosId_costCenter: { mamcosId, costCenter } }, create: { mamcosId, costCenter, monthlyLimit, updatedById: actor.id }, update: { monthlyLimit, updatedById: actor.id } });
    return this.budgets(actor, mamcosIdParam);
  }

  // ───────────────────────── compiling a month ─────────────────────────

  /** Share of a stipend earned from the water log: a gate opener from the days they logged, a chairman from the entries they made. */
  async complianceOf(mamcosId: string, payee: { id: string; userId: string | null; compliance: ComplianceKind }, period: string): Promise<ComplianceResult | null> {
    if (payee.compliance === 'NONE') return null;
    const start = periodStart(period); const end = periodEnd(period);
    const windowed = { startsOn: { lte: end }, OR: [{ endsOn: null }, { endsOn: { gte: start } }] };
    let schedules: { weekdays: number[]; startsOn: Date; endsOn: Date | null }[] = [];
    let loggedDays = new Set<string>();
    if (payee.compliance === 'WATER_LOG') {
      schedules = await this.prisma.waterSchedule.findMany({ where: { mamcosId, isActive: true, gateOpenerPayeeId: payee.id, ...windowed } });
      const logs = await this.prisma.waterLog.findMany({ where: { mamcosId, gateOpenerPayeeId: payee.id, date: { gte: start, lte: end } }, select: { date: true } });
      loggedDays = new Set(logs.map((l) => l.date.toISOString().slice(0, 10)));
    } else {
      if (!payee.userId) return { factor: 1, pct: null, scheduled: 0, logged: 0, note: 'No login to check logging against' };
      const farmer = await this.prisma.farmer.findUnique({ where: { userId: payee.userId }, select: { id: true } });
      const offices = farmer ? await this.prisma.irrigationLeadership.findMany({ where: { farmerId: farmer.id, status: 'ACTIVE' }, select: { position: true, canalId: true, blockId: true } }) : [];
      const blockIds = offices.filter((o) => o.position === 'BLOCK_LEADER' && o.blockId).map((o) => o.blockId as string);
      const canalIds = offices.map((o) => o.canalId);
      const ownCanal = offices.filter((o) => o.position === 'CANAL_LEADER').map((o) => o.canalId);
      schedules = await this.prisma.waterSchedule.findMany({
        where: { mamcosId, isActive: true, ...windowed, OR: [{ canalId: { in: ownCanal } }, { blockId: { in: blockIds } }, { blockId: null, canalId: { in: canalIds } }] },
      });
      const logs = await this.prisma.waterLog.findMany({ where: { mamcosId, loggedById: payee.userId, date: { gte: start, lte: end }, OR: [{ canalId: { in: ownCanal } }, { blockId: { in: blockIds } }, { canalId: { in: canalIds } }] }, select: { date: true } });
      loggedDays = new Set(logs.map((l) => l.date.toISOString().slice(0, 10)));
    }
    const scheduled = new Set<string>();
    for (const s of schedules) for (const d of scheduledDays(s, period)) scheduled.add(d);
    return complianceResult(scheduled.size, [...scheduled].filter((d) => loggedDays.has(d)).length);
  }

  /** Turns the people on the payroll into one pay line each for the month. */
  private async compile(mamcosId: string, period: string) {
    const start = periodStart(period); const end = periodEnd(period);
    const payees = await this.prisma.payrollPayee.findMany({
      where: { mamcosId, isActive: true, startDate: { lte: end }, OR: [{ contractEnd: null }, { contractEnd: { gte: start } }] }, include: { user: { select: userSelect } },
    });
    const skipped: { name: string; reason: string }[] = [];
    const lines: Prisma.PayrollLineCreateManyRunInput[] = [];
    for (const p of payees) {
      if (!p.verifiedAt) { skipped.push({ name: nameOf(p), reason: 'Not verified by a Manager yet' }); continue; }
      const base = { payeeId: p.id, name: nameOf(p), title: p.title, tier: p.tier, costCenter: p.costCenter, wageType: p.wageType, deductions: 0 };
      if (p.wageType === 'MONTHLY') {
        const salary = num(p.monthlySalary);
        const c = await this.complianceOf(mamcosId, p, period);
        const gross = cents(salary * (c?.factor ?? 1));
        lines.push({ ...base, gross, net: gross, rate: salary, complianceFactor: c ? c.factor : null, basis: c ? `Stipend ${tzs(salary)}: ${c.note}` : `Fixed monthly salary ${tzs(salary)}` });
      } else if (p.wageType === 'DAILY') {
        const att = await this.prisma.payrollAttendance.findMany({ where: { payeeId: p.id, date: { gte: start, lte: end } }, select: { fraction: true } });
        const days = cents(att.reduce((n, a) => n + num(a.fraction), 0));
        const rate = num(p.rate);
        const gross = cents(days * rate);
        if (gross <= 0) { skipped.push({ name: nameOf(p), reason: 'No days recorded this month' }); continue; }
        lines.push({ ...base, gross, net: gross, units: days, rate, basis: `${days} day(s) × ${tzs(rate)}` });
      } else {
        const out = await this.prisma.payrollOutput.findMany({ where: { payeeId: p.id, date: { gte: start, lte: end } }, select: { quantity: true } });
        const qty = cents(out.reduce((n, o) => n + num(o.quantity), 0));
        const rate = num(p.rate);
        const gross = cents(qty * rate);
        if (gross <= 0) { skipped.push({ name: nameOf(p), reason: 'No output recorded this month' }); continue; }
        lines.push({ ...base, gross, net: gross, units: qty, rate, basis: `${qty} ${p.pieceUnit ?? 'unit'}(s) × ${tzs(rate)}` });
      }
    }
    return { lines, skipped };
  }

  // ───────────────────────── pay runs ─────────────────────────

  private async findRun(mamcosId: string, id: string) {
    const run = await this.prisma.payrollRun.findFirst({ where: { id, mamcosId }, include: { lines: { orderBy: [{ tier: 'asc' }, { name: 'asc' }] } } });
    if (!run) throw new NotFoundException('Pay run not found');
    return run;
  }

  private async liquidity(mamcosId: string, cashAccountId: string | null) {
    const agg = await this.prisma.ledgerEntry.aggregate({ where: { mamcosId, cashAccountId, account: { code: '1000' } }, _sum: { debit: true, credit: true } });
    return cents((agg._sum.debit ?? 0) - (agg._sum.credit ?? 0));
  }

  /** Cost-center subtotals of a run and whether each is within its budget. */
  private async budgetCheck(mamcosId: string, lines: { costCenter: CostCenter; gross: unknown }[]) {
    const budgets = await this.prisma.payrollBudget.findMany({ where: { mamcosId } });
    const limit = new Map(budgets.map((b) => [b.costCenter, num(b.monthlyLimit)]));
    const totals = new Map<CostCenter, number>();
    for (const l of lines) totals.set(l.costCenter, cents((totals.get(l.costCenter) ?? 0) + num(l.gross)));
    return [...totals].map(([costCenter, gross]) => ({ costCenter, label: COST_CENTER_LABEL[costCenter], gross, limit: limit.get(costCenter) ?? null, over: limit.has(costCenter) && gross > (limit.get(costCenter) as number) }));
  }

  private async shapeRun(r: Awaited<ReturnType<PayrollService['findRun']>>) {
    const centers = await this.budgetCheck(r.mamcosId, r.lines);
    const tiers = (['CORE_ADMIN', 'FIELD_LEADERSHIP', 'SUPPORT'] as PayrollTier[]).map((t) => {
      const mine = r.lines.filter((l) => l.tier === t);
      return { tier: t, people: mine.length, gross: cents(mine.reduce((n, l) => n + num(l.gross), 0)), net: cents(mine.reduce((n, l) => n + num(l.net), 0)) };
    });
    const wallet = r.approvedCashAccountId ?? null;
    return {
      ...r, totalGross: num(r.totalGross), totalDeductions: num(r.totalDeductions), totalNet: num(r.totalNet),
      lines: r.lines.map((l) => ({ ...l, gross: num(l.gross), deductions: num(l.deductions), net: num(l.net), units: l.units == null ? null : num(l.units), rate: l.rate == null ? null : num(l.rate), complianceFactor: l.complianceFactor == null ? null : num(l.complianceFactor) })),
      tiers, costCenters: centers, overBudget: centers.some((c) => c.over),
      available: r.status === 'APPROVED' || r.status === 'POSTED' ? await this.liquidity(r.mamcosId, wallet) : null,
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

  /** Compiles a month's pay from salaries, attendance, output and water-log compliance. A draft until it is submitted. */
  async createRun(actor: RequestUser, dto: CreateRunDto, mamcosIdParam?: string) {
    const mamcosId = this.tenant(actor, mamcosIdParam);
    if (dto.period > periodNow()) throw new BadRequestException('You cannot run payroll for a future month');
    const { lines, skipped } = await this.compile(mamcosId, dto.period);
    if (!lines.length) throw new BadRequestException(skipped.length ? 'Nobody is ready to be paid for that month: verify the people added, and record attendance or output.' : 'Nobody is on the payroll for that month. Add people and their pay first.');
    let id: string;
    try {
      id = await this.prisma.$transaction(async (tx) => {
        const total = cents(lines.reduce((n, l) => n + num(l.gross), 0));
        const run = await tx.payrollRun.create({ data: { mamcosId, period: dto.period, note: dto.note?.trim() || null, createdById: actor.id, totalGross: total, totalNet: total, lines: { create: lines } } });
        await writeAudit(tx, actor, 'payroll', run.id, 'create_run', null, { period: dto.period, people: lines.length, totalGross: total, skipped: skipped.length });
        return run.id;
      });
    } catch (e: any) {
      if (e?.code === 'P2002') throw new ConflictException(`A pay run for ${dto.period} already exists`);
      throw e;
    }
    return { ...(await this.run(actor, id, mamcosIdParam)), skipped };
  }

  /** Rebuilds a draft from the latest attendance, output and water logs. Hand edits to its lines are replaced. */
  async recompile(actor: RequestUser, id: string, mamcosIdParam?: string) {
    const mamcosId = this.tenant(actor, mamcosIdParam);
    const run = await this.findRun(mamcosId, id);
    if (run.status !== 'DRAFT') throw new ConflictException('Only a draft can be rebuilt');
    const { lines, skipped } = await this.compile(mamcosId, run.period);
    if (!lines.length) throw new BadRequestException('Nobody is ready to be paid for that month');
    await this.prisma.$transaction(async (tx) => {
      await tx.payrollLine.deleteMany({ where: { runId: id } });
      await tx.payrollLine.createMany({ data: lines.map((l) => ({ ...l, runId: id })) });
      await this.recompute(tx, id);
      await writeAudit(tx, actor, 'payroll', id, 'recompile_run', null, { people: lines.length });
    });
    return { ...(await this.run(actor, id, mamcosIdParam)), skipped };
  }

  private async recompute(tx: Prisma.TransactionClient, runId: string) {
    const lines = await tx.payrollLine.findMany({ where: { runId } });
    await tx.payrollRun.update({
      where: { id: runId },
      data: { totalGross: cents(lines.reduce((n, l) => n + num(l.gross), 0)), totalDeductions: cents(lines.reduce((n, l) => n + num(l.deductions), 0)), totalNet: cents(lines.reduce((n, l) => n + num(l.net), 0)) },
    });
  }

  async updateLine(actor: RequestUser, runId: string, lineId: string, dto: UpdateLineDto, mamcosIdParam?: string) {
    const mamcosId = this.tenant(actor, mamcosIdParam);
    const run = await this.findRun(mamcosId, runId);
    if (run.status !== 'DRAFT') throw new ConflictException('Only a draft pay run can be changed. Ask the Manager to send it back first');
    const line = run.lines.find((l) => l.id === lineId);
    if (!line) throw new NotFoundException('Pay line not found');
    const gross = dto.gross ?? num(line.gross);
    const deductions = dto.deductions ?? num(line.deductions);
    if (deductions > gross) throw new BadRequestException('Deductions cannot be more than the pay');
    if (dto.gross != null && dto.gross !== num(line.gross) && !dto.deductionNote?.trim() && !line.deductionNote) throw new BadRequestException('Say why the pay differs from what was worked out');
    await this.prisma.$transaction(async (tx) => {
      await tx.payrollLine.update({
        where: { id: lineId },
        data: { gross, deductions, net: cents(gross - deductions), ...(dto.deductionNote !== undefined ? { deductionNote: dto.deductionNote.trim() || null } : {}) },
      });
      await this.recompute(tx, runId);
      await writeAudit(tx, actor, 'payroll', runId, 'update_line', { name: line.name, gross: num(line.gross), deductions: num(line.deductions) }, { name: line.name, gross, deductions });
    });
    return this.run(actor, runId, mamcosIdParam);
  }

  async deleteRun(actor: RequestUser, id: string, mamcosIdParam?: string) {
    const mamcosId = this.tenant(actor, mamcosIdParam);
    const run = await this.findRun(mamcosId, id);
    if (run.status !== 'DRAFT') throw new ConflictException('Only a draft pay run can be deleted');
    await this.prisma.$transaction(async (tx) => {
      await tx.payrollRun.delete({ where: { id } });
      await writeAudit(tx, actor, 'payroll', id, 'delete_run', { period: run.period, status: run.status }, null);
    });
    return { deleted: true };
  }

  /** The Accountant has reconciled the run and sends it to the Manager. A budget line over its limit stops it. */
  async submit(actor: RequestUser, id: string, dto: SubmitRunDto, mamcosIdParam?: string) {
    const mamcosId = this.tenant(actor, mamcosIdParam);
    const run = await this.findRun(mamcosId, id);
    if (run.status !== 'DRAFT') throw new ConflictException('Only a draft can be submitted');
    if (!run.lines.length) throw new BadRequestException('There is nothing to pay in this run');
    const over = (await this.budgetCheck(mamcosId, run.lines)).filter((c) => c.over);
    if (over.length) throw new ConflictException(`Over budget: ${over.map((c) => `${c.label} ${tzs(c.gross)} against a limit of ${tzs(c.limit as number)}`).join('; ')}`);
    const claimed = await this.prisma.payrollRun.updateMany({ where: { id, status: 'DRAFT' }, data: { status: 'SUBMITTED', submittedById: actor.id, submittedAt: new Date(), ...(dto.note?.trim() ? { note: dto.note.trim() } : {}) } });
    if (!claimed.count) throw new ConflictException('This pay run has changed. Reload and try again');
    await writeAudit(this.prisma, actor, 'payroll', id, 'submit_run', { status: 'DRAFT' }, { status: 'SUBMITTED', totalNet: num(run.totalNet) });
    return this.run(actor, id, mamcosIdParam);
  }

  /** The Manager does not accept the run: it goes back to the Accountant with the reason. */
  async returnRun(actor: RequestUser, id: string, reason: string, mamcosIdParam?: string) {
    const mamcosId = this.tenant(actor, mamcosIdParam);
    const run = await this.findRun(mamcosId, id);
    if (run.status !== 'SUBMITTED' && run.status !== 'APPROVED') throw new ConflictException('Only a submitted pay run can be sent back');
    const claimed = await this.prisma.payrollRun.updateMany({ where: { id, status: run.status }, data: { status: 'DRAFT', submittedById: null, submittedAt: null, approvedById: null, approvedAt: null, approvedCashAccountId: null, payMethod: null, approveNote: `Sent back: ${reason.trim()}` } });
    if (!claimed.count) throw new ConflictException('This pay run has changed. Reload and try again');
    await writeAudit(this.prisma, actor, 'payroll', id, 'return_run', { status: run.status }, { status: 'DRAFT', reason: reason.trim() });
    return this.run(actor, id, mamcosIdParam);
  }

  /**
   * The Manager checks the money and authorises the payment from one account. The account's balance must cover the run;
   * the approver is not the person who submitted it.
   */
  async approve(actor: RequestUser, id: string, dto: ApproveRunDto, mamcosIdParam?: string) {
    const mamcosId = this.tenant(actor, mamcosIdParam);
    const run = await this.findRun(mamcosId, id);
    if (run.status !== 'SUBMITTED') throw new ConflictException('The Accountant must submit the pay run first');
    if (run.submittedById && run.submittedById === actor.id) throw new ConflictException('A pay run must be approved by someone other than the person who submitted it');
    const over = (await this.budgetCheck(mamcosId, run.lines)).filter((c) => c.over);
    if (over.length) throw new ConflictException(`Over budget: ${over.map((c) => c.label).join(', ')}`);
    const wallet = await resolveCashAccount(this.prisma, mamcosId, { cashAccountId: dto.cashAccountId, method: dto.payMethod });
    const net = cents(run.lines.reduce((n, l) => n + num(l.net), 0));
    const available = await this.liquidity(mamcosId, wallet);
    if (available < net) throw new ConflictException(`Not enough money in this account: ${tzs(available)} available, ${tzs(net)} needed`);
    const claimed = await this.prisma.payrollRun.updateMany({ where: { id, status: 'SUBMITTED' }, data: { status: 'APPROVED', approvedById: actor.id, approvedAt: new Date(), approvedCashAccountId: wallet, payMethod: dto.payMethod, approveNote: dto.note?.trim() || null } });
    if (!claimed.count) throw new ConflictException('This pay run has changed. Reload and try again');
    await writeAudit(this.prisma, actor, 'payroll', id, 'approve_run', { status: 'SUBMITTED' }, { status: 'APPROVED', totalNet: net, available, payMethod: dto.payMethod });
    return this.run(actor, id, mamcosIdParam);
  }

  /**
   * Pays the approved run and books it: each cost center's wages to its own expense account, cash out for what was paid, and any
   * deductions held as a payable. Not the Manager who approved it. The ledger is written first (idempotent per run), then the run is
   * locked, so a failure in between can be retried and never leaves a posted run without its entries.
   */
  async post(actor: RequestUser, id: string, dto: PostRunDto, mamcosIdParam?: string) {
    const mamcosId = this.tenant(actor, mamcosIdParam);
    const run = await this.findRun(mamcosId, id);
    if (run.status === 'POSTED') throw new ConflictException('This pay run is already posted');
    if (run.status !== 'APPROVED') throw new ConflictException('The Manager must approve the pay run before it can be paid');
    if (run.approvedById && run.approvedById === actor.id) throw new ConflictException('The payment must be made by someone other than the Manager who approved it');
    const paidOn = dto.paidOn ? day(dto.paidOn) : today();
    if (paidOn > today()) throw new BadRequestException('The payment date cannot be in the future');
    const gross = cents(run.lines.reduce((n, l) => n + num(l.gross), 0));
    const deductions = cents(run.lines.reduce((n, l) => n + num(l.deductions), 0));
    const net = cents(gross - deductions);
    if (!run.lines.length || gross <= 0) throw new BadRequestException('There is nothing to pay in this run');
    const wallet = run.approvedCashAccountId ?? null;
    const available = await this.liquidity(mamcosId, wallet);
    if (available < net) throw new ConflictException(`Not enough money in the approved account any more: ${tzs(available)} available, ${tzs(net)} needed`);

    const byCenter = new Map<CostCenter, number>();
    for (const l of run.lines) byCenter.set(l.costCenter, cents((byCenter.get(l.costCenter) ?? 0) + num(l.gross)));
    await this.accounting.postToLedger('Payroll', run.id, paidOn, `Salaries for ${run.period}`,
      [...[...byCenter].map(([c, amount]) => ({ code: WAGE_ACCOUNT[c], debit: amount })), { code: '1000', credit: net, cashAccountId: wallet }, ...(deductions > 0 ? [{ code: '2300', credit: deductions }] : [])], mamcosId);

    const locked = await this.prisma.$transaction(async (tx) => {
      const res = await tx.payrollRun.updateMany({
        where: { id, status: 'APPROVED' },
        data: { status: 'POSTED', cashAccountId: wallet, paidOn, postedAt: new Date(), postedById: actor.id, totalGross: gross, totalDeductions: deductions, totalNet: net },
      });
      if (res.count === 1) await writeAudit(tx, actor, 'payroll', id, 'post_run', { status: 'APPROVED' }, { status: 'POSTED', period: run.period, totalGross: gross, totalNet: net, payMethod: run.payMethod });
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
      const phone = l.payee.user?.phone ?? l.payee.phone;
      if (!phone) { failed++; continue; }
      const amount = num(l.net).toLocaleString('en-US');
      const text = l.payee.user?.language === 'en'
        ? `${mamcos?.name ?? 'AMCOS'}: your pay for ${period} has been paid, TZS ${amount}.`
        : `${mamcos?.name ?? 'AMCOS'}: malipo yako ya ${period} yamelipwa, TZS ${amount}.`;
      try { (await this.sms.sendTransactional(phone, text, 'payroll')) ? sent++ : failed++; } catch { failed++; }
    }
    return { sent, failed };
  }

  async payslip(actor: RequestUser, runId: string, lineId: string, mamcosIdParam?: string) {
    const mamcosId = this.tenant(actor, mamcosIdParam);
    const run = await this.findRun(mamcosId, runId);
    const line = run.lines.find((l) => l.id === lineId);
    if (!line) throw new NotFoundException('Pay line not found');
    const [mamcos, payee] = await Promise.all([
      this.prisma.mamcos.findUnique({ where: { id: mamcosId }, select: { name: true } }),
      this.prisma.payrollPayee.findUnique({ where: { id: line.payeeId }, select: { workerCode: true } }),
    ]);
    return {
      amcos: mamcos?.name ?? '', period: run.period, status: run.status, paidOn: run.paidOn, payMethod: run.payMethod,
      workerCode: payee?.workerCode ?? null, name: line.name, title: line.title, basis: line.basis, costCenter: COST_CENTER_LABEL[line.costCenter],
      gross: num(line.gross), deductions: num(line.deductions), deductionNote: line.deductionNote, net: num(line.net),
    };
  }

  /** Whether the caller holds a grant, for screens that show or hide a button. */
  can(actor: RequestUser, resource: string, action: string) { return hasGrant(actor, resource, action); }
}
