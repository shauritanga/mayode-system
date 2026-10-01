import { FarmersService } from './farmers.service';
import { UserRole } from '@prisma/client';

function setup() {
  const user = {
    findFirst: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue({ id: 'user' }),
  };
  const farmer = {
    findFirst: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue({ id: 'farmer' }),
    findUnique: jest.fn(),
  };
  const role = {
    findMany: jest.fn().mockResolvedValue([{ id: 'farmer-role' }]),
  };
  const prisma = {
    user,
    farmer,
    role,
    $transaction: jest.fn(async (fn) => fn({ user, farmer })),
  };
  const ownership = {
    resolveTenantMamcosId: jest.fn().mockReturnValue('officer-cooperative'),
    assertFarmerAccess: jest.fn(),
  };
  const service = new FarmersService(
    prisma as any,
    { get: jest.fn() } as any,
    {} as any,
    {} as any,
    {} as any,
    ownership as any,
    {} as any,
  );
  return { service, prisma, ownership };
}
describe('Officer registration and basic performance', () => {
  it('assigns the configured farmer login role and the officer cooperative', async () => {
    const { service, prisma } = setup();
    await service.create(
      {
        firstName: 'Asha',
        lastName: 'Juma',
        phone: '+255712345678',
        password: 'secret123',
        mamcosId: 'spoofed',
        village: 'Madibira',
      },
      { id: 'officer', role: UserRole.FIELD_OFFICER },
    );
    expect(prisma.user.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        roleId: 'farmer-role',
        role: UserRole.FARMER,
      }),
    });
    expect(prisma.farmer.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          mamcosId: 'officer-cooperative',
          village: 'Madibira',
        }),
      }),
    );
  });
  it('returns yield and cost history without a premium gate after checking ownership', async () => {
    const { service, prisma, ownership } = setup();
    prisma.farmer.findUnique.mockResolvedValue({
      controlNumber: 'MYD-1',
      cropCycles: [
        {
          id: 'cycle',
          actualYieldKg: 60,
          estimatedYieldKg: 70,
          costs: [{ totalCost: 1000 }, { totalCost: 2000 }],
          farm: { farmCode: 'F1' },
        },
      ],
    });
    const user = { id: 'user', role: UserRole.FARMER };
    const summary = await service.getProductionSummary('farmer', user);
    expect(ownership.assertFarmerAccess).toHaveBeenCalledWith(user, 'farmer');
    expect(summary.totalActualYieldKg).toBe(60);
    expect(summary.totalCostsTzs).toBe(3000);
    expect(summary.cycles[0].totalCostsTzs).toBe(3000);
  });
});
