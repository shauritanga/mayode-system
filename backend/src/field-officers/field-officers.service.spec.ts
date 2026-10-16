import { FieldOfficersService } from './field-officers.service';

const officer = (id: string) => ({
  id,
  employeeCode: id.toUpperCase(),
  firstName: 'Asha',
  lastName: id,
  assignedArea: null,
  region: null,
  district: null,
  mamcos: { id: 'm', name: 'Coop', district: 'Mbarali' },
  user: { phone: '0700', isActive: true, lastSyncAt: null, lastLoginAt: null },
});

function setup() {
  const day = (d: string) => new Date(d);
  const prisma = {
    mamcosStaff: { findMany: jest.fn().mockResolvedValue([officer('a'), officer('b')]) },
    farmer: {
      findMany: jest.fn().mockResolvedValue([
        // fully complete registration, assigned to a, still pending verification
        { registeredByOfficerId: 'a', assignedOfficerId: 'a', verificationStatus: 'PENDING', nationalId: '1', village: 'v', ward: 'w', gender: 'F', dateOfBirth: day('1990-01-01'), photoUrl: 'p', residenceLatitude: 1 },
        // half-complete registration by b
        { registeredByOfficerId: 'b', assignedOfficerId: 'b', verificationStatus: 'VERIFIED', nationalId: null, village: 'v', ward: null, gender: null, dateOfBirth: null, photoUrl: 'p', residenceLatitude: 1 },
      ]),
    },
    farm: {
      findMany: jest
        .fn()
        .mockResolvedValueOnce([
          // registered by and assigned to a
          { id: 'f1', registeredByOfficerId: 'a', assignedOfficerId: 'a', isVerified: false, centerLatitude: 1, photoUrls: ['x'], village: 'v', ownershipType: 'OWNED', waterSource: 'canal' },
        ])
        .mockResolvedValueOnce([{ id: 'f1' }]),
    },
    fieldOfficerVisit: {
      findMany: jest.fn().mockResolvedValue([
        // overdue follow-up for a (date passed, no later visit)
        { fieldOfficerId: 'a', farmerId: 'x', visitedAt: day('2020-01-01'), nextVisitDate: day('2020-02-01'), cropCycleId: 'c' },
        // b followed up again, so not overdue
        { fieldOfficerId: 'b', farmerId: 'y', visitedAt: day('2020-01-01'), nextVisitDate: day('2020-02-01'), cropCycleId: null },
        { fieldOfficerId: 'b', farmerId: 'y', visitedAt: day('2020-03-01'), nextVisitDate: null, cropCycleId: null },
      ]),
    },
    activityLog: { groupBy: jest.fn().mockResolvedValue([{ fieldOfficerId: 'a', _count: { _all: 3 } }]) },
  };
  const ownership = { resolveTenantMamcosId: jest.fn().mockReturnValue(null) };
  return new FieldOfficersService(prisma as any, ownership as any);
}

describe('FieldOfficersService.list', () => {
  it('counts assignments, registrations, visits, crop records and pending tasks per officer', async () => {
    const rows = await setup().list({ id: 'u', role: 'SUPER_ADMIN' } as any);
    const a = rows.find((r) => r.id === 'a')!;
    const b = rows.find((r) => r.id === 'b')!;
    expect(a).toMatchObject({
      farmersAssigned: 1,
      farmsAssigned: 1,
      farmersRegistered: 1,
      farmsMapped: 1,
      visitsCompleted: 1,
      cropRecordsUpdated: 4, // 3 activity logs + 1 visit tied to a crop
      dataCompleteness: 100,
      district: 'Mbarali',
    });
    // pending: 1 farmer awaiting verification + 1 unverified farm + 1 overdue follow-up
    expect(a.pendingTasks).toBe(3);
    expect(b.pendingTasks).toBe(0);
    expect(b.visitsCompleted).toBe(2);
    // b registered one farmer with 3 of 7 fields filled
    expect(b.dataCompleteness).toBe(43);
  });
});
