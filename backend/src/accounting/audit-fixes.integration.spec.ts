/** Part payments, atomic documents, budget actuals and contributions, against the throw-away `irrigation_test` schema. Skipped unless IRRIGATION_TEST_DATABASE_URL is set. */
import 'reflect-metadata';
import { randomUUID } from 'crypto';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaClient, UserRole } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { OwnershipService } from '../common/ownership.service';
import { AccountingService } from './accounting.service';

const BASE_URL = process.env.IRRIGATION_TEST_DATABASE_URL;
(BASE_URL ? describe : describe.skip)('Accounting audit fixes (PostgreSQL)', () => {
  jest.setTimeout(120_000);
  let pool: Pool; let prisma: PrismaClient; let svc: AccountingService;
  const day = () => new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10);
  const due = () => new Date(Date.now() + 10 * 86400_000).toISOString().slice(0, 10);
  const coop = async () => { const m = await prisma.mamcos.create({ data: { name: `Aud ${randomUUID().slice(0, 6)}` } }); return { id: m.id, scope: { mamcosId: m.id } }; };
  const account = async (id: string, code: string) => {
    const a = await prisma.account.findUniqueOrThrow({ where: { code } });
    const rows = await prisma.ledgerEntry.findMany({ where: { mamcosId: id, accountId: a.id } });
    return rows.reduce((n, r) => n + r.debit - r.credit, 0);
  };

  beforeAll(() => {
    const url = `${BASE_URL!.split('?')[0]}?options=${encodeURIComponent('-c search_path=irrigation_test')}`;
    pool = new Pool({ connectionString: url, max: 4 });
    prisma = new PrismaClient({ adapter: new PrismaPg(pool, { schema: 'irrigation_test' }) });
    svc = new AccountingService(prisma as any, new OwnershipService(prisma as any));
  });
  afterAll(async () => { await prisma.$disconnect(); await pool.end(); });

  it('an invoice can be paid in parts: receivable falls each time, tax is withheld in step, and it is PAID only at the end', async () => {
    const a = await coop();
    const inv = await svc.createInvoice({ amount: 1000, dueDate: due(), withholdingPercent: 10 } as any, a.scope, 'u');
    expect(inv.amount).toBe(1000);
    expect(await account(a.id, '1100')).toBe(1000);
    const p1 = await svc.payInvoice(inv.id, a.scope, 'u', null, 400);
    expect([p1.status, p1.amountPaid]).toEqual(['OPEN', 400]);
    expect(await account(a.id, '1100')).toBe(600);
    expect(await account(a.id, '1000')).toBe(360);   // 400 less 40 withheld
    expect(await account(a.id, '1410')).toBe(40);
    const open = (await svc.receivables(a.scope)).find((r: any) => r.id === inv.id)!;
    expect([open.balance, open.total, open.amountPaid]).toEqual([600, 1000, 400]);
    await expect(svc.payInvoice(inv.id, a.scope, 'u', null, 700)).rejects.toBeInstanceOf(BadRequestException);
    await expect(svc.voidInvoice(inv.id, a.scope)).rejects.toThrow(/part-paid/);
    const p2 = await svc.payInvoice(inv.id, a.scope, 'u');
    expect([p2.status, p2.amountPaid]).toEqual(['PAID', 1000]);
    expect(await account(a.id, '1100')).toBe(0);
    expect(await account(a.id, '1000')).toBe(900);   // 1000 less 100 withheld in total
    expect(await account(a.id, '1410')).toBe(100);
    await expect(svc.payInvoice(inv.id, a.scope, 'u')).rejects.toBeInstanceOf(ConflictException);
    const docs: any[] = await svc.documents('INVOICE', a.scope, 'PAID');
    expect(docs[0].payments.map((p: any) => p.amount)).toEqual([400, 600]);
  });

  it('a bill is paid in parts against what is owed to the supplier, and an old fully-paid one still reads as paid', async () => {
    const a = await coop();
    const bill = await svc.createBill({ amount: 500, supplier: 'Agro Ltd', dueDate: due(), withholdingPercent: 0 } as any, a.scope, 'u');
    await svc.payBill(bill.id, a.scope, 'u', null, 200);
    expect(await account(a.id, '2100')).toBe(-300);
    const done = await svc.payBill(bill.id, a.scope, 'u');
    expect(done.status).toBe('PAID');
    expect(await account(a.id, '2100')).toBe(0);
    expect(await account(a.id, '1000')).toBe(-500);
    expect((await svc.payables(a.scope)).length).toBe(0);
  });

  it('two people paying the same invoice at once cannot both book it', async () => {
    const a = await coop();
    const inv = await svc.createInvoice({ amount: 300, dueDate: due() } as any, a.scope, 'u');
    const results = await Promise.allSettled([svc.payInvoice(inv.id, a.scope, 'x'), svc.payInvoice(inv.id, a.scope, 'y')]);
    expect(results.filter((r) => r.status === 'fulfilled').length).toBe(1);
    expect(await account(a.id, '1000')).toBe(300);
  });

  it('the overdue sweep only touches the cooperative being read', async () => {
    const a = await coop(); const b = await coop();
    const past = new Date(Date.now() - 5 * 86400_000).toISOString().slice(0, 10);
    const ia = await svc.createInvoice({ amount: 10, dueDate: past } as any, a.scope, 'u');
    const ib = await svc.createInvoice({ amount: 10, dueDate: past } as any, b.scope, 'u');
    await svc.receivables(a.scope);
    expect((await prisma.invoice.findUniqueOrThrow({ where: { id: ia.id } })).status).toBe('OVERDUE');
    expect((await prisma.invoice.findUniqueOrThrow({ where: { id: ib.id } })).status).toBe('OPEN');
  });

  it('budget actuals use only the budget’s own cooperative, the whole last day, and the right side of income', async () => {
    const a = await coop(); const b = await coop();
    const user = { id: randomUUID(), role: UserRole.CUSTOM, mamcosId: a.id } as any;
    const fuel = await prisma.account.findUniqueOrThrow({ where: { code: '5600' } });
    const sales = await prisma.account.findUniqueOrThrow({ where: { code: '4000' } });
    const d = day();
    await svc.postToLedger('Expense', `bx-${a.id}`, new Date(`${d}T10:00:00+03:00`), 'fuel', [{ code: '5600', debit: 300 }, { code: '1000', credit: 300 }], a.id);
    await svc.postToLedger('Expense', `bx-${b.id}`, new Date(`${d}T10:00:00+03:00`), 'fuel', [{ code: '5600', debit: 999 }, { code: '1000', credit: 999 }], b.id);
    await svc.postToLedger('Sale', `bs-${a.id}`, new Date(`${d}T10:00:00+03:00`), 'sale', [{ code: '1000', debit: 700 }, { code: '4000', credit: 700 }], a.id);
    const budget = await svc.createBudget({ name: 'Q', fiscalYear: 2026, startDate: d, endDate: d, lines: [{ accountId: fuel.id, amount: 500 }, { accountId: sales.id, amount: 600 }] } as any, user);
    const actual: any = await svc.budgetActual(budget.id, user);
    const fuelLine = actual.lines.find((l: any) => l.accountId === fuel.id);
    const salesLine = actual.lines.find((l: any) => l.accountId === sales.id);
    expect([fuelLine.actual, fuelLine.variance]).toEqual([300, 200]);       // under budget by 200
    expect([salesLine.actual, salesLine.variance]).toEqual([700, 100]);     // income over budget by 100
    await expect(svc.createBudget({ name: 'Bad', fiscalYear: 2026, startDate: d, endDate: '2020-01-01', lines: [{ accountId: fuel.id, amount: 1 }] } as any, user)).rejects.toBeInstanceOf(BadRequestException);
    await expect(svc.createBudget({ name: 'Dup', fiscalYear: 2026, startDate: d, endDate: d, lines: [{ accountId: fuel.id, amount: 1 }, { accountId: fuel.id, amount: 2 }] } as any, user)).rejects.toThrow(/only once/);
    await expect(svc.budgetActual(randomUUID(), user)).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc.findBudget(randomUUID(), user)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('a member contribution is booked with the user, through the right money account, and refuses a future date', async () => {
    const a = await coop();
    const user = { id: randomUUID(), role: UserRole.CUSTOM, mamcosId: a.id } as any;
    const u = await prisma.user.create({ data: { phone: `+2557${Math.floor(Math.random() * 1e8)}`, passwordHash: 'x', role: UserRole.FARMER } });
    const f = await prisma.farmer.create({ data: { userId: u.id, controlNumber: `M-${randomUUID().slice(0, 6)}`, firstName: 'Neema', lastName: 'Member', mamcosId: a.id } });
    const bank = await prisma.cashAccount.create({ data: { mamcosId: a.id, name: 'CRDB', kind: 'BANK', isDefault: true } as any });
    const c: any = await svc.createMemberContribution({ farmerId: f.id, amount: 5000, contributionDate: day(), paymentMethod: 'BANK' } as any, user);
    const e = await prisma.ledgerEntry.findFirst({ where: { sourceType: 'MemberContribution', sourceId: c.id, debit: { gt: 0 } } });
    expect([e?.cashAccountId, e?.postedById]).toEqual([bank.id, user.id]);
    const future = new Date(Date.now() + 5 * 86400_000).toISOString().slice(0, 10);
    await expect(svc.createMemberContribution({ farmerId: f.id, amount: 1, contributionDate: future } as any, user)).rejects.toThrow(/future/);
    await expect(svc.createReserveAllocation({ amount: 1, allocationDate: future } as any, user)).rejects.toThrow(/future/);
  });
});
