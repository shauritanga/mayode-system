/**
 * Integration tests for the cooperative's money accounts (cash box, banks, mobile money): balances, opening balances, payments
 * landing in the right account, transfers, the cash book and per-account bank reconciliation, against the throw-away
 * `irrigation_test` schema (scripts/irrigation-test-schema.sh). Skipped unless IRRIGATION_TEST_DATABASE_URL is set.
 */
import 'reflect-metadata';
import { randomUUID } from 'crypto';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { OwnershipService } from '../common/ownership.service';
import { AccountingService, LedgerScope } from './accounting.service';
import { CashAccountsService } from './cash-accounts.service';
import { CashTransactionsService } from './cash-transactions.service';
import { ReconciliationService } from './reconciliation.service';
import { localDate } from './tax';

const BASE_URL = process.env.IRRIGATION_TEST_DATABASE_URL;
const SCHEMA = 'irrigation_test';
const describeDb = BASE_URL ? describe : describe.skip;
const day = (offset = 0) => localDate(new Date(Date.now() + offset * 86_400_000));

describeDb('Money accounts (PostgreSQL)', () => {
  jest.setTimeout(120_000);
  let pool: Pool;
  let prisma: PrismaClient;
  let accounting: AccountingService;
  let accounts: CashAccountsService;
  let cash: CashTransactionsService;
  let recon: ReconciliationService;
  const coop = async () => {
    const tag = randomUUID().slice(0, 6);
    const m = await prisma.mamcos.create({ data: { name: `Coop ${tag}`, code: `C-${tag.toUpperCase()}` } });
    return { id: m.id, scope: { mamcosId: m.id } as LedgerScope };
  };
  type Coop = Awaited<ReturnType<typeof coop>>;
  const balanceOf = async (c: Coop, name: string) => ((await accounts.list(c.scope)).items.find((a) => a.name === name))!.balance;
  const glCash = async (c: Coop) => {
    const a = (await prisma.account.findUnique({ where: { code: '1000' } }))!;
    const r = await prisma.ledgerEntry.aggregate({ where: { mamcosId: c.id, accountId: a.id }, _sum: { debit: true, credit: true } });
    return Math.round(((r._sum.debit ?? 0) - (r._sum.credit ?? 0)) * 100) / 100;
  };
  const make = (c: Coop, name: string, kind: any, extra: object = {}) => accounts.create({ name, kind, ...extra } as any, c.scope, 'u1');

  beforeAll(async () => {
    const url = `${BASE_URL!.split('?')[0]}?options=${encodeURIComponent(`-c search_path=${SCHEMA}`)}`;
    pool = new Pool({ connectionString: url, max: 8 });
    prisma = new PrismaClient({ adapter: new PrismaPg(pool, { schema: SCHEMA }) });
    accounting = new AccountingService(prisma as any, new OwnershipService(prisma as any));
    accounts = new CashAccountsService(prisma as any, accounting);
    cash = new CashTransactionsService(prisma as any, accounting);
    recon = new ReconciliationService(prisma as any, accounting);
    await accounting.listAccounts();
  });
  afterAll(async () => { await prisma.$disconnect(); await pool.end(); });

  describe('setting accounts up', () => {
    it('the first account of a kind becomes its default; names are unique per cooperative', async () => {
      const c = await coop();
      const a = await make(c, 'CRDB main', 'BANK');
      const b = await make(c, 'NMB', 'BANK');
      expect(a.isDefault).toBe(true);
      expect(b.isDefault).toBe(false);
      await expect(make(c, 'crdb MAIN', 'BANK')).rejects.toBeInstanceOf(ConflictException);
      await expect(make(c, 'x', 'BANK')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('an opening balance puts that money in the account and in the books', async () => {
      const c = await coop();
      await make(c, 'Cash box', 'CASH', { openingBalance: 150_000 });
      const list = await accounts.list(c.scope);
      expect(list.items[0].balance).toBe(150_000);
      expect(list.total).toBe(150_000);
      expect(await glCash(c)).toBe(150_000);
    });

    it('changing the default moves it; an account holding money cannot be switched off', async () => {
      const c = await coop();
      const a = await make(c, 'CRDB', 'BANK', { openingBalance: 1000 });
      const b = await make(c, 'NMB', 'BANK');
      await accounts.update(b.id, { isDefault: true }, c.scope);
      const items = (await accounts.list(c.scope)).items;
      expect(items.find((x) => x.id === a.id)!.isDefault).toBe(false);
      expect(items.find((x) => x.id === b.id)!.isDefault).toBe(true);
      await expect(accounts.update(a.id, { isActive: false }, c.scope)).rejects.toThrow('Move the money out');
      await expect(accounts.update(b.id, { isActive: false }, c.scope)).resolves.toBeDefined();
    });
  });

  describe('payments land in the right account', () => {
    it('an expense paid from a chosen account reduces only that account, and cancelling puts it back', async () => {
      const c = await coop();
      await make(c, 'CRDB', 'BANK', { openingBalance: 500_000 });
      await make(c, 'Cash box', 'CASH', { openingBalance: 100_000 });
      const bank = (await accounts.list(c.scope)).items.find((a) => a.name === 'CRDB')!;
      const e = await cash.create({ kind: 'EXPENSE', date: day(), amount: 40_000, accountCode: '5600', cashAccountId: bank.id }, c.scope, 'u1');
      expect(await balanceOf(c, 'CRDB')).toBe(460_000);
      expect(await balanceOf(c, 'Cash box')).toBe(100_000);
      await cash.voidOne(e.id, 'Entered twice by mistake', c.scope, 'u1');
      expect(await balanceOf(c, 'CRDB')).toBe(500_000);
    });

    it('with no account picked, the default account of the payment method is used', async () => {
      const c = await coop();
      await make(c, 'Cash box', 'CASH', { openingBalance: 50_000 });
      await make(c, 'M-Pesa', 'MOBILE_MONEY', { openingBalance: 20_000 });
      await cash.create({ kind: 'EXPENSE', date: day(), amount: 5_000, accountCode: '5610', method: 'MOBILE_MONEY' }, c.scope, 'u1');
      expect(await balanceOf(c, 'M-Pesa')).toBe(15_000);
      expect(await balanceOf(c, 'Cash box')).toBe(50_000);
    });

    it('with no accounts set up, money stays "not assigned" and the total still matches the books', async () => {
      const c = await coop();
      await cash.create({ kind: 'INCOME', date: day(), amount: 70_000, accountCode: '4490' }, c.scope, 'u1');
      const list = await accounts.list(c.scope);
      expect(list.items).toEqual([]);
      expect(list.unassigned).toBe(70_000);
      expect(list.total).toBe(await glCash(c));
    });

    it('a customer invoice paid into an account, and a supplier bill paid from one', async () => {
      const c = await coop();
      const bank = await make(c, 'CRDB', 'BANK', { openingBalance: 10_000 });
      const inv = await accounting.createInvoice({ amount: 118_000, dueDate: day(10), buyerId: undefined, description: 'Rice' } as any, c.scope, 'u1');
      await accounting.payInvoice(inv.id, c.scope, 'u1', bank.id);
      expect(await balanceOf(c, 'CRDB')).toBe(128_000);
      const bill = await accounting.createBill({ amount: 30_000, dueDate: day(10), supplier: 'Agro Ltd' } as any, c.scope, 'u1');
      await accounting.payBill(bill.id, c.scope, 'u1', bank.id);
      expect(await balanceOf(c, 'CRDB')).toBe(98_000);
    });

    it('refuses an account from another cooperative or one that is switched off', async () => {
      const a = await coop();
      const b = await coop();
      const theirs = await make(b, 'Their bank', 'BANK');
      await expect(cash.create({ kind: 'INCOME', date: day(), amount: 1_000, accountCode: '4490', cashAccountId: theirs.id }, a.scope, 'u1')).rejects.toThrow('your own money accounts');
      const mine = await make(a, 'Old', 'BANK');
      await accounts.update(mine.id, { isActive: false }, a.scope);
      await expect(cash.create({ kind: 'INCOME', date: day(), amount: 1_000, accountCode: '4490', cashAccountId: mine.id }, a.scope, 'u1')).rejects.toThrow('switched off');
    });
  });

  describe('moving money between accounts', () => {
    it('moves money from one account to another without changing the total, and can be cancelled', async () => {
      const c = await coop();
      const cashBox = await make(c, 'Cash box', 'CASH', { openingBalance: 200_000 });
      const bank = await make(c, 'CRDB', 'BANK');
      const t = await accounts.transfer({ fromAccountId: cashBox.id, toAccountId: bank.id, amount: 80_000, date: day(), note: 'Banked the takings' }, c.scope, 'u1');
      expect(t.number).toMatch(/^TRF-\d{4}-000001$/);
      expect(await balanceOf(c, 'Cash box')).toBe(120_000);
      expect(await balanceOf(c, 'CRDB')).toBe(80_000);
      expect(await glCash(c)).toBe(200_000);
      await accounts.cancelTransfer(t.id, 'Banked the wrong day', c.scope, 'u1');
      expect(await balanceOf(c, 'Cash box')).toBe(200_000);
      expect(await balanceOf(c, 'CRDB')).toBe(0);
      await expect(accounts.cancelTransfer(t.id, 'Again please', c.scope, 'u1')).rejects.toBeInstanceOf(ConflictException);
      expect((await accounts.transfers(c.scope))[0].status).toBe('CANCELLED');
    });

    it('moves money that was not assigned to an account into one', async () => {
      const c = await coop();
      await cash.create({ kind: 'INCOME', date: day(), amount: 90_000, accountCode: '4490' }, c.scope, 'u1');
      const bank = await make(c, 'CRDB', 'BANK');
      expect((await accounts.list(c.scope)).unassigned).toBe(90_000);
      await accounts.transfer({ toAccountId: bank.id, amount: 90_000, date: day() }, c.scope, 'u1');
      const after = await accounts.list(c.scope);
      expect(after.unassigned).toBe(0);
      expect(after.items[0].balance).toBe(90_000);
    });

    it('rejects a transfer to the same place, to a stranger’s account, or of nothing', async () => {
      const a = await coop();
      const b = await coop();
      const mine = await make(a, 'Mine', 'CASH');
      const theirs = await make(b, 'Theirs', 'CASH');
      await expect(accounts.transfer({ fromAccountId: mine.id, toAccountId: mine.id, amount: 5, date: day() }, a.scope)).rejects.toThrow('two different places');
      await expect(accounts.transfer({ fromAccountId: null, toAccountId: null, amount: 5, date: day() }, a.scope)).rejects.toThrow('two different places');
      await expect(accounts.transfer({ fromAccountId: mine.id, toAccountId: theirs.id, amount: 5, date: day() }, a.scope)).rejects.toThrow('your own active money accounts');
      await expect(accounts.transfer({ fromAccountId: mine.id, amount: 0, date: day() }, a.scope)).rejects.toThrow('greater than zero');
    });
  });

  describe('the cash book', () => {
    it('lists one account with a running balance, and an opening balance before the chosen dates', async () => {
      const c = await coop();
      const bank = await make(c, 'CRDB', 'BANK', { openingBalance: 100_000, openingDate: day(-10) });
      await cash.create({ kind: 'EXPENSE', date: day(-5), amount: 30_000, accountCode: '5600', cashAccountId: bank.id }, c.scope, 'u1');
      await cash.create({ kind: 'INCOME', date: day(-1), amount: 10_000, accountCode: '4490', cashAccountId: bank.id }, c.scope, 'u1');
      const all = await accounts.cashBook(c.scope, { account: bank.id });
      expect(all.rows.map((r) => r.balance)).toEqual([100_000, 70_000, 80_000]);
      expect(all.closing).toBe(80_000);
      const recent = await accounts.cashBook(c.scope, { account: bank.id, from: day(-3) });
      expect(recent.opening).toBe(70_000);
      expect(recent.rows).toHaveLength(1);
      expect(recent.totalIn).toBe(10_000);
    });

    it('filters by kind and by money not yet assigned', async () => {
      const c = await coop();
      await make(c, 'M-Pesa', 'MOBILE_MONEY', { openingBalance: 5_000 });
      await make(c, 'CRDB', 'BANK', { openingBalance: 9_000 });
      expect((await accounts.cashBook(c.scope, { kind: 'MOBILE_MONEY' })).closing).toBe(5_000);
      expect((await accounts.cashBook(c.scope, { account: 'unassigned' })).rows).toEqual([]);
      expect((await accounts.cashBook(c.scope, {})).closing).toBe(14_000);
    });
  });

  describe('manual journals and reversals', () => {
    it('a journal line can name the account, and reversing it goes back to the same one', async () => {
      const c = await coop();
      const wallet = await make(c, 'M-Pesa', 'MOBILE_MONEY');
      const cashAcct = (await accounting.listAccounts()).find((a) => a.code === '1000')!;
      const equity = (await accounting.listAccounts()).find((a) => a.code === '3000')!;
      const j: any = await accounting.createJournalEntry({ entryDate: day(), description: 'Gift', lines: [{ accountId: cashAcct.id, debit: 25_000, cashAccountId: wallet.id }, { accountId: equity.id, credit: 25_000 }] } as any, c.scope, 'u1');
      expect(await balanceOf(c, 'M-Pesa')).toBe(25_000);
      await accounting.reverseJournal(j.journalId, { reason: 'Recorded in error' } as any, c.scope, 'u1');
      expect(await balanceOf(c, 'M-Pesa')).toBe(0);
      await expect(accounting.createJournalEntry({ entryDate: day(), description: 'Bad', lines: [{ accountId: equity.id, debit: 5, cashAccountId: wallet.id }, { accountId: cashAcct.id, credit: 5 }] } as any, c.scope, 'u1')).rejects.toThrow('Only a line on the cash account');
    });
  });

  describe('bank reconciliation per account', () => {
    it('a statement is matched only against its own account', async () => {
      const c = await coop();
      const bank = await make(c, 'CRDB', 'BANK', { openingBalance: 0 });
      const wallet = await make(c, 'M-Pesa', 'MOBILE_MONEY');
      await cash.create({ kind: 'INCOME', date: day(-2), amount: 40_000, accountCode: '4490', cashAccountId: bank.id }, c.scope, 'u1');
      await cash.create({ kind: 'INCOME', date: day(-2), amount: 40_000, accountCode: '4490', cashAccountId: wallet.id }, c.scope, 'u1');
      const st: any = await recon.create({ cashAccountId: bank.id, periodStart: day(-5), periodEnd: day(0), openingBalance: 0, closingBalance: 40_000, lines: [{ date: day(-2), description: 'Deposit', amount: 40_000 }] }, c.scope, 'u1');
      expect(st.accountLabel).toBe('CRDB');
      expect(st.kind).toBe('BANK');
      expect(st.unmatchedLines).toBe(0);
      const matched = (await prisma.bankStatementLine.findFirst({ where: { statementId: st.id }, include: { ledgerEntry: true } }))!;
      expect(matched.ledgerEntry!.cashAccountId).toBe(bank.id);
      // The wallet's entry is not a candidate for the bank statement.
      expect(st.unmatchedLedger.every((e: any) => e.amount !== 40_000)).toBe(true);
    });

    it('refuses to match a line to an entry of a different account, and books a bank charge in the statement’s account', async () => {
      const c = await coop();
      const bank = await make(c, 'CRDB', 'BANK', { openingBalance: 100_000, openingDate: day(-20) });
      const wallet = await make(c, 'M-Pesa', 'MOBILE_MONEY');
      const other = await cash.create({ kind: 'INCOME', date: day(-2), amount: 7_000, accountCode: '4490', cashAccountId: wallet.id }, c.scope, 'u1');
      const st: any = await recon.create({ cashAccountId: bank.id, periodStart: day(-5), periodEnd: day(0), openingBalance: 100_000, closingBalance: 92_000, lines: [{ date: day(-2), description: 'Monthly fee', amount: -8_000 }, { date: day(-1), description: 'Odd', amount: 7_000 }] }, c.scope, 'u1');
      const fee = st.lines.find((l: any) => l.description === 'Monthly fee');
      const odd = st.lines.find((l: any) => l.description === 'Odd');
      const walletEntry = (await prisma.ledgerEntry.findFirst({ where: { sourceId: other.id } }))!;
      await expect(recon.match(odd.id, walletEntry.id, c.scope, 'u1')).rejects.toThrow('different money account');
      const bankCharges = (await accounting.listAccounts()).find((a) => a.code === '5640')!;
      await recon.adjust(fee.id, { accountId: bankCharges.id }, c.scope, 'u1');
      expect(await balanceOf(c, 'CRDB')).toBe(92_000);
    });

    it('the summary compares each account with its own latest statement', async () => {
      const c = await coop();
      const bank = await make(c, 'CRDB', 'BANK', { openingBalance: 50_000, openingDate: day(-20) });
      await make(c, 'Cash box', 'CASH', { openingBalance: 10_000 });
      const st: any = await recon.create({ cashAccountId: bank.id, periodStart: day(-10), periodEnd: day(-1), openingBalance: 50_000, closingBalance: 50_000, lines: [{ date: day(-3), description: 'Interest', amount: 0.01 }, { date: day(-2), description: 'Fee', amount: -0.01 }] }, c.scope, 'u1');
      expect(st.id).toBeDefined();
      const s = await recon.summary(c.scope);
      const row = s.byAccount.find((a) => a.name === 'CRDB')!;
      expect(row.books).toBe(50_000);
      expect(row.statement).toBe(50_000);
      expect(s.byAccount.find((a) => a.name === 'Cash box')!.statement).toBeNull();
    });
  });
});
