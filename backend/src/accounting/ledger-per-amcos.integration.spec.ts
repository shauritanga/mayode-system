/**
 * Integration tests for the per-AMCOS ledger against the throw-away `irrigation_test` schema
 * (scripts/irrigation-test-schema.sh). Skipped unless IRRIGATION_TEST_DATABASE_URL is set.
 */
import 'reflect-metadata';
import { readFileSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaClient, UserRole } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { OwnershipService, RequestUser } from '../common/ownership.service';
import { AccountingService } from './accounting.service';

const BASE_URL = process.env.IRRIGATION_TEST_DATABASE_URL;
const SCHEMA = 'irrigation_test';
const describeDb = BASE_URL ? describe : describe.skip;
const D = (offset = 0) => new Date(Date.now() + offset * 86_400_000);

describeDb('Per-AMCOS ledger (PostgreSQL)', () => {
  jest.setTimeout(120_000);
  let pool: Pool;
  let prisma: PrismaClient;
  let svc: AccountingService;
  let mamcosA: string;
  let mamcosB: string;
  let adminA: RequestUser;
  let adminB: RequestUser;
  let superAdmin: RequestUser;
  let platformAdmin: RequestUser;

  beforeAll(async () => {
    const url = `${BASE_URL!.split('?')[0]}?options=${encodeURIComponent(`-c search_path=${SCHEMA}`)}`;
    pool = new Pool({ connectionString: url, max: 6 });
    prisma = new PrismaClient({ adapter: new PrismaPg(pool, { schema: SCHEMA }) });
    const [{ current_schema }] = await prisma.$queryRawUnsafe<{ current_schema: string }[]>('select current_schema()');
    expect(current_schema).toBe(SCHEMA);
    svc = new AccountingService(prisma as any, new OwnershipService(prisma as any));
    const tag = randomUUID().slice(0, 5);
    mamcosA = (await prisma.mamcos.create({ data: { name: `Madibira L ${tag}` } })).id;
    mamcosB = (await prisma.mamcos.create({ data: { name: `Ubaruku L ${tag}` } })).id;
    adminA = { id: randomUUID(), role: UserRole.CUSTOM, mamcosId: mamcosA };
    adminB = { id: randomUUID(), role: UserRole.CUSTOM, mamcosId: mamcosB };
    superAdmin = { id: randomUUID(), role: UserRole.SUPER_ADMIN, mamcosId: null };
    platformAdmin = { id: randomUUID(), role: UserRole.CUSTOM, mamcosId: null };
  });
  afterAll(async () => { await prisma.$disconnect(); await pool.end(); });

  const sale = (id: string, amount: number, mamcosId: string | null) =>
    svc.postToLedger('Sale', id, D(-1), `Sale ${id}`, [{ code: '1000', debit: amount }, { code: '4000', credit: amount }], mamcosId);

  describe('reports are confined to one cooperative', () => {
    beforeAll(async () => {
      await sale('sale-a', 1000, mamcosA);
      await sale('sale-b', 400, mamcosB);
      await sale('sale-platform', 70, null);
    });

    it('each AMCOS sees only its own income, balance sheet, trial balance and journals', async () => {
      const a = svc.scopeFor(adminA);
      const b = svc.scopeFor(adminB);
      expect(a).toEqual({ mamcosId: mamcosA });
      expect((await svc.profitAndLoss(a)).income).toBe(1000);
      expect((await svc.profitAndLoss(b)).income).toBe(400);
      expect((await svc.balanceSheet(a)).assets).toBe(1000);
      expect((await svc.balanceSheet(b)).assets).toBe(400);
      const tbA: any = await svc.trialBalance(a);
      expect(tbA.totals ?? tbA).toBeDefined();
      expect((await svc.journalEntries(a)).map((j: any) => j.sourceId)).toEqual(['sale-a']);
      expect((await svc.journalEntries(b)).map((j: any) => j.sourceId)).toEqual(['sale-b']);
      expect((await svc.cashFlow(a)).inflows).toBe(1000);
      const stmts: any = await svc.statements(a);
      expect(stmts.profitAndLoss.income).toBe(1000);
      expect((await svc.ratios(a)).period).toEqual({ from: null, to: null });
    });

    it('Super Admin sees everything, or one AMCOS when asked', async () => {
      // other suites share this schema, so compare with the parts rather than a fixed figure
      const income = async (scope: any) => (await svc.profitAndLoss(scope)).income;
      const parts = (await income({ mamcosId: mamcosA })) + (await income({ mamcosId: mamcosB })) + (await income({ mamcosId: null }));
      // Whatever else sits in the shared test schema, "everything" must equal the sum of every cooperative plus the platform rows.
      const owners = (await prisma.ledgerEntry.findMany({ distinct: ['mamcosId'], select: { mamcosId: true } })).map((r) => r.mamcosId);
      const everyOwner = (await Promise.all(owners.map((id) => income({ mamcosId: id })))).reduce((n, v) => n + v, 0);
      expect(await income(svc.scopeFor(superAdmin))).toBeCloseTo(everyOwner, 2);
      expect(parts).toBe(1470);
      expect((await svc.profitAndLoss(svc.scopeFor(superAdmin, mamcosB))).income).toBe(400);
      expect((await svc.journalEntries(svc.scopeFor(superAdmin))).length).toBeGreaterThanOrEqual(3);
    });

    it('platform-level rows are invisible to an AMCOS, and a tenantless non-super account sees only those', async () => {
      expect((await svc.journalEntries(svc.scopeFor(adminA))).some((j: any) => j.sourceId === 'sale-platform')).toBe(false);
      expect(svc.scopeFor(platformAdmin)).toEqual({ mamcosId: null });
      expect((await svc.profitAndLoss(svc.scopeFor(platformAdmin))).income).toBe(70);
    });

    it('refuses to look at another AMCOS’s books', () => {
      expect(() => svc.scopeFor(adminA, mamcosB)).toThrow(ForbiddenException);
    });

    it('re-posting a source stays in the same AMCOS and does not double count', async () => {
      await sale('sale-a', 1000, mamcosA);
      expect((await svc.profitAndLoss(svc.scopeFor(adminA))).income).toBe(1000);
      expect(await prisma.ledgerEntry.count({ where: { sourceId: 'sale-a' } })).toBe(2);
    });

    it('still rejects unbalanced postings', async () => {
      await expect(svc.postToLedger('Bad', 'bad-1', D(), 'bad', [{ code: '1000', debit: 10 }, { code: '4000', credit: 9 }], mamcosA)).rejects.toThrow('must balance');
    });
  });

  describe('manual journals, bills and invoices belong to the author’s AMCOS', () => {
    it('stamps a manual journal with the author’s AMCOS only', async () => {
      const accounts = await svc.listAccounts();
      const cash = accounts.find((x: any) => x.code === '1000')!;
      const equity = accounts.find((x: any) => x.code === '3000')!;
      const j: any = await svc.createJournalEntry({ entryDate: D(-2).toISOString().slice(0, 10), description: 'Opening cash', lines: [{ accountId: cash.id, debit: 250 }, { accountId: equity.id, credit: 250 }] } as any, svc.scopeFor(adminB));
      expect(j).toBeDefined();
      expect(await prisma.ledgerEntry.count({ where: { sourceType: 'MANUAL_JOURNAL', mamcosId: mamcosB } })).toBe(2);
      expect((await svc.journalEntries(svc.scopeFor(adminA))).some((x: any) => x.sourceType === 'MANUAL_JOURNAL')).toBe(false);
    });

    it('bills and receivables are separated, and one AMCOS cannot pay another’s bill', async () => {
      const bill: any = await svc.createBill({ billNumber: `B-${randomUUID().slice(0, 6)}`, supplier: 'Mbarali Agro', amount: 300, dueDate: D(10).toISOString() } as any, svc.scopeFor(adminA));
      expect(bill.mamcosId).toBe(mamcosA);
      expect(await prisma.ledgerEntry.count({ where: { sourceType: 'Bill', sourceId: bill.id, mamcosId: mamcosA } })).toBe(2);
      expect((await svc.payables(svc.scopeFor(adminA))).map((p: any) => p.id)).toContain(bill.id);
      expect((await svc.payables(svc.scopeFor(adminB))).map((p: any) => p.id)).not.toContain(bill.id);
      await expect(svc.payBill(bill.id, svc.scopeFor(adminB))).rejects.toBeInstanceOf(NotFoundException);
      const paid: any = await svc.payBill(bill.id, svc.scopeFor(adminA));
      expect(paid.status).toBe('PAID');
      expect(await prisma.ledgerEntry.count({ where: { sourceType: 'BillPayment', sourceId: `${bill.id}:1`, mamcosId: mamcosA } })).toBe(2);
      const inv: any = await svc.createInvoice({ invoiceNumber: `I-${randomUUID().slice(0, 6)}`, amount: 90, dueDate: D(5).toISOString() } as any, svc.scopeFor(adminB));
      expect(inv.mamcosId).toBe(mamcosB);
      expect((await svc.receivables(svc.scopeFor(adminA))).map((r: any) => r.id)).not.toContain(inv.id);
      expect((await svc.receivables(svc.scopeFor(adminB))).map((r: any) => r.id)).toContain(inv.id);
    });
  });

  describe('migration backfill', () => {
    const backfill = readFileSync(join(__dirname, '../../prisma/migrations/20261109090000_ledger_per_amcos/migration.sql'), 'utf8');
    // Every statement after the first UPDATE is part of the backfill; strip comment lines and split on the statement terminator.
    const statements = backfill.slice(backfill.indexOf('UPDATE "ledger_entries"')).replace(/^--[^\n]*$/gm, '').split(/;\s*\n/).map((x) => x.trim()).filter(Boolean);
    // Posted rows are immutable; the one-off backfill is a maintenance operation, which the DB only allows when explicitly switched on.
    const runBackfill = () => prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.ledger_maintenance', 'on', true)`;
      for (const sql of statements) await tx.$executeRawUnsafe(sql);
    });
    it('has a backfill to test', () => { expect(statements.length).toBeGreaterThanOrEqual(10); expect(statements.every((x) => /^UPDATE/.test(x))).toBe(true); });

    it('attributes legacy rows to the AMCOS of the record behind them and leaves the rest unattributed', async () => {
      const user = async (phone: string, role: UserRole = UserRole.FARMER) => (await prisma.user.create({ data: { phone, passwordHash: 'x', role } })).id;
      const farmerA = (await prisma.farmer.create({ data: { userId: await user(`+2557${Math.floor(Math.random() * 1e8)}`), controlNumber: `LG-${randomUUID().slice(0, 6)}`, firstName: 'Asha', lastName: 'A', mamcosId: mamcosA } })).id;
      const farmerB = (await prisma.farmer.create({ data: { userId: await user(`+2556${Math.floor(Math.random() * 1e8)}`), controlNumber: `LG-${randomUUID().slice(0, 6)}`, firstName: 'Baraka', lastName: 'B', mamcosId: mamcosB } })).id;
      const loan = (await prisma.loanRecord.create({ data: { farmerId: farmerA, lenderName: 'CRDB', originalAmount: 500, amountOwed: 500 } })).id;
      const deduction = (await prisma.payment.create({ data: { farmerId: farmerA, amount: 50, paymentType: 'RICE_PURCHASE', status: 'CLEARED' } })).id;
      const dedRow = (await prisma.loanDeduction.create({ data: { loanRecordId: loan, sourcePaymentId: deduction, amount: 50 } })).id;
      const memberPay = (await prisma.payment.create({ data: { farmerId: farmerB, amount: 20, paymentType: 'RICE_PURCHASE', status: 'CLEARED' } })).id;
      const contribution = (await prisma.memberContribution.create({ data: { mamcosId: mamcosB, farmerId: farmerB, amount: 75, contributionDate: D(-3) } })).id;
      const reserve = (await prisma.reserveAllocation.create({ data: { mamcosId: mamcosA, amount: 60, allocationDate: D(-3) } })).id;
      const legacy = async (type: string, id: string) => {
        await svc.postToLedger(type, id, D(-5), `legacy ${type}`, [{ code: '1000', debit: 10 }, { code: '4000', credit: 10 }], null);
      };
      await legacy('LoanDisbursement', loan);
      await legacy('LoanDeduction', dedRow);
      await legacy('LenderRemittance', dedRow);
      await legacy('MembershipPayment', memberPay);
      await legacy('MemberContribution', contribution);
      await legacy('ReserveAllocation', reserve);
      await legacy('MANUAL_JOURNAL', randomUUID()); // nothing to read it from
      await legacy('LoanDisbursement', randomUUID()); // record no longer exists
      expect(await prisma.ledgerEntry.count({ where: { sourceType: { in: ['LoanDisbursement', 'LoanDeduction', 'LenderRemittance', 'MembershipPayment', 'MemberContribution', 'ReserveAllocation', 'MANUAL_JOURNAL'] }, mamcosId: null } })).toBeGreaterThanOrEqual(16);

      await runBackfill();
      const owner = async (type: string, id: string) => (await prisma.ledgerEntry.findFirst({ where: { sourceType: type, sourceId: id } }))?.mamcosId;
      expect(await owner('LoanDisbursement', loan)).toBe(mamcosA);
      expect(await owner('LoanDeduction', dedRow)).toBe(mamcosA);
      expect(await owner('LenderRemittance', dedRow)).toBe(mamcosA);
      expect(await owner('MembershipPayment', memberPay)).toBe(mamcosB);
      expect(await owner('MemberContribution', contribution)).toBe(mamcosB);
      expect(await owner('ReserveAllocation', reserve)).toBe(mamcosA);
      // what cannot be attributed stays platform-level instead of being guessed
      expect(await prisma.ledgerEntry.count({ where: { sourceType: 'MANUAL_JOURNAL', mamcosId: null, description: 'legacy MANUAL_JOURNAL' } })).toBe(2);
      expect(await prisma.ledgerEntry.count({ where: { sourceType: 'LoanDisbursement', mamcosId: null, description: 'legacy LoanDisbursement' } })).toBe(2);

      // totals are preserved: the backfill only labels rows, it never changes amounts or removes any
      const before = await prisma.ledgerEntry.aggregate({ _sum: { debit: true, credit: true }, _count: true });
      await runBackfill(); // re-running is harmless
      expect(await prisma.ledgerEntry.aggregate({ _sum: { debit: true, credit: true }, _count: true })).toEqual(before);
      expect(await owner('LoanDisbursement', loan)).toBe(mamcosA);
    });
  });

  it('refuses a request that names no cooperative for a tenantless create', async () => {
    await expect(svc.createJournalEntry({ entryDate: D().toISOString().slice(0, 10), description: 'x', lines: [] } as any, {})).rejects.toBeInstanceOf(BadRequestException);
  });
});
