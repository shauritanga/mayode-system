import { AccountingService } from './accounting.service';
import { calculateFinancialRatios } from './ratios';
describe('AccountingService', () => {
  it('rejects an unbalanced double-entry posting before touching the database', async () => {
    const service = new AccountingService({} as any);
    await expect(service.postToLedger('Test', 'id', new Date(), 'bad', [{ code: '1000', debit: 100 }, { code: '4000', credit: 99 }])).rejects.toThrow('must balance');
  });
  it('persists every balanced debit and credit line idempotently', async () => {
    const prisma = { account: { upsert: jest.fn(), findMany: jest.fn().mockResolvedValue([{ id: 'cash', code: '1000' }, { id: 'income', code: '4000' }]) }, ledgerEntry: { upsert: jest.fn() }, $transaction: jest.fn() } as any;
    const service = new AccountingService(prisma);
    await service.postToLedger('Sale', 'sale-1', new Date('2026-01-01'), 'sale', [{ code: '1000', debit: 100 }, { code: '4000', credit: 100 }]);
    expect(prisma.ledgerEntry.upsert).toHaveBeenCalledTimes(2);
    expect(prisma.$transaction).toHaveBeenCalled();
  });
  it('calculates liquidity, profitability and solvency as pure ratios', () => {
    expect(calculateFinancialRatios({ assets: 200, liabilities: 100, income: 500, netProfit: 75 })).toEqual({ liquidity: 2, profitability: 0.15, solvency: 0.5 });
  });
});
