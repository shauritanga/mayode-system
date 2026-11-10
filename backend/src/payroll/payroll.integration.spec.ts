/**
 * Integration tests for payroll against the throw-away `irrigation_test` schema (scripts/irrigation-test-schema.sh):
 * the personnel registry, wage types, attendance and output, compliance-linked stipends, budgets, and the three-person flow
 * (Accountant compiles, Manager approves against the money, someone else pays). Skipped unless IRRIGATION_TEST_DATABASE_URL is set.
 */
import 'reflect-metadata';
import { randomUUID } from 'crypto';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaClient, UserRole } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { OwnershipService, RequestUser } from '../common/ownership.service';
import { AccountingService } from '../accounting/accounting.service';
import { PERMISSION_KEY } from '../auth/decorators/require-permission.decorator';
import { PayrollController } from './payroll.controller';
import { PayrollService } from './payroll.service';
import { complianceResult, scheduledDays } from './payroll-compliance';

const BASE_URL = process.env.IRRIGATION_TEST_DATABASE_URL;
const SCHEMA = 'irrigation_test';
const describeDb = BASE_URL ? describe : describe.skip;
const ymd = (offsetDays: number) => new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10);
const thisMonth = () => new Date().toISOString().slice(0, 7);
const nextMonth = () => { const d = new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + 1); return d.toISOString().slice(0, 7); };
const prevMonth = () => { const d = new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - 1); return d.toISOString().slice(0, 7); };
const daysIn = (period: string) => { const [y, m] = period.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).getUTCDate(); };

describe('compliance', () => {
  it('lists the days a schedule runs inside its own dates', () => {
    const s = { weekdays: [1, 3], startsOn: new Date('2026-03-01T00:00:00Z'), endsOn: null };
    expect([...scheduledDays(s, '2026-03')]).toEqual(['2026-03-02', '2026-03-04', '2026-03-09', '2026-03-11', '2026-03-16', '2026-03-18', '2026-03-23', '2026-03-25', '2026-03-30']);
    expect(scheduledDays({ ...s, startsOn: new Date('2026-03-15T00:00:00Z'), endsOn: new Date('2026-03-20T00:00:00Z') }, '2026-03').size).toBe(2);
  });
  it('pays in full from 90% logged, in proportion below it, and in full when nothing is scheduled', () => {
    expect(complianceResult(20, 18).factor).toBe(1);
    expect(complianceResult(20, 20).factor).toBe(1);
    expect(complianceResult(20, 9)).toMatchObject({ factor: 0.5, pct: 0.45 });
    expect(complianceResult(20, 0).factor).toBe(0);
    expect(complianceResult(0, 0)).toMatchObject({ factor: 1, note: 'No water schedule to check against' });
    expect(complianceResult(24, 21).note).toBe('21 of 24 scheduled days logged (87.5%)');
  });
});

