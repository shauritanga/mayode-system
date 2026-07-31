import { ConflictException } from '@nestjs/common';
import { SalesService } from './sales.service';

describe('SalesService buyer collection', () => {
  const prisma = { sale: { findUnique: jest.fn(), update: jest.fn() } } as any;
  const clickPesa = { isConfigured: jest.fn(), initiateUssdPush: jest.fn(), queryPayment: jest.fn() } as any;
  const service = new SalesService(prisma, {} as any, {} as any, {} as any, clickPesa);
  beforeEach(() => jest.clearAllMocks());

  it('initiates a buyer collection and saves its order reference', async () => {
    prisma.sale.findUnique.mockResolvedValue({ id: 'abc12345-sale', paymentReceived: false, totalRevenue: 100000, fairtradePremium: 5000, buyer: { contactPhone: '0712345678' } });
    prisma.sale.update.mockResolvedValue({ id: 'abc12345-sale', buyerOrderReference: 'SALE-abc12345-1' });
    clickPesa.isConfigured.mockReturnValue(true);
    clickPesa.initiateUssdPush.mockResolvedValue({ id: 'cp-1' });
    const now = jest.spyOn(Date, 'now').mockReturnValue(1);
    await service.collectBuyerPayment('abc12345-sale');
    expect(clickPesa.initiateUssdPush).toHaveBeenCalledWith(expect.objectContaining({ amount: '105000', orderReference: 'SALE-abc12345-1', phoneNumber: '0712345678' }));
    expect(prisma.sale.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ buyerPaymentReference: 'cp-1' }) }));
    now.mockRestore();
  });

  it('settles once when ClickPesa confirms success', async () => {
    prisma.sale.findUnique.mockResolvedValue({ id: 'sale-1', paymentReceived: false });
    clickPesa.queryPayment.mockResolvedValue({ status: 'SUCCESS' });
    const settle = jest.spyOn(service, 'settle').mockResolvedValue({ id: 'sale-1' } as any);
    await service.reconcileBuyerPayment('SALE-1');
    expect(settle).toHaveBeenCalledWith('sale-1', expect.any(String));
  });

  it('refuses collection when ClickPesa is not configured', async () => {
    clickPesa.isConfigured.mockReturnValue(false);
    await expect(service.collectBuyerPayment('sale-1')).rejects.toBeInstanceOf(ConflictException);
  });
});
