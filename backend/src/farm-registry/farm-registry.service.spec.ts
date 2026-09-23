import { FarmGrade, FarmRegistryStatus, UserRole } from '@prisma/client';
import { FarmRegistryService } from './farm-registry.service';

function buildService() {
  const farmCreate = jest.fn().mockImplementation(async (args: any) => ({
    id: 'farm-1',
    ...args.data,
  }));
  const prisma = {
    farmRegistryRecord: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation(async (args: any) => ({
        id: 'rec-1',
        ...args.data,
      })),
      update: jest.fn().mockImplementation(async (args: any) => ({
        id: 'rec-1',
        ...args.data,
      })),
    },
    farm: { create: farmCreate },
  };
  return {
    service: new FarmRegistryService(
      prisma as any,
      {} as any,
      {} as any,
      {} as any,
    ),
    prisma,
    farmCreate,
  };
}

const user = { id: 'officer-1', role: UserRole.FIELD_OFFICER };

describe('FarmRegistryService.preRegister farm grade', () => {
  it('uses the supplied grade for the created Farm', async () => {
    const { service, farmCreate } = buildService();
    await service.preRegister({ grade: FarmGrade.A } as any, user);
    expect(farmCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ grade: 'A' }) }),
    );
  });

  it('defaults to grade C when none is supplied', async () => {
    const { service, farmCreate } = buildService();
    await service.preRegister({} as any, user);
    expect(farmCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ grade: 'C' }) }),
    );
  });

  it('still creates the registry record as PRE_REGISTERED', async () => {
    const { service, prisma } = buildService();
    await service.preRegister({ grade: FarmGrade.B } as any, user);
    expect(prisma.farmRegistryRecord.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: FarmRegistryStatus.PRE_REGISTERED }),
      }),
    );
  });
});
