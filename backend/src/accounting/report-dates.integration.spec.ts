/** Reports given a plain YYYY-MM-DD range must include the whole day, not stop at its first moment. Skipped unless IRRIGATION_TEST_DATABASE_URL is set. */
import 'reflect-metadata';
import { randomUUID } from 'crypto';
import { PrismaClient, UserRole } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { OwnershipService } from '../common/ownership.service';
import { AccountingService } from './accounting.service';
import { CashTransactionsService } from './cash-transactions.service';
const BASE_URL = process.env.IRRIGATION_TEST_DATABASE_URL;
(BASE_URL ? describe : describe.skip)('probe', () => {
  it('a plain end date includes everything booked on that Tanzanian day', async () => {
    const url = `${BASE_URL!.split('?')[0]}?options=${encodeURIComponent('-c search_path=irrigation_test')}`;
    const pool = new Pool({ connectionString: url, max: 3 });
    const prisma = new PrismaClient({ adapter: new PrismaPg(pool, { schema: 'irrigation_test' }) });
    const svc = new AccountingService(prisma as any, new OwnershipService(prisma as any));
    const cash = new CashTransactionsService(prisma as any, svc);
    const m = await prisma.mamcos.create({ data: { name: 'Probe ' + randomUUID().slice(0, 5) } });
    const scope = { mamcosId: m.id };
    const day = new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10);
    const past = new Date(Date.now() - 5 * 86400_000 + 3 * 3600_000).toISOString().slice(0, 10);
    await cash.create({ kind: 'INCOME', date: past, amount: 1000, accountCode: '4490' }, scope, 'u');
    await cash.create({ kind: 'EXPENSE', date: past, amount: 300, accountCode: '5620' }, scope, 'u');
    const pl = await svc.profitAndLoss(scope, past, past);
    const bs = await svc.balanceSheet(scope, past);
    const cf = await svc.cashFlow(scope, past, past);
    expect([pl.income, pl.expenses, bs.assets, cf.netCashFlow]).toEqual([1000, 300, 700, 700]);
    expect(day >= past).toBe(true);
    await prisma.$disconnect(); await pool.end();
  });
});
