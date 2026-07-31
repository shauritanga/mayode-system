import { ForbiddenException } from '@nestjs/common';
import { PartnerApiService } from './partner-api.service';

describe('PartnerApiService', () => {
  const prisma = { partnerApiRequest: { create: jest.fn() } } as any;
  const farmers = { getCreditReadiness: jest.fn() } as any;
  const service = new PartnerApiService(prisma, farmers);
  beforeEach(() => jest.clearAllMocks());

  it('returns a consented credit profile and records the external request', async () => {
    farmers.getCreditReadiness.mockResolvedValue({ farmerId: 'farmer-1', creditReady: true });
    await expect(service.creditProfile('key-1', 'farmer-1', '127.0.0.1')).resolves.toEqual({ farmerId: 'farmer-1', creditReady: true });
    expect(prisma.partnerApiRequest.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ apiKeyId: 'key-1', farmerId: 'farmer-1', responseCode: 200 }) }));
  });

  it('records denied consent access before rethrowing the refusal', async () => {
    farmers.getCreditReadiness.mockRejectedValue(new ForbiddenException('This farmer has not consented'));
    await expect(service.creditProfile('key-1', 'farmer-1')).rejects.toThrow('not consented');
    expect(prisma.partnerApiRequest.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ responseCode: 403 }) }));
  });
});
