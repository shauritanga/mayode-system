/** Interest on input credit against the throw-away `irrigation_test` schema. Needs IRRIGATION_TEST_DATABASE_URL. */
import 'reflect-metadata';
import { randomUUID } from 'crypto';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaClient, UserRole } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { OwnershipService, RequestUser } from '../common/ownership.service';
import { AccountingService } from '../accounting/accounting.service';
import { DuesService } from '../dues/dues.service';
import { CreditInterestService } from './credit-interest.service';

const BASE_URL = process.env.IRRIGATION_TEST_DATABASE_URL;
const SCHEMA = 'irrigation_test';
const describeDb = BASE_URL ? describe : describe.skip;
const ymd = (off: number) => new Date(Date.now() + 3 * 3_600_000 + off * 86_400_000).toISOString().slice(0, 10);

describeDb('Interest on input credit (PostgreSQL)', () => {
  jest.setTimeout(120_000);
  let pool: Pool; let prisma: PrismaClient; let svc: CreditInterestService;
  let mamcos: string; let farmerId: string; let admin: RequestUser; let cashier: RequestUser; const texts: string[] = [];
  const grants = (list: [string, string][]) => ({ isActive: true, isSystem: false, permissions: list.map(([resource, action]) => ({ action, resource: { key: resource } })) });
  const phone = () => `+2557${Math.floor(Math.random() * 1e8).toString().padStart(8, '0')}`;
  const credit = async (amount: number, issuedDaysAgo: number) => prisma.farmerDue.create({ data: { mamcosId: mamcos, farmerId, category: 'FERTILISER', description: 'Urea · 50 kg', itemName: 'Urea', amount, issuedOn: new Date(ymd(-issuedDaysAgo)) } });
  const owed = async (dueId: string) => (await svc.account(admin, dueId)) as any;

  beforeAll(async () => {
    const url = `${BASE_URL!.split('?')[0]}?options=${encodeURIComponent(`-c search_path=${SCHEMA}`)}`;
    pool = new Pool({ connectionString: url, max: 6 });
    prisma = new PrismaClient({ adapter: new PrismaPg(pool, { schema: SCHEMA }) });
    const ownership = new OwnershipService(prisma as any);
    const sms: any = { send: async (_to: string, text: string) => { texts.push(text); } };
    const dues = new DuesService(prisma as any, ownership, new AccountingService(prisma as any, ownership), { get: () => sms } as any);
    svc = new CreditInterestService(prisma as any, ownership, dues, sms);
    mamcos = (await prisma.mamcos.create({ data: { name: `Riba ${randomUUID().slice(0, 5)}` } })).id;
    const fu = (await prisma.user.create({ data: { phone: phone(), passwordHash: 'x', role: UserRole.FARMER, mamcosId: mamcos, firstName: 'F', lastName: 'T', language: 'en' } as any })).id;
    farmerId = (await prisma.farmer.create({ data: { userId: fu, controlNumber: `RB-${randomUUID().slice(0, 5)}`, firstName: 'Riba', lastName: 'Farmer', mamcosId: mamcos } })).id;
    const au = (await prisma.user.create({ data: { phone: phone(), passwordHash: 'x', role: UserRole.CUSTOM, mamcosId: mamcos, firstName: 'A', lastName: 'T' } as any })).id;
    admin = { id: au, role: UserRole.CUSTOM, mamcosId: mamcos, customRole: grants([['amcos_settings', 'EDIT'], ['dues', 'VIEW'], ['dues', 'CREATE'], ['input_distribution', 'VIEW']]) } as RequestUser;
    cashier = admin;
  });
  afterAll(async () => { await prisma.$disconnect(); await pool.end(); });

  it('charges nothing until the AMCOS turns interest on and sets a rate', async () => {
    const due = await credit(100_000, 70);
    expect(await svc.accrue(mamcos)).toEqual({ added: 0, amount: 0 });
    await svc.saveTerms(admin, { enabled: true, period: 'MONTHLY', graceDays: 0, paymentOrder: 'INTEREST_FIRST' });
    expect(await svc.accrue(mamcos)).toEqual({ added: 0, amount: 0 }); // on, but no rate set
    expect((await owed(due.id)).totalOwed).toBe(100_000);
  });

  it('keeps rates from overlapping, and a season needs an end date', async () => {
    await svc.addRate(admin, { label: 'Masika', ratePercent: 5, validFrom: ymd(-400), validTo: undefined } as any);
    await expect(svc.addRate(admin, { label: 'Clash', ratePercent: 6, validFrom: ymd(-10) } as any)).rejects.toBeInstanceOf(ConflictException);
    await svc.saveTerms(admin, { enabled: true, period: 'SEASON', graceDays: 0, paymentOrder: 'INTEREST_FIRST' });
    await expect(svc.addRate(admin, { label: 'No end', ratePercent: 6, validFrom: ymd(5000) } as any)).rejects.toBeInstanceOf(BadRequestException);
    await svc.saveTerms(admin, { enabled: true, period: 'MONTHLY', graceDays: 0, paymentOrder: 'INTEREST_FIRST' });
  });

  it('adds each month once, at the rate for that month, on what was still owed that day', async () => {
    const due = await credit(100_000, 70);
    const before = await prisma.farmerDue.count({ where: { mamcosId: mamcos, category: 'INTEREST' } });
    const r = await svc.accrue(mamcos);
    expect(r.added).toBeGreaterThanOrEqual(2);
    const a = await owed(due.id);
    expect(a.interest.items).toHaveLength(2);
    expect(a.interest.items.map((i: any) => i.amount)).toEqual([5000, 5000]);
    expect(a.interest.balance).toBe(10_000);
    expect(a.totalOwed).toBe(110_000);
    expect(a.next).toMatchObject({ ratePercent: 5, estimate: 5000 });
    expect((await svc.accrue(mamcos)).added).toBe(0); // running again adds nothing
    expect(await prisma.farmerDue.count({ where: { mamcosId: mamcos, category: 'INTEREST' } })).toBeGreaterThan(before);
  });

  it('a payment settles the interest first, then the principal, each receipted on its own', async () => {
    const due = await credit(100_000, 40); await svc.accrue(mamcos); // one month: 5,000
    texts.length = 0;
    const r: any = await svc.pay(cashier, due.id, { amount: 20_000, method: 'CASH' } as any);
    expect(r.receipts.map((x: any) => [x.kind, x.amount])).toEqual([['interest', 5000], ['principal', 15_000]]);
    const a = await owed(due.id);
    expect(a.interest.balance).toBe(0); expect(a.principal.balance).toBe(85_000);
    expect(texts).toHaveLength(1);
    expect(texts[0]).toMatch(/interest TZS 5,000/);
    await expect(svc.pay(cashier, due.id, { amount: 90_001, method: 'CASH' } as any)).rejects.toThrow(/still owed/);
  });

  it('principal-first order is the AMCOS\'s choice', async () => {
    await svc.saveTerms(admin, { enabled: true, period: 'MONTHLY', graceDays: 0, paymentOrder: 'PRINCIPAL_FIRST' });
    const due = await credit(50_000, 35); await svc.accrue(mamcos); // 2,500 interest
    const r: any = await svc.pay(cashier, due.id, { amount: 10_000, method: 'CASH' } as any);
    expect(r.receipts.map((x: any) => x.kind)).toEqual(['principal']);
    const a = await owed(due.id);
    expect(a.principal.balance).toBe(40_000); expect(a.interest.balance).toBe(2500);
  });

  it('repaying early stops later months, and the grace days delay the first one', async () => {
    await svc.saveTerms(admin, { enabled: true, period: 'MONTHLY', graceDays: 20, paymentOrder: 'INTEREST_FIRST' });
    const early = await credit(80_000, 45); // first month ends on day 50: nothing yet
    await svc.accrue(mamcos);
    expect((await owed(early.id)).interest.items).toHaveLength(0);
    const paid = await credit(60_000, 100);
    await prisma.duePayment.create({ data: { mamcosId: mamcos, dueId: paid.id, farmerId, receiptNo: `T-${randomUUID().slice(0, 6)}`, amount: 60_000, paidOn: new Date(ymd(-90)), method: 'CASH' } });
    await svc.accrue(mamcos);
    expect((await owed(paid.id)).interest.items).toHaveLength(0); // paid before the first month ended
  });

  it('shows what a credit will cost before it is given', async () => {
    await svc.saveTerms(admin, { enabled: true, period: 'MONTHLY', graceDays: 0, paymentOrder: 'INTEREST_FIRST' });
    const p: any = await svc.preview(admin, 200_000);
    expect(p.enabled).toBe(true); expect(p.periods[0]).toMatchObject({ ratePercent: 5, interest: 10_000 });
    await svc.saveTerms(admin, { enabled: false, period: 'MONTHLY', graceDays: 0, paymentOrder: 'INTEREST_FIRST' });
    expect(((await svc.preview(admin, 200_000)) as any).enabled).toBe(false);
  });
});
