import { ForbiddenException } from '@nestjs/common';
import {
  CREDIT_PROFILE_SCHEMA,
  PartnerApiService,
} from './partner-api.service';

describe('PartnerApiService', () => {
  const prisma = {
    partnerApiRequest: { create: jest.fn(), count: jest.fn() },
    partnerApiKey: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
  } as any;
  const farmers = { getFormalFinancialProfile: jest.fn() } as any;
  const service = new PartnerApiService(prisma, farmers);

  beforeEach(() => jest.clearAllMocks());

  it('returns a versioned consented credit profile and records the external request', async () => {
    farmers.getFormalFinancialProfile.mockResolvedValue({
      farmer: { id: 'farmer-1', controlNumber: 'MYD-00001' },
      credit: { creditScore: 72, creditReady: true },
      consent: { financialProviderSharing: true },
    });
    const result = await service.creditProfile('key-1', 'farmer-1', '127.0.0.1');
    expect(result.schema).toBe(CREDIT_PROFILE_SCHEMA);
    expect(result.partnerAccess).toEqual({ apiKeyId: 'key-1', audited: true });
    expect(result.credit.creditReady).toBe(true);
    expect(prisma.partnerApiRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          apiKeyId: 'key-1',
          farmerId: 'farmer-1',
          responseCode: 200,
        }),
      }),
    );
  });

  it('records denied consent access before rethrowing the refusal', async () => {
    farmers.getFormalFinancialProfile.mockRejectedValue(
      new ForbiddenException('This farmer has not consented'),
    );
    await expect(service.creditProfile('key-1', 'farmer-1')).rejects.toThrow(
      'not consented',
    );
    expect(prisma.partnerApiRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ responseCode: 403 }),
      }),
    );
  });
});
