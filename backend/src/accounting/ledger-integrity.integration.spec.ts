/**
 * Integration tests for ledger integrity (immutable entries, adjustments, sequential numbers, period close, reversals),
 * VAT / withholding and bank reconciliation, against the throw-away `irrigation_test` schema
 * (scripts/irrigation-test-schema.sh). Skipped unless IRRIGATION_TEST_DATABASE_URL is set.
 */
import 'reflect-metadata';
import { randomUUID } from 'crypto';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaClient, UserRole } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { OwnershipService } from '../common/ownership.service';
import { AccountingService, LedgerScope } from './accounting.service';
import { PeriodLockService } from './period-lock.service';
import { ReconciliationService } from './reconciliation.service';
import { TaxService } from './tax.service';
import { CashTransactionsService } from './cash-transactions.service';
import { localDate } from './tax';

const BASE_URL = process.env.IRRIGATION_TEST_DATABASE_URL;
const SCHEMA = 'irrigation_test';
const describeDb = BASE_URL ? describe : describe.skip;

/** Last day of the month before the current one, and a day inside that month. */
function lastMonth() {
  const now = new Date(Date.now() + 3 * 3_600_000);
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0));
  const mid = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 10, 9));
  return { end: end.toISOString().slice(0, 10), mid, midDay: mid.toISOString().slice(0, 10) };
}
const prevMonth = (ymd: string) => { const d = new Date(`${ymd}T00:00:00Z`); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 0)).toISOString().slice(0, 10); };

