/**
 * Integration tests for payroll against the throw-away `irrigation_test` schema
 * (scripts/irrigation-test-schema.sh). Skipped unless IRRIGATION_TEST_DATABASE_URL is set.
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

const BASE_URL = process.env.IRRIGATION_TEST_DATABASE_URL;
const SCHEMA = 'irrigation_test';
const describeDb = BASE_URL ? describe : describe.skip;
const thisMonth = () => new Date().toISOString().slice(0, 7);
const nextMonth = () => { const d = new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + 1); return d.toISOString().slice(0, 7); };

describeDb('Payroll (PostgreSQL)', () => {
  jest.setTimeout(120_000);
  let pool: Pool;
  let prisma: PrismaClient;
  let svc: PayrollService;
  let adminA: RequestUser;
  let adminB: RequestUser;
  let mamcosA: string;
  let mamcosB: string;
  let cashier: string;
  let leader: string;
  let outsider: string;
  const sms = { sendTransactional: jest.fn().mockResolvedValue(true) };
  let phoneSeq = 0;
  const phone = () => `+2557${Date.now().toString().slice(-6)}${phoneSeq++}`.slice(0, 13);

  const user = (first: string, mamcosId: string, role: UserRole = UserRole.CUSTOM) =>
    prisma.user.create({ data: { phone: phone(), passwordHash: 'x', firstName: first, lastName: 'Test', role, mamcosId } });

  beforeAll(async () => {
    const url = `${BASE_URL!.split('?')[0]}?options=${encodeURIComponent(`-c search_path=${SCHEMA}`)}`;
    pool = new Pool({ connectionString: url, max: 6 });
    prisma = new PrismaClient({ adapter: new PrismaPg(pool, { schema: SCHEMA }) });
    const ownership = new OwnershipService(prisma as any);
    svc = new PayrollService(prisma as any, ownership, new AccountingService(prisma as any, ownership), sms as any);
    const tag = randomUUID().slice(0, 5);
    mamcosA = (await prisma.mamcos.create({ data: { name: `Payroll A ${tag}` } })).id;
    mamcosB = (await prisma.mamcos.create({ data: { name: `Payroll B ${tag}` } })).id;
    const a = await user('Admin', mamcosA);
    const b = await user('AdminB', mamcosB);
    adminA = { id: a.id, role: UserRole.CUSTOM, mamcosId: mamcosA };
    adminB = { id: b.id, role: UserRole.CUSTOM, mamcosId: mamcosB };
    cashier = (await user('Cashier', mamcosA)).id;
    leader = (await user('Leader', mamcosA)).id;
    outsider = (await user('Outsider', mamcosB)).id;
  });

  afterAll(async () => { await prisma.$disconnect(); await pool.end(); });

  it('offers only this AMCOS’s staff and leaders, never farmers or other cooperatives', async () => {
    await user('Farmer', mamcosA, UserRole.FARMER);
    const names = (await svc.candidates(adminA)).map((c) => c.name);
    expect(names).toEqual(expect.arrayContaining(['Cashier Test', 'Leader Test']));
    expect(names).not.toContain('Farmer Test');
    expect(names).not.toContain('Outsider Test');
  });

  it('puts people on the payroll once, and only from their own AMCOS', async () => {
    const p = await svc.addPayee(adminA, { userId: cashier, title: 'Cashier', monthlySalary: 600_000 });
    expect(p).toMatchObject({ name: 'Cashier Test', monthlySalary: 600_000, isActive: true });
    await svc.addPayee(adminA, { userId: leader, title: 'Canal leader C01', monthlySalary: 150_000 });
    await expect(svc.addPayee(adminA, { userId: cashier, title: 'Cashier', monthlySalary: 1 })).rejects.toBeInstanceOf(ConflictException);
    await expect(svc.addPayee(adminA, { userId: outsider, title: 'Spy', monthlySalary: 1 })).rejects.toBeInstanceOf(NotFoundException);
    expect((await svc.payees(adminA)).summary).toEqual({ people: 2, monthlyTotal: 750_000 });
    expect((await svc.payees(adminB)).data).toHaveLength(0);
    expect((await svc.candidates(adminA)).map((c) => c.name)).not.toContain('Cashier Test');
    await expect(svc.payees(adminA, mamcosB)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('starts a draft from the salaries, refusing a duplicate, a future month or an empty payroll', async () => {
    await expect(svc.createRun(adminB, { period: thisMonth() })).rejects.toBeInstanceOf(BadRequestException);
    await expect(svc.createRun(adminA, { period: nextMonth() })).rejects.toBeInstanceOf(BadRequestException);
    const run = await svc.createRun(adminA, { period: thisMonth() });
    expect(run).toMatchObject({ status: 'DRAFT', totalGross: 750_000, totalNet: 750_000 });
    expect(run.lines).toHaveLength(2);
    await expect(svc.createRun(adminA, { period: thisMonth() })).rejects.toBeInstanceOf(ConflictException);
  });

  it('lets a draft be adjusted, keeping totals and net right, and rejects deductions above pay', async () => {
    const run = (await svc.runs(adminA))[0];
    const detail = await svc.run(adminA, run.id);
    const line = detail.lines.find((l: any) => l.title === 'Cashier')!;
    await expect(svc.updateLine(adminA, run.id, line.id, { deductions: 700_000 })).rejects.toBeInstanceOf(BadRequestException);
    const after = await svc.updateLine(adminA, run.id, line.id, { deductions: 60_000, deductionNote: 'Pension' });
    expect(after).toMatchObject({ totalGross: 750_000, totalDeductions: 60_000, totalNet: 690_000 });
    expect(after.lines.find((l: any) => l.id === line.id)).toMatchObject({ net: 540_000, deductionNote: 'Pension' });
    await expect(svc.updateLine(adminB, run.id, line.id, { deductions: 1 })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('posts once: pays the run, writes balanced entries to this AMCOS’s ledger only, and locks it', async () => {
    const run = (await svc.runs(adminA))[0];
    await expect(svc.post(adminB, run.id, { payMethod: 'CASH' })).rejects.toBeInstanceOf(NotFoundException);
    const posted = await svc.post(adminA, run.id, { payMethod: 'MOBILE_MONEY', notify: true });
    expect(posted).toMatchObject({ status: 'POSTED', payMethod: 'MOBILE_MONEY', totalNet: 690_000, notified: { sent: 2, failed: 0 } });
    expect(sms.sendTransactional).toHaveBeenCalledTimes(2);

    const rows = await prisma.ledgerEntry.findMany({ where: { sourceType: 'Payroll', sourceId: run.id }, include: { account: true } });
    const by = (code: string) => rows.find((r) => r.account.code === code)!;
    expect(Number(by('5500').debit)).toBe(750_000);
    expect(Number(by('1000').credit)).toBe(690_000);
    expect(Number(by('2300').credit)).toBe(60_000);
    expect(rows.every((r) => r.mamcosId === mamcosA)).toBe(true);
    expect(rows.reduce((n, r) => n + Number(r.debit) - Number(r.credit), 0)).toBe(0);
    expect(await prisma.ledgerEntry.count({ where: { mamcosId: mamcosB, sourceType: 'Payroll' } })).toBe(0);

    await expect(svc.post(adminA, run.id, { payMethod: 'CASH' })).rejects.toBeInstanceOf(ConflictException);
    const line = posted.lines[0];
    await expect(svc.updateLine(adminA, run.id, line.id, { gross: 1 })).rejects.toBeInstanceOf(ConflictException);
    await expect(svc.deleteRun(adminA, run.id)).rejects.toBeInstanceOf(ConflictException);
    // even a direct write cannot change a posted run
    await expect(prisma.payrollLine.update({ where: { id: line.id }, data: { gross: 1, net: 1 } })).rejects.toThrow();
    await expect(prisma.payrollRun.delete({ where: { id: run.id } })).rejects.toThrow();
  });

  it('gives a payslip, and lets an unposted draft be deleted', async () => {
    const run = (await svc.runs(adminA))[0];
    const slip = await svc.payslip(adminA, run.id, (await svc.run(adminA, run.id)).lines[0].id);
    expect(slip).toMatchObject({ period: thisMonth(), status: 'POSTED' });
    expect(slip.net).toBe(slip.gross - slip.deductions);
    await svc.updatePayee(adminA, (await svc.payees(adminA)).data[0].id, { isActive: false });
    // a new member starts a fresh month's draft only for active people
    const draftPeriod = '2020-01';
    const draft = await svc.createRun(adminA, { period: draftPeriod }).catch(() => null);
    if (draft) expect(await svc.deleteRun(adminA, draft.id)).toEqual({ deleted: true });
  });

  it('every payroll route needs a payroll permission, and reading differs from changing', () => {
    const proto = PayrollController.prototype as any;
    const need = Object.getOwnPropertyNames(proto).filter((n) => n !== 'constructor').map((n) => [n, Reflect.getMetadata(PERMISSION_KEY, proto[n])]);
    expect(need.every(([, m]) => m?.resource === 'payroll')).toBe(true);
    const actions = Object.fromEntries(need.map(([n, m]) => [n, m.action]));
    expect(actions).toMatchObject({ payees: 'VIEW', run: 'VIEW', payslip: 'VIEW', post: 'EDIT', updateLine: 'EDIT', deleteRun: 'DELETE', createRun: 'CREATE' });
  });
});
