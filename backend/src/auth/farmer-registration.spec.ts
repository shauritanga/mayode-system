import { BadRequestException, ForbiddenException, ValidationPipe } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { AuthService } from './auth.service';
import { FarmerSelfRegisterDto } from './dto/auth.dto';

const dto = { phone: '+255700000002', password: 'SecurePass123!', firstName: 'Test', lastName: 'Farmer', dataShareConsent: false };
const farmerRole = { id: 'farmer-role', isActive: true, isSystem: false, systemRole: UserRole.FARMER, permissions: [] };

function setup(roles = [farmerRole], configuredRoleId?: string) {
  const user = { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn().mockImplementation(async ({ data }) => ({ id: 'user-1', ...data })) };
  const farmer = { findFirst: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([]), create: jest.fn().mockResolvedValue({}) };
  const prisma = {
    role: { findMany: jest.fn().mockResolvedValue(roles), findUnique: jest.fn().mockResolvedValue(roles[0]) },
    user, farmer, $transaction: jest.fn(async (fn) => fn({ user, farmer })),
  };
  const config = { get: jest.fn((key) => key === 'FARMER_SELF_REGISTRATION_ROLE_ID' ? configuredRoleId : undefined) };
  const service = new AuthService(prisma as any, {} as any, config as any);
  const tokens = jest.spyOn(service as any, 'generateTokens').mockResolvedValue({ accessToken: 'access', refreshToken: 'refresh' });
  return { service, prisma, tokens };
}

describe('Farmer mobile self-registration', () => {
  it('creates a farmer with the server-selected role, profile and session', async () => {
    const { service, prisma, tokens } = setup();
    await expect(service.selfRegisterFarmer(dto)).resolves.toEqual({ accessToken: 'access', refreshToken: 'refresh' });
    expect(prisma.user.create).toHaveBeenCalledWith({ data: expect.objectContaining({ role: UserRole.FARMER, roleId: 'farmer-role', phone: dto.phone }) });
    expect(prisma.farmer.create).toHaveBeenCalledWith({ data: expect.objectContaining({ userId: 'user-1', controlNumber: 'MYD-00001', dataShareConsent: false, consentedAt: null }) });
    expect(tokens).toHaveBeenCalledWith(expect.objectContaining({ customRole: farmerRole }), 'MYD-00001');
  });

  it('filters configured roles to active custom Farmer profiles', async () => {
    const { service, prisma } = setup([farmerRole], 'farmer-role');
    await service.selfRegisterFarmer(dto);
    expect(prisma.role.findMany).toHaveBeenCalledWith({ where: { id: 'farmer-role', isActive: true, isSystem: false, systemRole: UserRole.FARMER }, take: 2 });
  });

  it.each([{ roles: [] }, { roles: [farmerRole, { ...farmerRole, id: 'another' }] }])('rejects missing or ambiguous configuration (%j)', async ({ roles }) => {
    const { service, prisma } = setup(roles);
    await expect(service.selfRegisterFarmer(dto)).rejects.toThrow('Farmer registration is not configured');
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('rejects a role deactivated between selection and creation', async () => {
    const { service, prisma } = setup();
    prisma.role.findUnique.mockResolvedValue({ ...farmerRole, isActive: false });
    await expect(service.selfRegisterFarmer(dto)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('rejects duplicate accounts', async () => {
    const { service, prisma } = setup();
    prisma.user.findFirst.mockResolvedValue({ id: 'existing' });
    await expect(service.selfRegisterFarmer(dto)).rejects.toThrow('already exists');
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('keeps administrative registration restricted to Super Admin', async () => {
    const { service } = setup();
    await expect(service.register({ ...dto, roleId: 'farmer-role' }, UserRole.FARMER)).rejects.toBeInstanceOf(ForbiddenException);
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