describeDb('Ledger integrity, tax and reconciliation (PostgreSQL)', () => {
  jest.setTimeout(120_000);
  let pool: Pool;
  let prisma: PrismaClient;
  let svc: AccountingService;
  let periods: PeriodLockService;
  let recon: ReconciliationService;
  let tax: TaxService;
  let cash: CashTransactionsService;
  const fresh = async (name: string, extra: object = {}) => {
    const m = await prisma.mamcos.create({ data: { name: `${name} ${randomUUID().slice(0, 5)}`, ...extra } });
    return { id: m.id, scope: { mamcosId: m.id } as LedgerScope };
  };
  const post = (id: string, amount: number, mamcosId: string | null, when = new Date(), type = 'Sale') =>
    svc.postToLedger(type, id, when, `${type} ${id}`, [{ code: '1000', debit: amount }, { code: '4000', credit: amount }], mamcosId);
  const acct = async (code: string) => (await prisma.account.findUnique({ where: { code } }))!;

  beforeAll(async () => {
    const url = `${BASE_URL!.split('?')[0]}?options=${encodeURIComponent(`-c search_path=${SCHEMA}`)}`;
    pool = new Pool({ connectionString: url, max: 8 });
    prisma = new PrismaClient({ adapter: new PrismaPg(pool, { schema: SCHEMA }) });
    svc = new AccountingService(prisma as any, new OwnershipService(prisma as any));
    periods = new PeriodLockService(prisma as any);
    recon = new ReconciliationService(prisma as any, svc);
    tax = new TaxService(prisma as any, svc);
    cash = new CashTransactionsService(prisma as any, svc);
    await svc.listAccounts();
  });
  afterAll(async () => { await prisma.$disconnect(); await pool.end(); });

  describe('posted entries never change', () => {
    it('the database refuses to update or delete a ledger row', async () => {
      const a = await fresh('Immutable');
      await post('imm-1', 100, a.id);
      const row = (await prisma.ledgerEntry.findFirst({ where: { sourceId: 'imm-1' } }))!;
      await expect(prisma.ledgerEntry.update({ where: { id: row.id }, data: { debit: 1 } })).rejects.toThrow(/cannot be changed or deleted/);
      await expect(prisma.ledgerEntry.delete({ where: { id: row.id } })).rejects.toThrow(/cannot be changed or deleted/);
      await expect(prisma.$executeRawUnsafe(`DELETE FROM ledger_entries WHERE source_id = 'imm-1'`)).rejects.toThrow(/cannot be changed or deleted/);
    });
    it('refuses a journal that does not balance, however it is inserted', async () => {
      const a = await fresh('Unbalanced');
      const cash = await acct('1000');
      await expect(prisma.ledgerEntry.create({
        data: { entryNumber: 'X-1', journalId: randomUUID(), accountId: cash.id, debit: 50, credit: 0, entryDate: new Date(), sourceType: 'Raw', sourceId: randomUUID(), mamcosId: a.id },
      })).rejects.toThrow(/does not balance/);
    });
  });

  describe('re-posting books only the difference', () => {
    it('is idempotent, adjusts by delta, and a void offsets everything', async () => {
      const a = await fresh('Adjust');
      await post('adj-1', 100, a.id);
      expect(await post('adj-1', 100, a.id)).toEqual([]);
      await post('adj-1', 130, a.id);
      const rows = await prisma.ledgerEntry.findMany({ where: { sourceId: 'adj-1' }, orderBy: [{ revision: 'asc' }] });
      expect(rows.map((r) => r.revision)).toEqual([1, 1, 2, 2]);
      expect(rows.filter((r) => r.revision === 2).map((r) => r.debit + r.credit)).toEqual([30, 30]);
      expect((await svc.trialBalance(a.scope)).lines.find((l: any) => l.code === '1000')!.debitBalance).toBe(130);
      await svc.postToLedger('Sale', 'adj-1', new Date(), 'void', [], a.id);
      expect((await svc.trialBalance(a.scope)).lines.find((l: any) => l.code === '1000')!.debitBalance).toBe(0);
      const journals = await svc.journalEntries(a.scope);
      expect(journals.map((j: any) => j.revision).sort()).toEqual([1, 2, 3]);
      expect(journals.every((j: any) => j.totalDebit === j.totalCredit)).toBe(true);
    });
  });

  describe('sequential numbers', () => {
    it('run 1, 2, 3 … per cooperative with no gaps, even when posted at the same time', async () => {
      const a = await fresh('NumA');
      const b = await fresh('NumB');
      await Promise.all(Array.from({ length: 8 }, (_, i) => post(`num-a-${i}`, 10 + i, a.id)));
      await post('num-b-0', 5, b.id);
      const numbersOf = async (id: string) => [...new Set((await prisma.ledgerEntry.findMany({ where: { mamcosId: id }, select: { entryNumber: true } })).map((r) => r.entryNumber))].sort();
      const year = localDate(new Date()).slice(0, 4);
      expect(await numbersOf(a.id)).toEqual(Array.from({ length: 8 }, (_, i) => `GL-${year}-${String(i + 1).padStart(6, '0')}`));
      expect(await numbersOf(b.id)).toEqual([`GL-${year}-000001`]);
    });
    it('does not use up a number when the posting fails', async () => {
      const a = await fresh('NumFail');
      await post('nf-1', 10, a.id);
      await expect(svc.postToLedger('Sale', 'nf-bad', new Date(), 'bad', [{ code: '1000', debit: 5 }, { code: '9999', credit: 5 }], a.id)).rejects.toBeInstanceOf(BadRequestException);
      await post('nf-2', 10, a.id);
      const nums = [...new Set((await prisma.ledgerEntry.findMany({ where: { mamcosId: a.id } })).map((r) => r.entryNumber))].sort();
      expect(nums.map((n) => Number(n.slice(-6)))).toEqual([1, 2]);
    });
  });

  describe('closing the books', () => {
    it('shifts system postings, rejects manual journals, blocks raw inserts, and reopening needs a reason', async () => {
      const a = await fresh('Close');
      const b = await fresh('CloseOther');
      const { end, mid, midDay } = lastMonth();
      await post('close-before', 100, a.id, mid);
      expect((await periods.check(a.scope, end)).balanced).toBe(true);
      await expect(periods.close('2026-02-15', a.scope, 'u1')).rejects.toBeInstanceOf(BadRequestException); // not a month end
      await expect(periods.close(localDate(new Date(Date.now() + 40 * 86_400_000)).slice(0, 8) + '28', a.scope, 'u1')).rejects.toBeInstanceOf(BadRequestException);
      await periods.close(end, a.scope, 'u1');
      await expect(periods.close(end, a.scope, 'u1')).rejects.toBeInstanceOf(ConflictException);
      await expect(periods.close(prevMonth(end), a.scope, 'u1')).rejects.toBeInstanceOf(ConflictException);

      // a late system posting lands on the first open day instead
      await post('close-late', 40, a.id, mid);
      const late = (await prisma.ledgerEntry.findFirst({ where: { sourceId: 'close-late' } }))!;
      expect(localDate(late.entryDate) > end).toBe(true);
      expect(late.description).toContain('that period is closed');
      // a manual journal is refused outright
      const cash = await acct('1000'); const eq = await acct('3000');
      await expect(svc.createJournalEntry({ entryDate: midDay, description: 'back-dated', lines: [{ accountId: cash.id, debit: 5 }, { accountId: eq.id, credit: 5 }] } as any, a.scope, 'u1')).rejects.toThrow(/closed through/);
      // the database refuses even a direct insert
      await expect(prisma.ledgerEntry.createMany({ data: [
        { entryNumber: 'Z', journalId: 'zz', accountId: cash.id, debit: 1, credit: 0, entryDate: mid, sourceType: 'Raw', sourceId: 'zz', mamcosId: a.id },
        { entryNumber: 'Z', journalId: 'zz', accountId: eq.id, debit: 0, credit: 1, entryDate: mid, sourceType: 'Raw', sourceId: 'zz', mamcosId: a.id },
      ] })).rejects.toThrow(/books are closed/);
      // another cooperative is unaffected
      await post('close-other', 9, b.id, mid);
      expect(await prisma.ledgerEntry.count({ where: { sourceId: 'close-other', description: { contains: 'closed' } } })).toBe(0);

      await expect(periods.reopen(null, 'short', a.scope, 'u2')).rejects.toBeInstanceOf(BadRequestException);
      await periods.reopen(null, 'Auditor found a missing invoice', a.scope, 'u2');
      await post('close-after-reopen', 7, a.id, mid);
      expect(localDate((await prisma.ledgerEntry.findFirst({ where: { sourceId: 'close-after-reopen' } }))!.entryDate)).toBe(midDay);
      const status = await periods.status(a.scope);
      expect(status.closedThrough).toBeNull();
      expect(status.events.map((e) => e.action)).toEqual(['REOPEN', 'CLOSE']);
      await expect(prisma.accountingLockEvent.deleteMany({})).rejects.toThrow(/cannot be changed/);
    });
  });

  describe('reversing a manual journal', () => {
    it('mirrors it once, refuses system journals, and keeps the books balanced', async () => {
      const a = await fresh('Reverse');
      const cash = await acct('1000'); const rev = await acct('4200');
      const j: any = await svc.createJournalEntry({ entryDate: localDate(new Date()), description: 'Membership fee', lines: [{ accountId: cash.id, debit: 80 }, { accountId: rev.id, credit: 80 }] } as any, a.scope, 'u1');
      expect(j.entryNumber).toMatch(/^JE-\d{4}-\d{6}$/);
      await expect(svc.reverseJournal(j.id, { reason: 'x' }, a.scope, 'u1')).rejects.toBeInstanceOf(BadRequestException);
      const r: any = await svc.reverseJournal(j.id, { reason: 'Posted to the wrong month' }, a.scope, 'u1');
      expect(r.reversesJournalId).toBe(j.id);
      expect(r.lines.find((l: any) => l.account.code === '1000').credit).toBe(80);
      await expect(svc.reverseJournal(j.id, { reason: 'again please' }, a.scope, 'u1')).rejects.toBeInstanceOf(ConflictException);
      await expect(svc.reverseJournal(r.id, { reason: 'reverse the reverse' }, a.scope, 'u1')).rejects.toBeInstanceOf(BadRequestException);
      expect((await svc.journalEntries(a.scope)).find((x: any) => x.id === j.id).reversed).toBe(true);
      const tb: any = await svc.trialBalance(a.scope);
      expect(tb.balanced).toBe(true);
      expect(tb.lines.find((l: any) => l.code === '1000').debitBalance).toBe(0);
      await post('sys-1', 10, a.id);
      const sys = (await prisma.ledgerEntry.findFirst({ where: { sourceId: 'sys-1' } }))!;
      await expect(svc.reverseJournal(sys.journalId, { reason: 'trying to undo a sale' }, a.scope, 'u1')).rejects.toThrow(/Only manual journals/);
      // a different cooperative cannot see, so cannot reverse, this journal
      const other = await fresh('ReverseOther');
      await expect(svc.reverseJournal(j.id, { reason: 'not mine to reverse' }, other.scope, 'u1')).rejects.toThrow(/not found/);
    });
  });

  describe('VAT and withholding tax', () => {
    it('adds VAT only for a VAT-registered cooperative and posts it to the right accounts', async () => {
      const plain = await fresh('NoVat');
      const inv0: any = await svc.createInvoice({ amount: 1000, dueDate: new Date(Date.now() + 864e5).toISOString() } as any, plain.scope, 'u1');
      expect(inv0.vatAmount).toBe(0);
      expect(inv0.amount).toBe(1000);

      const a = await fresh('Vat', { vatRegistered: true, vatRate: 18, vrn: '40-123456-A', tin: '123-456-789' });
      const inv: any = await svc.createInvoice({ amount: 1000, withholdingPercent: 5, dueDate: new Date(Date.now() + 864e5).toISOString() } as any, a.scope, 'u1');
      expect(inv.invoiceNumber).toMatch(/^INV-\d{4}-000001$/);
      expect(inv).toMatchObject({ subtotal: 1000, vatAmount: 180, amount: 1180, withholdingAmount: 50 });
      const tb = async () => Object.fromEntries((await svc.trialBalance(a.scope) as any).lines.map((l: any) => [l.code, l.debitBalance - l.creditBalance]));
      expect(await tb()).toMatchObject({ '1100': 1180, '4000': -1000, '2400': -180 });
      await svc.payInvoice(inv.id, a.scope, 'u1');
      expect(await tb()).toMatchObject({ '1100': 0, '1000': 1130, '1410': 50 });
      await expect(svc.payInvoice(inv.id, a.scope, 'u1')).rejects.toBeInstanceOf(ConflictException);

      const bill: any = await svc.createBill({ supplier: 'Mbeya Spares', amount: 500, withholdingPercent: 5, expenseAccountCode: '5410', dueDate: new Date(Date.now() + 864e5).toISOString() } as any, a.scope, 'u1');
      expect(bill).toMatchObject({ subtotal: 500, vatAmount: 90, amount: 590, withholdingAmount: 25 });
      expect(await tb()).toMatchObject({ '5410': 500, '1400': 90, '2100': -565, '2410': -25 });
      await svc.payBill(bill.id, a.scope, 'u1');
      expect(await tb()).toMatchObject({ '2100': 0, '1000': 1130 - 565 });

      const today = localDate(new Date());
      const ret = await tax.vatReturn(a.scope, `${today.slice(0, 8)}01`, today);
      expect(ret).toMatchObject({ outputVat: 180, inputVat: 90, netVatPayable: 90, vatOwedToDate: 90, withholdingPayableToDate: 25, withholdingCreditToDate: 50 });
      expect(ret.sales).toHaveLength(1);
      expect(ret.purchases).toHaveLength(1);

      const settled = await tax.settleVat({ through: today, paidOn: today, reference: 'TRA-1' }, a.scope, 'u1');
      expect(settled.paid).toBe(90);
      expect(await tb()).toMatchObject({ '2400': 0, '1400': 0 });
      await expect(tax.settleVat({ through: today, paidOn: today }, a.scope, 'u1')).rejects.toBeInstanceOf(BadRequestException);
      await expect(tax.remitWithholding({ amount: 100, paidOn: today }, a.scope, 'u1')).rejects.toThrow(/Only 25/);
      expect((await tax.remitWithholding({ amount: 25, paidOn: today }, a.scope, 'u1')).stillOwed).toBe(0);
      expect((await svc.trialBalance(a.scope) as any).balanced).toBe(true);
    });
    it('voids an unpaid invoice by offsetting its postings, and numbers repeat safely across cooperatives', async () => {
      const a = await fresh('VoidA', { vatRegistered: true, vrn: 'V-1' });
      const b = await fresh('VoidB');
      const due = new Date(Date.now() + 864e5).toISOString();
      const inv: any = await svc.createInvoice({ invoiceNumber: 'SAME-1', amount: 100, dueDate: due } as any, a.scope, 'u1');
      await svc.createInvoice({ invoiceNumber: 'SAME-1', amount: 100, dueDate: due } as any, b.scope, 'u1'); // other cooperative: fine
      await expect(svc.createInvoice({ invoiceNumber: 'SAME-1', amount: 100, dueDate: due } as any, a.scope, 'u1')).rejects.toBeInstanceOf(ConflictException);
      await svc.voidInvoice(inv.id, a.scope, 'u1');
      const tb: any = await svc.trialBalance(a.scope);
      expect(tb.lines.every((l: any) => l.debitBalance === 0 && l.creditBalance === 0)).toBe(true);
      await expect(svc.payInvoice(inv.id, a.scope, 'u1')).rejects.toBeInstanceOf(BadRequestException);
    });
    it('requires a VRN before a cooperative can be marked VAT-registered', async () => {
      const a = await fresh('VrnNeeded');
      await expect(tax.updateSettings({ vatRegistered: true }, a.scope)).rejects.toBeInstanceOf(BadRequestException);
      expect((await tax.updateSettings({ vatRegistered: true, vrn: '40-1', tin: '1-2-3' }, a.scope)).vatRegistered).toBe(true);
    });
  });

  describe('bank reconciliation', () => {
    it('matches lines to the cash book, journals what is missing, and locks a reconciled statement', async () => {
      const a = await fresh('Recon');
      const day = localDate(new Date());
      const start = `${day.slice(0, 8)}01`;
      await post('rc-1', 500, a.id); // cash in 500
      await svc.postToLedger('Pay', 'rc-2', new Date(), 'Supplier paid', [{ code: '2100', debit: 200 }, { code: '1000', credit: 200 }], a.id);
      const statement = await recon.create({
        accountLabel: 'CRDB 0150', periodStart: start, periodEnd: day, openingBalance: 1000, closingBalance: 1295,
        lines: [
          { date: day, description: 'Deposit', amount: 500 },
          { date: day, description: 'Cheque 114', amount: -200 },
          { date: day, description: 'Bank charges', amount: -5 },
        ],
      }, a.scope, 'u1');
      expect(statement.unmatchedLines).toBe(1); // auto-match paired the first two
      expect(statement.arithmeticDifference).toBe(0);
      await expect(recon.reconcile(statement.id, a.scope, 'u1')).rejects.toThrow(/not matched/);

      const charge = statement.lines.find((l) => l.description === 'Bank charges')!;
      const expenseAcct = await acct('5410');
      const adjusted = await recon.adjust(charge.id, { accountId: expenseAcct.id }, a.scope, 'u1');
      expect(adjusted.unmatchedLines).toBe(0);
      const done = await recon.reconcile(statement.id, a.scope, 'u1');
      expect(done.status).toBe('RECONCILED');

      const sum = await recon.summary(a.scope, day);
      expect(sum).toMatchObject({ ledgerBalance: 295, statementsTotal: 1295, hasStatements: true });
      // the 1,000 opening balance predates the books here, so it is the whole difference
      expect(sum.difference).toBe(-1000);

      await expect(prisma.bankStatementLine.update({ where: { id: charge.id }, data: { description: 'edited' } })).rejects.toThrow(/reconciled/);
      await expect(recon.remove(statement.id, a.scope)).rejects.toBeInstanceOf(ConflictException);
      await recon.reopen(statement.id, a.scope);
      await recon.unmatch(charge.id, a.scope);
      expect((await recon.detail(statement.id, a.scope)).unmatchedLines).toBe(1);
    });
    it('rejects a statement whose lines do not add up and a match of different amounts', async () => {
      const a = await fresh('ReconBad');
      const day = localDate(new Date());
      await post('rb-1', 100, a.id);
      const st = await recon.create({ accountLabel: 'M-Pesa', kind: 'MOBILE_MONEY', periodStart: day, periodEnd: day, openingBalance: 0, closingBalance: 999, lines: [{ date: day, description: 'In', amount: 100 }] }, a.scope, 'u1');
      await expect(recon.reconcile(st.id, a.scope, 'u1')).rejects.toThrow(/do not add up/);
      const other = await recon.create({ accountLabel: 'Tigo', kind: 'MOBILE_MONEY', periodStart: day, periodEnd: day, openingBalance: 0, closingBalance: 7, lines: [{ date: day, description: 'In', amount: 7 }] }, a.scope, 'u1');
      await post('rb-2', 300, a.id);
      const entry = (await prisma.ledgerEntry.findFirst({ where: { sourceId: 'rb-2', account: { code: '1000' } } }))!;
      await expect(recon.match(other.lines[0].id, entry.id, a.scope, 'u1')).rejects.toThrow(/amounts differ/);
      await expect(recon.create({ accountLabel: 'x', periodStart: day, periodEnd: day, openingBalance: 0, closingBalance: 1, lines: [{ date: '2000-01-01', description: 'old', amount: 1 }] }, a.scope)).rejects.toThrow(/outside the statement period/);
    });
    it('keeps one cooperative from matching or seeing another’s cash book', async () => {
      const a = await fresh('ReconIsoA');
      const b = await fresh('ReconIsoB');
      const day = localDate(new Date());
      await post('iso-1', 60, a.id);
      const st = await recon.create({ accountLabel: 'NMB', periodStart: day, periodEnd: day, openingBalance: 0, closingBalance: 60, lines: [{ date: day, description: 'In', amount: 60 }] }, b.scope, 'u1');
      expect(st.unmatchedLines).toBe(1); // A's cash entry is not offered to B
      await expect(recon.detail(st.id, a.scope)).rejects.toThrow(/not found/);
    });
  });

  describe('everyday expenses and income', () => {
    const balances = async (scope: LedgerScope) => Object.fromEntries(((await svc.trialBalance(scope)) as any).lines.map((l: any) => [l.code, l.debitBalance - l.creditBalance]));
    const day = () => localDate(new Date());

    it('books an expense as cost against cash, numbers it, and lists it', async () => {
      const a = await fresh('Exp');
      const r = await cash.create({ kind: 'EXPENSE', date: day(), amount: 25_000, accountCode: '5600', party: 'Shell Mbarali', method: 'MOBILE_MONEY', note: 'Fuel for the tractor' }, a.scope, 'u1');
      expect(r.number).toMatch(/^EXP-\d{4}-000001$/);
      expect(await balances(a.scope)).toMatchObject({ '5600': 25_000, '1000': -25_000 });
      const second = await cash.create({ kind: 'EXPENSE', date: day(), amount: 5_000, accountCode: '5610' }, a.scope, 'u1');
      expect(second.number).toMatch(/000002$/);
      const list = await cash.list(a.scope, { kind: 'EXPENSE' });
      expect(list).toMatchObject({ count: 2, total: 30_000 });
      expect(list.items[0].category).toBeTruthy();
      expect((await svc.trialBalance(a.scope) as any).balanced).toBe(true);
    });
    it('books income as cash in against the chosen income account', async () => {
      const a = await fresh('Inc');
      const r = await cash.create({ kind: 'INCOME', date: day(), amount: 400_000, accountCode: '4400', party: 'Donor', reference: 'GRANT-7' }, a.scope, 'u1');
      expect(r.number).toMatch(/^INC-\d{4}-000001$/);
      expect(await balances(a.scope)).toMatchObject({ '1000': 400_000, '4400': -400_000 });
    });
    it('splits out VAT only for a VAT-registered cooperative and only when the amount includes it', async () => {
      const plain = await fresh('NoVatExp');
      await cash.create({ kind: 'EXPENSE', date: day(), amount: 118, accountCode: '5620', includesVat: true }, plain.scope, 'u1');
      expect(await balances(plain.scope)).toMatchObject({ '5620': 118 });
      const a = await fresh('VatExp', { vatRegistered: true, vatRate: 18, vrn: 'V-1' });
      await cash.create({ kind: 'EXPENSE', date: day(), amount: 118, accountCode: '5620', includesVat: true }, a.scope, 'u1');
      await cash.create({ kind: 'EXPENSE', date: day(), amount: 50, accountCode: '5620' }, a.scope, 'u1'); // no VAT claimed
      await cash.create({ kind: 'INCOME', date: day(), amount: 236, accountCode: '4410', includesVat: true }, a.scope, 'u1');
      expect(await balances(a.scope)).toMatchObject({ '5620': 150, '1400': 18, '2400': -36, '4410': -200, '1000': 236 - 118 - 50 });
      expect((await svc.trialBalance(a.scope) as any).balanced).toBe(true);
    });
    it('refuses what would be wrong or confusing', async () => {
      const a = await fresh('ExpBad');
      const base = { kind: 'EXPENSE' as const, date: day(), amount: 10, accountCode: '5600' };
      await expect(cash.create({ ...base, amount: 0 }, a.scope)).rejects.toBeInstanceOf(BadRequestException);
      await expect(cash.create({ ...base, amount: -5 }, a.scope)).rejects.toBeInstanceOf(BadRequestException);
      await expect(cash.create({ ...base, date: localDate(new Date(Date.now() + 3 * 86_400_000)) }, a.scope)).rejects.toThrow(/future/);
      await expect(cash.create({ ...base, accountCode: '5500' }, a.scope)).rejects.toThrow(/category/); // salaries are paid through Payroll
      await expect(cash.create({ ...base, accountCode: '4400' }, a.scope)).rejects.toThrow(/category/); // an income account for an expense
      await expect(cash.create({ ...base, kind: 'INCOME' }, a.scope)).rejects.toThrow(/category/);
      await expect(cash.create(base, {})).rejects.toThrow(/cooperative/);
      expect((await cash.list(a.scope)).count).toBe(0);
      expect(await prisma.ledgerEntry.count({ where: { mamcosId: a.id } })).toBe(0);
    });
    it('cancels a record by offsetting it, once, with a reason, and only for its own cooperative', async () => {
      const a = await fresh('ExpVoid');
      const other = await fresh('ExpVoidOther');
      const r = await cash.create({ kind: 'EXPENSE', date: day(), amount: 9_000, accountCode: '5690' }, a.scope, 'u1');
      await expect(cash.voidOne(r.id, 'x', a.scope)).rejects.toBeInstanceOf(BadRequestException);
      await expect(cash.voidOne(r.id, 'Entered twice by mistake', other.scope)).rejects.toThrow(/not found/);
      const voided = await cash.voidOne(r.id, 'Entered twice by mistake', a.scope, 'u2');
      expect(voided).toMatchObject({ status: 'VOID', voidReason: 'Entered twice by mistake' });
      expect(await balances(a.scope)).toMatchObject({ '5690': 0, '1000': 0 });
      await expect(cash.voidOne(r.id, 'Entered twice by mistake', a.scope)).rejects.toBeInstanceOf(ConflictException);
      const list = await cash.list(a.scope);
      expect(list).toMatchObject({ count: 0, total: 0 });
      expect(list.items[0].status).toBe('VOID');
      expect(await prisma.ledgerEntry.count({ where: { sourceType: 'Expense', sourceId: r.id } })).toBe(4); // original + mirror
    });
    it('keeps each cooperative’s records to itself', async () => {
      const a = await fresh('ExpIsoA');
      const b = await fresh('ExpIsoB');
      await cash.create({ kind: 'EXPENSE', date: day(), amount: 1_000, accountCode: '5600' }, a.scope, 'u1');
      expect((await cash.list(b.scope)).items).toHaveLength(0);
      expect(await balances(b.scope)).toMatchObject({});
    });
    it('dates the books on the first open day when the expense belongs to a closed month, but keeps its own date', async () => {
      const a = await fresh('ExpClosed');
      const { end, midDay } = lastMonth();
      await post('exp-closed-seed', 10, a.id, new Date(`${midDay}T09:00:00Z`));
      await periods.close(end, a.scope, 'u1');
      const r = await cash.create({ kind: 'EXPENSE', date: midDay, amount: 700, accountCode: '5610' }, a.scope, 'u1');
      expect(r.transactionDate.toISOString().slice(0, 10)).toBe(midDay);
      const row = (await prisma.ledgerEntry.findFirst({ where: { sourceType: 'Expense', sourceId: r.id } }))!;
      expect(localDate(row.entryDate) > end).toBe(true);
      expect(row.description).toContain('closed');
    });
    it('lists only the categories a person should pick', async () => {
      const exp = (await cash.categories('EXPENSE')).map((c) => c.code);
      const inc = (await cash.categories('INCOME')).map((c) => c.code);
      expect(exp).toEqual(expect.arrayContaining(['5600', '5610', '5620', '5690']));
      expect(exp).not.toContain('5500');
      expect(inc).toEqual(expect.arrayContaining(['4400', '4410', '4490']));
      expect(inc).not.toContain('4000');
    });
  });
});