describeDb('Payroll (PostgreSQL)', () => {
  jest.setTimeout(120_000);
  let pool: Pool; let prisma: PrismaClient; let svc: PayrollService; let accounting: AccountingService;
  let mamcosA: string; let mamcosB: string;
  let accountant: RequestUser; let manager: RequestUser; let supervisor: RequestUser; let adminB: RequestUser; let cashierUser: string; let chairmanUser: string; let outsiderUser: string;
  const sms = { sendTransactional: jest.fn().mockResolvedValue(true) };
  const P: Record<string, any> = {};
  let phoneSeq = 0;
  const phone = () => `+2557${Date.now().toString().slice(-6)}${phoneSeq++}`.slice(0, 13);
  const period = prevMonth();
  let runId: string;

  const user = (first: string, mamcosId: string, role: UserRole = UserRole.CUSTOM) =>
    prisma.user.create({ data: { phone: phone(), passwordHash: 'x', firstName: first, lastName: 'Test', role, mamcosId } });
  const actor = (u: { id: string }, mamcosId: string): RequestUser => ({ id: u.id, role: UserRole.CUSTOM, mamcosId });
  const titleId = async (name: string) => ((await svc.titles(accountant)) as any).data.find((t: any) => t.name === name).id;
  const verifyAll = async () => { for (const p of ((await svc.payees(accountant)) as any).data.filter((x: any) => !x.verified)) await svc.verifyPayee(manager, p.id); };
  const markDays = async (payeeId: string, days: string[]) => { for (const d of days) await svc.markAttendance(supervisor, { payeeId, date: d }); };
  const dayStr = (n: number) => `${period}-${String(n).padStart(2, '0')}`;

  beforeAll(async () => {
    const url = `${BASE_URL!.split('?')[0]}?options=${encodeURIComponent(`-c search_path=${SCHEMA}`)}`;
    pool = new Pool({ connectionString: url, max: 6 });
    prisma = new PrismaClient({ adapter: new PrismaPg(pool, { schema: SCHEMA }) });
    const ownership = new OwnershipService(prisma as any);
    accounting = new AccountingService(prisma as any, ownership);
    svc = new PayrollService(prisma as any, ownership, accounting, sms as any);
    const tag = randomUUID().slice(0, 5);
    mamcosA = (await prisma.mamcos.create({ data: { name: `Payroll A ${tag}` } })).id;
    mamcosB = (await prisma.mamcos.create({ data: { name: `Payroll B ${tag}` } })).id;
    accountant = actor(await user('Accountant', mamcosA), mamcosA);
    manager = actor(await user('Manager', mamcosA), mamcosA);
    supervisor = actor(await user('Supervisor', mamcosA), mamcosA);
    adminB = actor(await user('AdminB', mamcosB), mamcosB);
    cashierUser = (await user('Cashier', mamcosA)).id;
    chairmanUser = (await user('Chairman', mamcosA)).id;
    outsiderUser = (await user('Outsider', mamcosB)).id;
  });
  afterAll(async () => { await prisma.$disconnect(); await pool.end(); });

  it('starts every AMCOS with standard job titles, once, and lets it add its own', async () => {
    const first: any = await svc.titles(accountant);
    expect(first.data.map((t: any) => t.name)).toEqual(expect.arrayContaining(['Manager', 'Water Gate Opener', 'Office Cleaner', 'Warehouse Loader', 'Seasonal Sorter']));
    expect(first.data.find((t: any) => t.name === 'Water Gate Opener')).toMatchObject({ tier: 'FIELD_LEADERSHIP', compliance: 'WATER_LOG', costCenter: 'IRRIGATION_OPS' });
    expect(((await svc.titles(accountant)) as any).data).toHaveLength(first.data.length);
    const mine: any = await svc.createTitle(accountant, { name: 'Pump Attendant', tier: 'SUPPORT', costCenter: 'IRRIGATION_OPS', wageType: 'DAILY' } as any);
    expect(mine).toMatchObject({ name: 'Pump Attendant', wageType: 'DAILY' });
    await expect(svc.createTitle(accountant, { name: 'Pump Attendant', tier: 'SUPPORT', costCenter: 'IRRIGATION_OPS', wageType: 'DAILY' } as any)).rejects.toBeInstanceOf(ConflictException);
    expect(((await svc.titles(adminB)) as any).data.find((t: any) => t.name === 'Pump Attendant')).toBeUndefined(); // each AMCOS has its own
  });

  it('offers only this AMCOS’s staff and leaders, never farmers or other cooperatives', async () => {
    await user('Farmer', mamcosA, UserRole.FARMER);
    const names = (await svc.candidates(accountant)).map((c) => c.name);
    expect(names).toEqual(expect.arrayContaining(['Cashier Test', 'Chairman Test']));
    expect(names).not.toContain('Farmer Test');
    expect(names).not.toContain('Outsider Test');
  });

  it('adds staff with a login and support workers without one, each with a worker ID, phone and payout details', async () => {
    P.cashier = await svc.addPayee(accountant, { userId: cashierUser, titleId: await titleId('Cashier'), monthlySalary: 600_000, startDate: ymd(-120) } as any);
    P.chairman = await svc.addPayee(accountant, { userId: chairmanUser, titleId: await titleId('Block Chairman'), monthlySalary: 150_000, startDate: ymd(-120) } as any);
    expect(P.cashier).toMatchObject({ workerCode: 'WK-0001', hasLogin: true, tier: 'CORE_ADMIN', costCenter: 'ADMIN_OVERHEAD', wageType: 'MONTHLY', verified: false, payoutMethod: 'MOBILE_MONEY' });
    expect(P.chairman).toMatchObject({ workerCode: 'WK-0002', tier: 'FIELD_LEADERSHIP', compliance: 'CHAIRMAN_LOG' });

    P.cleaner = await svc.addPayee(accountant, { fullName: 'Rehema Cleaner', phone: '+255755111001', idType: 'VOTER_ID', idNumber: 'V-100200', titleId: await titleId('Office Cleaner'), monthlySalary: 180_000, startDate: ymd(-120), contractEnd: ymd(200), payoutMethod: 'MOBILE_MONEY' } as any);
    P.loader = await svc.addPayee(accountant, { fullName: 'Juma Loader', phone: '+255755111002', idNumber: 'N-200300', titleId: await titleId('Warehouse Loader'), rate: 15_000, startDate: ymd(-120) } as any);
    P.sorter = await svc.addPayee(accountant, { fullName: 'Neema Sorter', phone: '+255755111003', idNumber: 'N-300400', titleId: await titleId('Seasonal Sorter'), rate: 500, pieceUnit: 'bag', startDate: ymd(-120) } as any);
    P.opener = await svc.addPayee(accountant, { fullName: 'Hassani Gate', phone: '+255755111004', idNumber: 'N-400500', titleId: await titleId('Water Gate Opener'), monthlySalary: 200_000, startDate: ymd(-120) } as any);
    expect(P.cleaner).toMatchObject({ workerCode: 'WK-0003', hasLogin: false, name: 'Rehema Cleaner', payoutAccount: '+255755111001', tier: 'SUPPORT', costCenter: 'FACILITY_MAINTENANCE' });
    expect(P.loader).toMatchObject({ wageType: 'DAILY', rate: 15_000, monthlySalary: 0 });
    expect(P.sorter).toMatchObject({ wageType: 'PIECE', pieceUnit: 'bag' });
    expect(P.opener.compliance).toBe('WATER_LOG');
    expect(((await svc.payees(accountant)) as any).summary).toMatchObject({ people: 6, unverified: 6, tiers: { CORE_ADMIN: 1, FIELD_LEADERSHIP: 2, SUPPORT: 3 } });
  });

  it('refuses a worker without the details that make them real, a duplicate phone, or pay terms that do not fit', async () => {
    const base = { titleId: await titleId('Office Cleaner'), monthlySalary: 100_000 };
    await expect(svc.addPayee(accountant, { ...base, fullName: 'No Phone' } as any)).rejects.toThrow(/full name and phone/);
    await expect(svc.addPayee(accountant, { ...base, fullName: 'No ID', phone: '+255755111009' } as any)).rejects.toThrow(/ID number/);
    await expect(svc.addPayee(accountant, { ...base, fullName: 'Twin', phone: '+255755111001', idNumber: 'N-999' } as any)).rejects.toThrow(/phone number is already on the payroll/);
    await expect(svc.addPayee(accountant, { fullName: 'Daily Man', phone: '+255755111010', idNumber: 'N-1000', titleId: await titleId('Warehouse Loader') } as any)).rejects.toThrow(/daily rate/);
    await expect(svc.addPayee(accountant, { fullName: 'Piece Man', phone: '+255755111011', idNumber: 'N-1001', titleId: await titleId('Seasonal Sorter'), rate: 500 } as any)).rejects.toThrow(/what one unit is/);
    await expect(svc.addPayee(accountant, { ...base, fullName: 'Ended', phone: '+255755111012', idNumber: 'N-1002', startDate: ymd(0), contractEnd: ymd(-5) } as any)).rejects.toThrow(/cannot end before/);
    await expect(svc.addPayee(accountant, { userId: cashierUser, titleId: await titleId('Cashier'), monthlySalary: 1 } as any)).rejects.toBeInstanceOf(ConflictException);
    await expect(svc.addPayee(accountant, { userId: outsiderUser, titleId: await titleId('Cashier'), monthlySalary: 1 } as any)).rejects.toBeInstanceOf(NotFoundException);
    expect(((await svc.payees(adminB)) as any).data).toHaveLength(0);
    await expect(svc.payees(accountant, mamcosB)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('nobody is paid until a different person, a Manager, verifies them; changing pay or payout clears it again', async () => {
    await expect(svc.verifyPayee(accountant, P.cashier.id)).rejects.toThrow(/Someone other than the person who added/);
    expect((await svc.verifyPayee(manager, P.cashier.id)).verified).toBe(true);
    await expect(svc.verifyPayee(manager, P.cashier.id)).rejects.toBeInstanceOf(ConflictException);
    const raised = await svc.updatePayee(accountant, P.cashier.id, { monthlySalary: 900_000 });
    expect(raised).toMatchObject({ monthlySalary: 900_000, verified: false });
    await svc.verifyPayee(manager, P.cashier.id);
    const moved = await svc.updatePayee(accountant, P.cashier.id, { payoutAccount: '255700000001' });
    expect(moved.verified).toBe(false); // a new account number needs a fresh look
    await svc.updatePayee(accountant, P.cashier.id, { monthlySalary: 600_000, payoutAccount: P.cashier.payoutAccount });
    await verifyAll();
    expect(((await svc.payees(accountant)) as any).summary.unverified).toBe(0);
    const note = await svc.updatePayee(accountant, P.loader.id, { title: 'Senior Loader' }); // a title change is not a pay change
    expect(note.verified).toBe(true);
  });

  it('records attendance and output only for the right kind of worker, by someone else, on real days', async () => {
    const d = dayStr(3);
    await expect(svc.markAttendance(supervisor, { payeeId: P.cleaner.id, date: d } as any)).rejects.toThrow(/paid by the day/);
    await expect(svc.addOutput(supervisor, { payeeId: P.loader.id, date: d, quantity: 5 } as any)).rejects.toThrow(/per piece/);
    await expect(svc.markAttendance(supervisor, { payeeId: P.loader.id, date: ymd(2) } as any)).rejects.toThrow(/has not happened/);
    await expect(svc.markAttendance(supervisor, { payeeId: P.loader.id, date: ymd(-200) } as any)).rejects.toThrow(/too long ago/);
    await expect(svc.markAttendance(supervisor, { payeeId: P.loader.id, date: ymd(-130) } as any)).rejects.toBeInstanceOf(BadRequestException); // before the contract started
    await markDays(P.loader.id, [dayStr(3), dayStr(4), dayStr(5)]);
    await svc.markAttendance(supervisor, { payeeId: P.loader.id, date: dayStr(6), fraction: 0.5 } as any);
    expect(await svc.markDay(supervisor, { date: dayStr(7), payeeIds: [P.loader.id] })).toEqual({ marked: 1 });
    await svc.markAttendance(supervisor, { payeeId: P.loader.id, date: dayStr(3), fraction: 0.5 } as any); // correcting a day replaces it
    const att: any = await svc.attendance(supervisor, { period, payeeId: P.loader.id });
    expect(att.data.reduce((n: number, a: any) => n + a.fraction, 0)).toBe(4); // day 3 (half, corrected), 4, 5, day 6 (half), 7
    for (const [dd, q] of [[dayStr(8), 40], [dayStr(9), 60]] as const) await svc.addOutput(supervisor, { payeeId: P.sorter.id, date: dd, quantity: q, note: 'bags' } as any);
    expect(((await svc.outputs(supervisor, { period })) as any).data).toHaveLength(2);
    // a worker with a login cannot record their own days
    const handy = await user('Handy', mamcosA);
    const handyPayee: any = await svc.addPayee(accountant, { userId: handy.id, titleId: await titleId('Irrigation Maintenance Hand'), rate: 10_000, startDate: ymd(-120) } as any);
    await expect(svc.markAttendance(actor(handy, mamcosA), { payeeId: handyPayee.id, date: dayStr(3) } as any)).rejects.toBeInstanceOf(ForbiddenException);
    await svc.updatePayee(accountant, handyPayee.id, { isActive: false }); // not part of the rest of this run
  });

  it('compiles a month from salary, days worked, output and compliance; leaves out people who are not ready', async () => {
    await expect(svc.createRun(adminB, { period })).rejects.toBeInstanceOf(BadRequestException);
    await expect(svc.createRun(accountant, { period: nextMonth() })).rejects.toBeInstanceOf(BadRequestException);
    const extra: any = await svc.addPayee(accountant, { fullName: 'Not Yet Verified', phone: '+255755111020', idNumber: 'N-2020', titleId: await titleId('Night Security Guard'), monthlySalary: 220_000, startDate: ymd(-120) } as any);
    const run: any = await svc.createRun(accountant, { period });
    runId = run.id;
    const by = (title: string) => run.lines.find((l: any) => l.title === title);
    expect(by('Cashier')).toMatchObject({ gross: 600_000, wageType: 'MONTHLY', tier: 'CORE_ADMIN', basis: 'Fixed monthly salary TZS 600,000' });
    expect(by('Senior Loader')).toMatchObject({ gross: 60_000, units: 4, wageType: 'DAILY', basis: '4 day(s) × TZS 15,000' });
    expect(by('Seasonal Sorter')).toMatchObject({ gross: 50_000, units: 100, basis: '100 bag(s) × TZS 500' });
    expect(by('Office Cleaner')).toMatchObject({ gross: 180_000, costCenter: 'FACILITY_MAINTENANCE' });
    expect(run.skipped).toEqual([{ name: 'Not Yet Verified', reason: 'Not verified by a Manager yet' }]);
    expect(run.lines.map((l: any) => l.name).sort()).toEqual(['Chairman Test', 'Cashier Test', 'Hassani Gate', 'Juma Loader', 'Neema Sorter', 'Rehema Cleaner'].sort());
    expect(run.lines.find((l: any) => l.name === 'Not Yet Verified')).toBeUndefined();
    expect(run.tiers.find((t: any) => t.tier === 'SUPPORT')).toMatchObject({ people: 3, gross: 290_000 }); // cleaner 180,000 + loader 60,000 + sorter 50,000
    expect(run.costCenters.find((c: any) => c.costCenter === 'ADMIN_OVERHEAD').gross).toBe(600_000);
    await expect(svc.createRun(accountant, { period })).rejects.toBeInstanceOf(ConflictException);
    // the late-added guard is verified, then the draft is rebuilt with them in
    await svc.verifyPayee(manager, extra.id);
    const rebuilt: any = await svc.recompile(accountant, runId);
    expect(rebuilt.lines.find((l: any) => l.name === 'Not Yet Verified')).toMatchObject({ gross: 220_000, costCenter: 'SECURITY' });
    expect(rebuilt.skipped).toEqual([]);
  });

  it('pays a gate opener and a chairman in proportion to the water they logged', async () => {
    const [y, m] = period.split('-').map(Number);
    const total = daysIn(period);
    const farmer = await prisma.farmer.create({ data: { userId: chairmanUser, controlNumber: `PR-${randomUUID().slice(0, 6)}`, firstName: 'Chairman', lastName: 'Test', mamcosId: mamcosA } });
    const scheme = await prisma.irrigationScheme.create({ data: { mamcosId: mamcosA, name: `S ${randomUUID().slice(0, 4)}` } });
    const canal = await prisma.irrigationCanal.create({ data: { schemeId: scheme.id, canalNumber: 1, code: `PC-${randomUUID().slice(0, 4)}`, name: 'Canal 1' } });
    const block = await prisma.irrigationBlock.create({ data: { canalId: canal.id, blockNumber: 1, code: '1.1R', side: 'RIGHT', areaHectares: 30, hectareCount: 30 } });
    await prisma.irrigationLeadership.create({ data: { position: 'BLOCK_LEADER', canalId: canal.id, blockId: block.id, farmerId: farmer.id, appointedOn: new Date('2026-01-01'), termStart: new Date('2026-01-01') } });
    // water runs every day of the month: the gate opener logged half of them, the chairman all of them
    await prisma.waterSchedule.create({ data: { mamcosId: mamcosA, canalId: canal.id, blockId: block.id, weekdays: [0, 1, 2, 3, 4, 5, 6], startsOn: new Date(Date.UTC(y, m - 1, 1)), gateOpenerPayeeId: P.opener.id } });
    const half = Math.floor(total / 2);
    for (let d = 1; d <= total; d++) {
      const date = new Date(Date.UTC(y, m - 1, d));
      await prisma.waterLog.create({ data: { mamcosId: mamcosA, canalId: canal.id, blockId: block.id, date, loggedById: chairmanUser, ...(d <= half ? { gateOpenerPayeeId: P.opener.id } : {}) } });
    }
    const opener = await svc.complianceOf(mamcosA, { id: P.opener.id, userId: null, compliance: 'WATER_LOG' }, period);
    expect(opener).toMatchObject({ scheduled: total, logged: half });
    expect(opener!.factor).toBeCloseTo((half / total) / 0.9, 3);
    expect(await svc.complianceOf(mamcosA, { id: P.chairman.id, userId: chairmanUser, compliance: 'CHAIRMAN_LOG' }, period)).toMatchObject({ factor: 1, scheduled: total, logged: total });
    expect(await svc.complianceOf(mamcosA, { id: P.cashier.id, userId: cashierUser, compliance: 'NONE' }, period)).toBeNull();

    const run: any = await svc.recompile(accountant, runId);
    const gate = run.lines.find((l: any) => l.title === 'Water Gate Opener');
    expect(gate.complianceFactor).toBeCloseTo((half / total) / 0.9, 3);
    expect(gate.gross).toBeCloseTo(200_000 * gate.complianceFactor, 0);
    expect(gate.basis).toMatch(new RegExp(`Stipend TZS 200,000: ${half} of ${total} scheduled days logged`));
    expect(run.lines.find((l: any) => l.title === 'Block Chairman')).toMatchObject({ gross: 150_000, complianceFactor: 1 });
  });

  it('keeps each budget line within its limit, and a hand-changed pay needs a reason', async () => {
    expect(((await svc.budgets(accountant)) as any).data.every((b: any) => b.monthlyLimit === null)).toBe(true);
    await svc.setBudget(manager, 'FACILITY_MAINTENANCE', 100_000);
    const run: any = await svc.run(accountant, runId);
    expect(run.overBudget).toBe(true);
    await expect(svc.submit(accountant, runId, {})).rejects.toThrow(/Over budget: Facility maintenance TZS 180,000 against a limit of TZS 100,000/);
    await svc.setBudget(manager, 'FACILITY_MAINTENANCE', 200_000);
    const line = run.lines.find((l: any) => l.title === 'Office Cleaner');
    await expect(svc.updateLine(accountant, runId, line.id, { deductions: 700_000 })).rejects.toBeInstanceOf(BadRequestException);
    await expect(svc.updateLine(accountant, runId, line.id, { gross: 150_000 })).rejects.toThrow(/Say why/);
    const after: any = await svc.updateLine(accountant, runId, line.id, { gross: 190_000, deductions: 10_000, deductionNote: 'Overtime, less pension' });
    expect(after.lines.find((l: any) => l.id === line.id)).toMatchObject({ gross: 190_000, net: 180_000 });
    await expect(svc.updateLine(adminB, runId, line.id, { deductions: 1 })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('three people, in order: the Accountant submits, a different Manager approves against the money, a third pays', async () => {
    await expect(svc.approve(manager, runId, { payMethod: 'MOBILE_MONEY' })).rejects.toThrow(/must submit/);
    await expect(svc.post(accountant, runId, {})).rejects.toThrow(/Manager must approve/);
    const submitted: any = await svc.submit(accountant, runId, { note: 'Reconciled with attendance sheets' });
    expect(submitted).toMatchObject({ status: 'SUBMITTED', submittedById: accountant.id });
    await expect(svc.updateLine(accountant, runId, submitted.lines[0].id, { gross: 1 })).rejects.toThrow(/Only a draft/);
    await expect(svc.deleteRun(accountant, runId)).rejects.toThrow(/Only a draft/);
    await expect(svc.approve(accountant, runId, { payMethod: 'MOBILE_MONEY' })).rejects.toThrow(/someone other than the person who submitted/);
    // no money in the account yet
    await expect(svc.approve(manager, runId, { payMethod: 'MOBILE_MONEY' })).rejects.toThrow(/Not enough money in this account: TZS 0 available/);
    // the Manager sends it back; the Accountant fixes and submits again
    await svc.returnRun(manager, runId, 'Please recheck the loader days');
    expect((await svc.run(manager, runId) as any)).toMatchObject({ status: 'DRAFT', approveNote: 'Sent back: Please recheck the loader days' });
    await svc.submit(accountant, runId, {});
    await accounting.postToLedger('Seed', randomUUID(), new Date(), 'Opening cash', [{ code: '1000', debit: 5_000_000 }, { code: '3000', credit: 5_000_000 }], mamcosA);
    const run0: any = await svc.run(manager, runId);
    const approved: any = await svc.approve(manager, runId, { payMethod: 'MOBILE_MONEY', note: 'Cash checked' });
    expect(approved).toMatchObject({ status: 'APPROVED', approvedById: manager.id, payMethod: 'MOBILE_MONEY', available: 5_000_000 });
    expect(approved.totalNet).toBe(run0.totalNet);
    await expect(svc.post(manager, runId, {})).rejects.toThrow(/someone other than the Manager who approved/);
    sms.sendTransactional.mockClear();
    const posted: any = await svc.post(accountant, runId, { notify: true });
    expect(posted).toMatchObject({ status: 'POSTED', postedById: accountant.id, notified: { sent: 7, failed: 0 } });
    expect(sms.sendTransactional.mock.calls.some((c) => /malipo yako ya .* yamelipwa/.test(c[1]))).toBe(true);
    await expect(svc.post(accountant, runId, {})).rejects.toThrow(/already posted/);
    await expect(svc.deleteRun(accountant, runId)).rejects.toThrow(/Only a draft/);
    await expect(svc.removeAttendance(supervisor, ((await svc.attendance(supervisor, { period })) as any).data[0].id)).rejects.toThrow(/already with the Manager or paid/);
  });

  it('books each cost center’s wages to its own account, balanced, to this AMCOS’s ledger only', async () => {
    const lines = await prisma.ledgerEntry.findMany({ where: { sourceType: 'Payroll', sourceId: runId }, include: { account: true } });
    expect(lines.every((l) => l.mamcosId === mamcosA)).toBe(true);
    const debit = (code: string) => lines.filter((l) => l.account.code === code).reduce((n, l) => n + l.debit, 0);
    expect(debit('5500')).toBeGreaterThan(0); // administrative overhead (the Cashier)
    expect(debit('5510')).toBe(190_000);      // facility maintenance (the Cleaner, as adjusted)
    expect(debit('5520')).toBe(220_000);      // security
    expect(debit('5530')).toBeGreaterThan(0); // irrigation operations (chairman and gate opener)
    expect(debit('5540')).toBeGreaterThan(0); // warehouse (loader and sorter)
    const net = lines.filter((l) => l.account.code === '1000').reduce((n, l) => n + l.credit, 0);
    const payable = lines.filter((l) => l.account.code === '2300').reduce((n, l) => n + l.credit, 0);
    const total = lines.reduce((n, l) => n + l.debit, 0);
    expect(Math.round((net + payable) * 100)).toBe(Math.round(total * 100));
    expect(payable).toBe(10_000);
    const mine = await prisma.ledgerEntry.count({ where: { sourceType: 'Payroll', sourceId: runId, mamcosId: { not: mamcosA } } });
    expect(mine).toBe(0);
  });

  it('shows each person’s payment history and a payslip that says how the pay was worked out', async () => {
    const h: any = await svc.history(accountant, P.loader.id);
    expect(h.payments).toHaveLength(1);
    expect(h.payments[0]).toMatchObject({ period, gross: 60_000, net: 60_000, basis: '4 day(s) × TZS 15,000' });
    expect(h.totalPaid).toBe(60_000);
    const run: any = await svc.run(accountant, runId);
    const line = run.lines.find((l: any) => l.title === 'Office Cleaner');
    expect(await svc.payslip(accountant, runId, line.id)).toMatchObject({ workerCode: 'WK-0003', name: 'Rehema Cleaner', costCenter: 'Facility maintenance', gross: 190_000, deductions: 10_000, net: 180_000, status: 'POSTED' });
    await expect(svc.history(adminB, P.loader.id)).rejects.toBeInstanceOf(NotFoundException);
    // a draft can still be deleted, and nothing in this AMCOS touches another's run
    const draft: any = await svc.createRun(accountant, { period: thisMonth() }).catch(() => null);
    if (draft) { expect(await svc.deleteRun(accountant, draft.id)).toEqual({ deleted: true }); }
    await expect(svc.run(adminB, runId)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('every payroll route declares who may use it: reading, changing, approving and paying are different rights', () => {
    const proto = PayrollController.prototype as any;
    const handlers = Object.getOwnPropertyNames(proto).filter((n) => n !== 'constructor' && typeof proto[n] === 'function');
    for (const h of handlers) expect(Reflect.getMetadata(PERMISSION_KEY, proto[h])).toBeTruthy();
    const need = (h: string) => Reflect.getMetadata(PERMISSION_KEY, proto[h]);
    expect(need('approve')).toEqual({ resource: 'payroll_approval', action: 'EDIT' });
    expect(need('returnRun')).toEqual({ resource: 'payroll_approval', action: 'EDIT' });
    expect(need('verifyPayee')).toEqual({ resource: 'payroll_approval', action: 'EDIT' });
    expect(need('setBudget')).toEqual({ resource: 'payroll_approval', action: 'EDIT' });
    expect(need('submit')).toEqual({ resource: 'payroll', action: 'EDIT' });
    expect(need('post')).toEqual({ resource: 'payroll', action: 'EDIT' });
    expect(need('markAttendance')).toEqual({ resource: 'payroll_attendance', action: 'CREATE' });
    expect(need('payees')).toEqual({ resource: 'payroll', action: 'VIEW' });
  });
});
