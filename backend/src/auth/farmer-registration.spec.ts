import { BadRequestException, ForbiddenException, ValidationPipe } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { AuthService } from './auth.service';
import { FarmerSelfRegisterDto } from './dto/auth.dto';

const dto = { phone: '+255700000002', password: 'SecurePass123!', firstName: 'Test', lastName: 'Farmer', dataShareConsent: false };

function setup() {
  const user = { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn().mockImplementation(async ({ data }) => ({ id: 'user-1', ...data })) };
  const farmer = { findFirst: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([]), create: jest.fn().mockResolvedValue({}) };
  const prisma = {
    role: { findMany: jest.fn(), findUnique: jest.fn() },
    user, farmer, $transaction: jest.fn(async (fn) => fn({ user, farmer })),
  };
  const service = new AuthService(prisma as any, {} as any, { get: jest.fn() } as any);
  const tokens = jest.spyOn(service as any, 'generateTokens').mockResolvedValue({ accessToken: 'access', refreshToken: 'refresh' });
  return { service, prisma, tokens };
}

describe('Farmer mobile self-registration', () => {
  it('creates a plain farmer account with a profile and session, and no role', async () => {
    const { service, prisma, tokens } = setup();
    await expect(service.selfRegisterFarmer(dto)).resolves.toEqual({ accessToken: 'access', refreshToken: 'refresh' });
    const data = prisma.user.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ role: UserRole.FARMER, phone: dto.phone });
    expect(data).not.toHaveProperty('roleId');
    expect(prisma.farmer.create).toHaveBeenCalledWith({ data: expect.objectContaining({ userId: 'user-1', controlNumber: 'MYD-00001', dataShareConsent: false, consentedAt: null }) });
    expect(tokens).toHaveBeenCalledWith(expect.objectContaining({ customRole: null }), 'MYD-00001');
  });

  it('never looks up or depends on a Farmer role', async () => {
    const { service, prisma } = setup();
    await service.selfRegisterFarmer(dto);
    expect(prisma.role.findMany).not.toHaveBeenCalled();
    expect(prisma.role.findUnique).not.toHaveBeenCalled();
  });

  it('registers a code-verified farmer the same way', async () => {
    const { service, prisma } = setup();
    const { password, ...verified } = dto;
    await service.registerVerifiedFarmer(verified);
    expect(prisma.user.create.mock.calls[0][0].data).toMatchObject({ role: UserRole.FARMER });
    expect(prisma.user.create.mock.calls[0][0].data).not.toHaveProperty('roleId');
  });

  it('rejects duplicate accounts', async () => {
    const { service, prisma } = setup();
    prisma.user.findFirst.mockResolvedValue({ id: 'existing' });
    await expect(service.selfRegisterFarmer(dto)).rejects.toThrow('already exists');
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('keeps administrative registration restricted to Super Admin', async () => {
    const { service } = setup();
    await expect(service.register({ ...dto }, UserRole.FARMER)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('accepts form data but rejects client-selected roles through HTTP validation', async () => {
    const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
    const metadata = { type: 'body' as const, metatype: FarmerSelfRegisterDto };
    await expect(pipe.transform(dto, metadata)).resolves.toMatchObject(dto);
    for (const extra of [{ role: UserRole.SUPER_ADMIN }, { roleId: 'privileged-role' }]) {
      await expect(pipe.transform({ ...dto, ...extra }, metadata)).rejects.toBeInstanceOf(BadRequestException);
    }
  });
});
