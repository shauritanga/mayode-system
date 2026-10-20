import { UserRole } from '@prisma/client';
import { InsightsService, monthKeys } from './insights.service';

describe('monthKeys', () => {
  it('lists the last months oldest first, across a year boundary', () => {
    expect(monthKeys(new Date('2026-02-15T00:00:00Z'), 4)).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
  });
});

function build(user: any, tenantId: string | null) {
  const prisma: any = {
    farmer: { count: jest.fn().mockResolvedValue(4) },
    farm: {
      count: jest.fn().mockResolvedValueOnce(3).mockResolvedValueOnce(1),
      aggregate: jest.fn().mockResolvedValue({ _sum: { socialHectares: 12.34 } }),
    },
    cropCycle: {
      groupBy: jest.fn().mockResolvedValue([{ status: 'ACTIVE', _count: { _all: 2 } }]),
      findMany: jest.fn().mockResolvedValue([
        { actualYieldKg: 3000, areaPlantedHa: 1 },
        { actualYieldKg: 5000, areaPlantedHa: 1 },
        { actualYieldKg: 900, areaPlantedHa: null },
      ]),
      count: jest.fn().mockResolvedValue(1),
    },
    harvestRecord: { findMany: jest.fn().mockResolvedValue([]) },
    aiIntegrationRecord: {
      findMany: jest.fn().mockResolvedValue([
        { id: 'r1', sourceType: 'SOIL_TESTER', capturedAt: new Date(), farm: { farmCode: 'F1' }, recommendation: { summary: 'Add lime', severity: 'HIGH' } },
        { id: 'r2', sourceType: 'DRONE_REPORT', capturedAt: new Date(), farm: null, recommendation: null },
      ]),
    },
    stockLedgerEntry: { groupBy: jest.fn().mockResolvedValue([{ warehouseId: 'w1', _sum: { quantityKg: 500 } }]) },
    warehouse: { findMany: jest.fn().mockResolvedValue([{ id: 'w1', name: 'Main' }]) },
    opsInvoice: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const ownership: any = { resolveTenantMamcosId: jest.fn().mockReturnValue(tenantId) };
  return { service: new InsightsService(prisma, ownership), prisma };
}

describe('InsightsService.overview', () => {
  it('computes yield per hectare only from cycles with an area, and counts advisories by severity', async () => {
    const { service } = build({ role: UserRole.SUPER_ADMIN }, null);
    const r: any = await service.overview({ role: UserRole.SUPER_ADMIN } as any);
    expect(r.kpis).toMatchObject({ farmers: 4, farms: 3, hectares: 12.3, yieldKgPerHa: 4000 });
    expect(r.advisories.severity.HIGH).toBe(1);
    expect(r.advisories.latest).toHaveLength(1);
    expect(r.attention).toMatchObject({ overdueHarvests: 1, unverifiedFarms: 1, highAdvisories: 1 });
    expect(r.stock.totalKg).toBe(500);
    expect(r.harvestSeries).toHaveLength(12);
  });

  it('confines every query to the caller\'s cooperative and hides stock and sales without permission', async () => {
    const { service, prisma } = build({}, 'm1');
    const user: any = { role: UserRole.CUSTOM, customRole: { isActive: true, permissions: [] } };
    const r: any = await service.overview(user);
    expect(prisma.farmer.count).toHaveBeenCalledWith({ where: { mamcosId: 'm1' } });
    expect(prisma.harvestRecord.findMany.mock.calls[0][0].where.mamcosId).toBe('m1');
    expect(prisma.cropCycle.groupBy.mock.calls[0][0].where).toEqual({ farm: { mamcosId: 'm1' } });
    expect(r.stock).toBeUndefined();
    expect(r.sales).toBeUndefined();
  });
});
