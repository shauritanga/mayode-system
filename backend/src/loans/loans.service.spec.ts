import { LoansService } from './loans.service';

describe('LoansService payout approval', () => {
  const prisma = {
    sale: { findUnique: jest.fn() },
    payment: {
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      findMany: jest.fn(),
    },
    loanDeduction: { update: jest.fn() },
  } as any;
  const clickPesa = {
    isConfigured: jest.fn(),
    initiateMobilePayout: jest.fn(),
    queryPayoutStatus: jest.fn(),
  } as any;
  const sms = { sendPaymentBreakdown: jest.fn() } as any;
  const accounting = { postToLedger: jest.fn() } as any;
  const service = new LoansService(prisma, clickPesa, sms, accounting);

  beforeEach(() => jest.clearAllMocks());

  it('records approval attribution and creates a typed loan-repayment payment before payout tracking', async () => {
    clickPesa.isConfigured.mockReturnValue(true);
    clickPesa.initiateMobilePayout.mockResolvedValue({ id: 'payout-1' });
    prisma.sale.findUnique.mockResolvedValue({
      id: 'sale-1',
      invoiceNumber: 'INV-1',
      paymentReceived: true,
      payments: [
        {
          id: 'rice-1',
          farmerId: 'farmer-1',
          amount: 100000,
          netAmount: 80000,
          loanDeduction: 20000,
          paymentType: 'RICE_PURCHASE',
          status: 'CLEARED',
          farmer: {
            firstName: 'Asha',
            lastName: 'Mushi',
            user: { phone: '+255700000001' },
          },
          loanDeductions: [
            {
              id: 'deduction-1',
              amount: 20000,
              payoutStatus: 'PENDING',
              loanRecord: {
                id: 'loan-1',
                lenderName: 'Lender',
                lenderPayoutPhone: '+255700000009',
              },
            },
          ],
        },
      ],
    });

    await service.approveAndInitiateSalePayouts('sale-1', 'admin-1');

    expect(prisma.loanDeduction.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          payoutApprovedByUserId: 'admin-1',
          payoutApprovedAt: expect.any(Date),
        }),
      }),
    );
    expect(prisma.payment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          paymentType: 'LOAN_REPAYMENT',
          amount: 20000,
          payoutApprovedByUserId: 'admin-1',
        }),
      }),
    );
    expect(prisma.payment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          payoutApprovedByUserId: 'admin-1',
          payoutApprovedAt: expect.any(Date),
        }),
      }),
    );
    expect(sms.sendPaymentBreakdown).toHaveBeenCalledWith(
      expect.objectContaining({
        grossAmount: 100000,
        loanDeduction: 20000,
        netAmount: 80000,
      }),
    );
  });
});
