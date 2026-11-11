/** Expense approval above a limit, receipts, details edits and corrections, against the throw-away `irrigation_test` schema. Skipped unless IRRIGATION_TEST_DATABASE_URL is set. */
import 'reflect-metadata';
import { randomUUID } from 'crypto';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { OwnershipService } from '../common/ownership.service';
import { AccountingService } from './accounting.service';
import { CashTransactionsService } from './cash-transactions.service';

const BASE_URL = process.env.IRRIGATION_TEST_DATABASE_URL;
(BASE_URL ? describe : describe.skip)('Expense controls (PostgreSQL)', () => {
  jest.setTimeout(120_000);
  let pool: Pool; let prisma: PrismaClient; let svc: AccountingService; let cash: CashTransactionsService;
  const day = () => new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10);
  const fresh = async () => {
    const m = await prisma.mamcos.create({ data: { name: `Ctl ${randomUUID().slice(0, 6)}` } });
    return { id: m.id, scope: { mamcosId: m.id } };
  };
  const spent = async (id: string) => (await svc.profitAndLoss({ mamcosId: id })).expenses;

  beforeAll(() => {
    const url = `${BASE_URL!.split('?')[0]}?options=${encodeURIComponent('-c search_path=irrigation_test')}`;
    pool = new Pool({ connectionString: url, max: 4 });
    prisma = new PrismaClient({ adapter: new PrismaPg(pool, { schema: 'irrigation_test' }) });
    svc = new AccountingService(prisma as any, new OwnershipService(prisma as any));
    cash = new CashTransactionsService(prisma as any, svc);
  });
  afterAll(async () => { await prisma.$disconnect(); await pool.end(); });

  it('holds an expense at or above the limit until a different person approves it, and books nothing before then', async () => {
    const a = await fresh();
    await cash.saveSettings(a.scope, { approvalThreshold: 100_000 });
    expect(await cash.settings(a.scope)).toEqual({ approvalThreshold: 100_000 });
    const small = await cash.create({ kind: 'EXPENSE', date: day(), amount: 99_999, accountCode: '5600' }, a.scope, 'maker');
    expect(small.status).toBe('POSTED');
    const big = await cash.create({ kind: 'EXPENSE', date: day(), amount: 100_000, accountCode: '5620', attachments: ['/uploads/receipt-1.jpg'] }, a.scope, 'maker');
    expect(big.status).toBe('PENDING_APPROVAL');
    expect(big.attachments).toEqual(['/uploads/receipt-1.jpg']);
    expect(await spent(a.id)).toBe(99_999);
    expect((await cash.list(a.scope)).pending).toBe(1);
    await expect(cash.approve(big.id, a.scope, 'maker')).rejects.toThrow(/Another person/);
    const done = await cash.approve(big.id, a.scope, 'checker');
    expect(done.status).toBe('POSTED');
    expect(done.approvedById).toBe('checker');
    expect(await spent(a.id)).toBe(199_999);
    await expect(cash.approve(big.id, a.scope, 'checker')).rejects.toBeInstanceOf(ConflictException);
  });

  it('income and small expenses never wait, and approval can be switched off', async () => {
    const a = await fresh();
    await cash.saveSettings(a.scope, { approvalThreshold: 50 });
    expect((await cash.create({ kind: 'INCOME', date: day(), amount: 1_000_000, accountCode: '4400' }, a.scope, 'u')).status).toBe('POSTED');
    await cash.saveSettings(a.scope, { approvalThreshold: null });
    expect((await cash.create({ kind: 'EXPENSE', date: day(), amount: 1_000_000, accountCode: '5600' }, a.scope, 'u')).status).toBe('POSTED');
  });

  it('a rejected or cancelled pending expense never reaches the books', async () => {
    const a = await fresh();
    await cash.saveSettings(a.scope, { approvalThreshold: 1_000 });
    const one = await cash.create({ kind: 'EXPENSE', date: day(), amount: 5_000, accountCode: '5600' }, a.scope, 'm');
    await expect(cash.reject(one.id, 'no', a.scope, 'c')).rejects.toBeInstanceOf(BadRequestException);
    const rejected = await cash.reject(one.id, 'Not a cooperative cost', a.scope, 'c');
    expect(rejected.status).toBe('REJECTED');
    const two = await cash.create({ kind: 'EXPENSE', date: day(), amount: 6_000, accountCode: '5600' }, a.scope, 'm');
    expect((await cash.voidOne(two.id, 'Entered by mistake', a.scope, 'm')).status).toBe('VOID');
    expect(await spent(a.id)).toBe(0);
    expect(await prisma.ledgerEntry.count({ where: { mamcosId: a.id } })).toBe(0);
  });

  it('edits who, reference, note and receipts without touching the books', async () => {
    const a = await fresh();
    const r = await cash.create({ kind: 'EXPENSE', date: day(), amount: 4_000, accountCode: '5600' }, a.scope, 'u');
    const before = await prisma.ledgerEntry.count({ where: { mamcosId: a.id } });
    const u = await cash.update(r.id, { party: 'Shell Mbarali', reference: 'RCPT-9', note: 'Fuel', attachments: ['/uploads/r.jpg'] }, a.scope);
    expect([u.party, u.reference, u.note, u.attachments]).toEqual(['Shell Mbarali', 'RCPT-9', 'Fuel', ['/uploads/r.jpg']]);
    expect(await prisma.ledgerEntry.count({ where: { mamcosId: a.id } })).toBe(before);
  });

  it('corrects the amount by cancelling the old record and booking a new one together, linked', async () => {
    const a = await fresh();
    const r = await cash.create({ kind: 'EXPENSE', date: day(), amount: 4_000, accountCode: '5600' }, a.scope, 'u');
    const fixed = await cash.correct(r.id, { kind: 'EXPENSE', date: day(), amount: 4_500, accountCode: '5600', reason: 'Wrong amount typed' }, a.scope, 'u');
    expect(fixed.replacesId).toBe(r.id);
    expect(await spent(a.id)).toBe(4_500);
    expect((await prisma.cashTransaction.findUniqueOrThrow({ where: { id: r.id } })).status).toBe('VOID');
    // a correction that fails leaves the original untouched
    const keep = await cash.create({ kind: 'EXPENSE', date: day(), amount: 700, accountCode: '5600' }, a.scope, 'u');
    await expect(cash.correct(keep.id, { kind: 'EXPENSE', date: day(), amount: 0, accountCode: '5600', reason: 'bad' }, a.scope, 'u')).rejects.toBeInstanceOf(BadRequestException);
    expect((await prisma.cashTransaction.findUniqueOrThrow({ where: { id: keep.id } })).status).toBe('POSTED');
    await expect(cash.correct(keep.id, { kind: 'INCOME', date: day(), amount: 5, accountCode: '4400', reason: 'switch' }, a.scope, 'u')).rejects.toThrow(/same kind/);
  });
});
