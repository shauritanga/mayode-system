import { AccountingService } from './accounting.service';
import { calculateFinancialRatios } from './ratios';
describe('AccountingService', () => {
  it('rejects an unbalanced double-entry posting before touching the database', async () => {
    const service = new AccountingService({} as any, {} as any);
    await expect(
      service.postToLedger('Test', 'id', new Date(), 'bad', [
        { code: '1000', debit: 100 },
        { code: '4000', credit: 99 },
      ], null),
    ).rejects.toThrow('must balance');
  });
  it('rejects manual journal lines that carry both a debit and a credit, or neither', async () => {
    const service = new AccountingService({} as any, {} as any);
    await expect(service.createJournalEntry({
      entryDate: '2026-10-27',
      description: 'Adjustment',
      lines: [
        { accountId: 'cash', debit: 50, credit: 50 },
        { accountId: 'equity', credit: 50 },
      ],
    } as any, {})).rejects.toThrow('either a debit or a credit');
  });
  describe('postToLedger writes only what changed', () => {
    const accounts = [{ id: 'cash', code: '1000' }, { id: 'income', code: '4000' }];
    const setup = (existing: any[]) => {
      const created: any[] = [];
      const tx = {
        $executeRaw: jest.fn(),
        $queryRaw: jest.fn().mockResolvedValue([{ last_value: 7 }]),
        ledgerEntry: { findMany: jest.fn().mockResolvedValue(existing), create: jest.fn(async ({ data }: any) => { created.push(data); return data; }) },
        accountingLock: { findUnique: jest.fn().mockResolvedValue(null) },
      };
      const prisma = {
        account: { upsert: jest.fn(), findMany: jest.fn().mockResolvedValue(accounts) },
        $transaction: jest.fn(async (fn: any) => fn(tx)),
      } as any;
      return { service: new AccountingService(prisma, {} as any), created, tx };
    };
    const sale = (service: AccountingService, amount = 100) =>
      service.postToLedger('Sale', 'sale-1', new Date('2026-01-01'), 'sale', [{ code: '1000', debit: amount }, { code: '4000', credit: amount }], 'coop-1');
    it('books the first posting as revision 1 with a sequential number', async () => {
      const { service, created } = setup([]);
      await sale(service);
      expect(created).toHaveLength(2);
      expect(created.every((r) => r.revision === 1 && r.entryNumber === 'GL-2026-000007' && r.mamcosId === 'coop-1')).toBe(true);
      expect(new Set(created.map((r) => r.journalId)).size).toBe(1);
    });
    it('does nothing when the same posting is repeated', async () => {
      const { service, created } = setup([
        { accountId: 'cash', debit: 100, credit: 0, revision: 1 }, { accountId: 'income', debit: 0, credit: 100, revision: 1 },
      ]);
      expect(await sale(service)).toEqual([]);
      expect(created).toHaveLength(0);
    });
    it('books only the difference, as a new revision, when the amount changes', async () => {
      const { service, created } = setup([
        { accountId: 'cash', debit: 100, credit: 0, revision: 1 }, { accountId: 'income', debit: 0, credit: 100, revision: 1 },
      ]);
      await sale(service, 130);
      expect(created).toEqual([
        expect.objectContaining({ accountId: 'cash', debit: 30, credit: 0, revision: 2 }),
        expect.objectContaining({ accountId: 'income', debit: 0, credit: 30, revision: 2 }),
      ]);
    });
    it('cancels a source by posting its mirror image when no lines remain', async () => {
      const { service, created } = setup([
        { accountId: 'cash', debit: 100, credit: 0, revision: 1 }, { accountId: 'income', debit: 0, credit: 100, revision: 1 },
      ]);
      await service.postToLedger('Sale', 'sale-1', new Date('2026-01-01'), 'void', [], 'coop-1');
      expect(created).toEqual([
        expect.objectContaining({ accountId: 'cash', debit: 0, credit: 100, revision: 2 }),
        expect.objectContaining({ accountId: 'income', debit: 100, credit: 0, revision: 2 }),
      ]);
    });
    it('dates a posting on the first open day when its own day is in a closed period', async () => {
      const { service, created, tx } = setup([]);
      tx.accountingLock.findUnique.mockResolvedValue({ closedThrough: new Date('2026-01-31T00:00:00Z') });
      await sale(service);
      expect(created[0].entryDate.toISOString()).toBe('2026-02-01T09:00:00.000Z');
      expect(created[0].description).toContain('that period is closed');
    });
  });
  it('calculates liquidity, profitability and solvency as pure ratios', () => {
    expect(
      calculateFinancialRatios({
        assets: 200,
        liabilities: 100,
        cash: 150,
        income: 500,
        netProfit: 75,
      }),
    ).toEqual({
      liquidity: { currentRatio: 2, quickRatio: 1.5 },
      profitability: { netProfitMargin: 0.15, returnOnAssets: 0.375 },
      solvency: { debtToEquityRatio: 1 },
    });
  });
  it('includes accumulated earnings in equity and checks the balance sheet equation', async () => {
    const prisma = {
      ledgerEntry: {
        findMany: jest.fn().mockResolvedValue([
          { accountId: 'cash', debit: 1000, credit: 0, account: { code: '1000', name: 'Cash', type: 'ASSET' } },
          { accountId: 'payable', debit: 0, credit: 400, account: { code: '2100', name: 'Payables', type: 'LIABILITY' } },
          { accountId: 'capital', debit: 0, credit: 500, account: { code: '3000', name: 'Capital', type: 'EQUITY' } },
          { accountId: 'income', debit: 0, credit: 200, account: { code: '4000', name: 'Income', type: 'INCOME' } },
          { accountId: 'expense', debit: 100, credit: 0, account: { code: '5000', name: 'Expenses', type: 'EXPENSE' } },
        ]),
      },
    } as any;
    const service = new AccountingService(prisma, {} as any);
    jest.spyOn(service as any, 'accounts').mockResolvedValue([]);
    const result = await service.balanceSheet({}, '2026-12-31');
    expect(result.assets).toBe(1000);
    expect(result.retainedEarnings).toBe(100);
    expect(result.totalEquity).toBe(600);
    expect(result.balanceCheck).toBe(0);
  });
  it('reports opening and closing cash and classifies operating, investing and financing activity', async () => {
    const prisma = {
      ledgerEntry: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'opening', entryDate: new Date('2026-01-15T00:00:00Z'), debit: 100, credit: 0, sourceType: 'SaleSettlement', account: { code: '1000' } },
          { id: 'operating', entryDate: new Date('2026-02-02T00:00:00Z'), debit: 50, credit: 0, sourceType: 'MembershipPayment', account: { code: '1000' } },
          { id: 'investing', entryDate: new Date('2026-02-03T00:00:00Z'), debit: 0, credit: 15, sourceType: 'AssetPurchase', account: { code: '1000' } },
          { id: 'financing', entryDate: new Date('2026-02-04T00:00:00Z'), debit: 0, credit: 10, sourceType: 'LenderRemittance', account: { code: '1000' } },
        ]),
      },
    } as any;
    const result = await new AccountingService(prisma, {} as any).cashFlow({}, '2026-02-01', '2026-02-28');
    expect(result.openingCashBalance).toBe(100);
    expect(result.operating.netCashFlow).toBe(50);
    expect(result.investing.netCashFlow).toBe(-15);
    expect(result.financing.netCashFlow).toBe(-10);
    expect(result.netCashFlow).toBe(25);
    expect(result.closingCashBalance).toBe(125);
  });
  it('calculates a cumulative trial balance as of the selected date, including zero balance accounts', async () => {
    const prisma = {
      account: { findMany: jest.fn().mockResolvedValue([
        { id: 'cash', code: '1000', name: 'Cash', type: 'ASSET' },
        { id: 'capital', code: '3000', name: 'Capital', type: 'EQUITY' },
        { id: 'expense', code: '5000', name: 'Expense', type: 'EXPENSE' },
      ]) },
      ledgerEntry: { findMany: jest.fn().mockResolvedValue([
        { accountId: 'cash', debit: 1000, credit: 250, account: { code: '1000', name: 'Cash', type: 'ASSET' } },
        { accountId: 'capital', debit: 0, credit: 750, account: { code: '3000', name: 'Capital', type: 'EQUITY' } },
      ]) },
    } as any;
    const service = new AccountingService(prisma, {} as any);
    jest.spyOn(service as any, 'accounts').mockResolvedValue([]);
    const result = await service.trialBalance({}, undefined, '2026-12-31');
    expect(prisma.ledgerEntry.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { entryDate: { lte: new Date('2026-12-31T23:59:59.999+03:00') } },
    }));
    expect(result.lines).toEqual([
      expect.objectContaining({ code: '1000', debitBalance: 750, creditBalance: 0 }),
      expect.objectContaining({ code: '3000', debitBalance: 0, creditBalance: 750 }),
      expect.objectContaining({ code: '5000', debitBalance: 0, creditBalance: 0 }),
    ]);
    expect(result.totalDebit).toBe(750);
    expect(result.totalCredit).toBe(750);
    expect(result.balanced).toBe(true);
  });
  it('returns searchable account balance data with cumulative activity and normal side', async () => {
    const prisma = {
      account: { findMany: jest.fn().mockResolvedValue([
        { id: 'cash', code: '1000', name: 'Cash', type: 'ASSET' },
        { id: 'capital', code: '3000', name: 'Capital', type: 'EQUITY' },
      ]) },
      ledgerEntry: { findMany: jest.fn().mockResolvedValue([
        { accountId: 'cash', debit: 100, credit: 25 },
        { accountId: 'capital', debit: 0, credit: 75 },
      ]) },
    } as any;
    const service = new AccountingService(prisma, {} as any);
    jest.spyOn(service as any, 'accounts').mockResolvedValue([]);
    const result = await service.accountBalances({}, '2026-12-31');
    expect(result.accountCount).toBe(2);
    expect(result.balances).toEqual([
      expect.objectContaining({ code: '1000', debitActivity: 100, creditActivity: 25, balance: 75, balanceSide: 'DEBIT' }),
      expect.objectContaining({ code: '3000', debitActivity: 0, creditActivity: 75, balance: 75, balanceSide: 'CREDIT' }),
    ]);
  });
  it('scopes budgets to the requesting cooperative', async () => {
    const prisma = { budget: { findMany: jest.fn().mockResolvedValue([]) } } as any;
    const ownership = { resolveTenantMamcosId: jest.fn().mockReturnValue('coop-1') } as any;
    const service = new AccountingService(prisma, ownership);
    await service.findAllBudgets({ id: 'user-1', role: 'ADMIN', mamcosId: 'coop-1' } as any);
    expect(prisma.budget.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { mamcosId: 'coop-1' } }));
  });
  it('lists member contributions and eligible members within the cooperative scope', async () => {
    const prisma = {
      memberContribution: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'contribution-1', farmerId: 'farmer-1', farmer: { id: 'farmer-1', firstName: 'Asha', lastName: 'Mushi', controlNumber: 'MYD-1' }, amount: 100,
          },
        ]),
      },
      farmer: { findMany: jest.fn().mockResolvedValue([{ id: 'farmer-1' }]) },
    } as any;
    const ownership = { resolveTenantMamcosId: jest.fn().mockReturnValue('coop-1') } as any;
    const result = await new AccountingService(prisma, ownership).memberContributions({ id: 'user-1', role: 'ADMIN', mamcosId: 'coop-1' } as any);
    expect(prisma.memberContribution.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { mamcosId: 'coop-1' } }));
    expect(prisma.farmer.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { mamcosId: 'coop-1' } }));
    expect(result.totalContributions).toBe(100);
    expect(result.memberCount).toBe(1);
    expect(result.paymentCount).toBe(1);
    expect(result.contributions[0].amount).toBe(100);
  });
  it('records member contributions as cooperative equity with a balanced ledger posting', async () => {
    const contribution = { id: 'contribution-1', mamcosId: 'coop-1', amount: 250, contributionDate: new Date('2026-02-03'), description: 'Member share' };
    const prisma = {
      farmer: { findFirst: jest.fn().mockResolvedValue({ id: 'farmer-1', mamcosId: 'coop-1' }) },
      memberContribution: { create: jest.fn().mockResolvedValue(contribution) },
    } as any;
    const ownership = { resolveTenantMamcosId: jest.fn().mockReturnValue('coop-1') } as any;
    const service = new AccountingService(prisma, ownership);
    const post = jest.spyOn(service, 'postToLedger').mockResolvedValue([] as any);
    await service.createMemberContribution({ farmerId: 'farmer-1', amount: 250, contributionDate: '2026-02-03', description: 'Member share' }, { id: 'user-1', role: 'MAMCOS_SECRETARY', mamcosId: 'coop-1' } as any);
    expect(prisma.farmer.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'farmer-1', mamcosId: 'coop-1' } }));
    expect(post).toHaveBeenCalledWith('MemberContribution', 'contribution-1', expect.any(Date), 'Member share', [
      { code: '1000', debit: 250 }, { code: '3000', credit: 250 },
    ], 'coop-1');
  });
  it('records cooperative reserve appropriations as an equity-to-equity journal', async () => {
    const allocation = { id: 'reserve-1', mamcosId: 'coop-1', amount: 500, allocationDate: new Date('2026-03-01'), mamcos: { name: 'Coop One' } };
    const prisma = {
      mamcos: { findUnique: jest.fn().mockResolvedValue({ id: 'coop-1' }) },
      reserveAllocation: { create: jest.fn().mockResolvedValue(allocation) },
    } as any;
    const ownership = { resolveTenantMamcosId: jest.fn().mockReturnValue('coop-1') } as any;
    const service = new AccountingService(prisma, ownership);
    const post = jest.spyOn(service, 'postToLedger').mockResolvedValue([] as any);
    await service.createReserveAllocation({ amount: 500, allocationDate: '2026-03-01', description: 'General reserve' }, { id: 'user-1', role: 'MAMCOS_SECRETARY', mamcosId: 'coop-1' } as any);
    expect(prisma.reserveAllocation.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ mamcosId: 'coop-1', amount: 500 }) }));
    expect(post).toHaveBeenCalledWith('ReserveAllocation', 'reserve-1', expect.any(Date), 'General reserve', [
      { code: '3200', debit: 500 }, { code: '3100', credit: 500 },
    ], 'coop-1');
  });
  it('requires draft budgets to be approved and scopes the approval to the cooperative', async () => {
    const prisma = {
      budget: {
        findFirstOrThrow: jest.fn().mockResolvedValue({ id: 'budget-1', status: 'DRAFT' }),
        update: jest.fn().mockResolvedValue({ id: 'budget-1', status: 'APPROVED' }),
      },
    } as any;
    const ownership = { resolveTenantMamcosId: jest.fn().mockReturnValue('coop-1') } as any;
    const service = new AccountingService(prisma, ownership);
    await service.approveBudget('budget-1', { id: 'approver-1', role: 'MAMCOS_SECRETARY', mamcosId: 'coop-1' } as any);
    expect(prisma.budget.findFirstOrThrow).toHaveBeenCalledWith({ where: { id: 'budget-1', mamcosId: 'coop-1' }, select: { id: true, status: true } });
    expect(prisma.budget.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'budget-1' },
      data: expect.objectContaining({ status: 'APPROVED', approvedByUserId: 'approver-1' }),
    }));
  });
});
