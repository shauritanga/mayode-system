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
  return new FieldOfficersService(prisma as any, ownership as any, {} as any, {} as any, { get: () => undefined } as any);
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

describe('FieldOfficersService credentials', () => {
  const actor = { id: 'u1', role: 'CUSTOM', mamcosId: 'm1' } as any;
  function build(opts: { tenant?: string | null; smsOk?: boolean } = {}) {
    const prisma: any = {
      role: { findFirst: jest.fn().mockResolvedValue({ id: 'role1' }) },
      mamcos: { findUnique: jest.fn().mockResolvedValue({ id: 'm9' }) },
      mamcosStaff: {
        update: jest.fn().mockResolvedValue({ id: 'off1', employeeCode: 'FO-0009' }),
        findFirst: jest.fn().mockResolvedValue({ id: 'off1', userId: 'usr1', firstName: 'Asha' }),
      },
      user: {
        findUnique: jest.fn().mockResolvedValue({ id: 'usr1', phone: '+255700000001', language: 'sw', firstName: 'Asha' }),
        update: jest.fn().mockResolvedValue({}),
      },
      refreshToken: { deleteMany: jest.fn().mockResolvedValue({}) },
      $transaction: jest.fn().mockResolvedValue([]),
    };
    const ownership = { resolveTenantMamcosId: jest.fn().mockReturnValue(opts.tenant === undefined ? 'm1' : opts.tenant) };
    const auth = { createStaffAccount: jest.fn().mockResolvedValue({ id: 'usr1', phone: '+255700000001' }) };
    const sms = { sendTransactional: jest.fn().mockResolvedValue(opts.smsOk ?? true) };
    const service = new FieldOfficersService(prisma, ownership as any, auth as any, sms as any, { get: () => undefined } as any);
    return { service, prisma, auth, sms };
  }
  const dto = { firstName: 'Asha', lastName: 'Juma', phone: '0700000001', region: 'Mbeya', district: 'Mbarali' };

  it('creates the account with a temporary password, forces a change, and texts the details', async () => {
    const { service, auth, sms, prisma } = build();
    const res = await service.create(dto as any, actor);
    const [created, , options] = auth.createStaffAccount.mock.calls[0];
    expect(created.staffType).toBe('FIELD_OFFICER');
    expect(created.roleId).toBe('role1');
    expect(created.password).toHaveLength(10);
    expect(options).toEqual({ mustChangePassword: true });
    expect(prisma.mamcosStaff.update.mock.calls[0][0].data).toEqual({ region: 'Mbeya', district: 'Mbarali' });
    const [, text, type, logged] = sms.sendTransactional.mock.calls[0];
    expect(text).toContain(created.password);
    expect(logged).not.toContain(created.password);
    expect(type).toBe('staff_credentials');
    expect(res).toEqual({ id: 'off1', employeeCode: 'FO-0009', credentialsSms: 'sent' });
  });

  it('hands the password back once when the SMS could not be sent', async () => {
    const { service, auth } = build({ smsOk: false });
    const res: any = await service.create(dto as any, actor);
    expect(res.credentialsSms).toBe('failed');
    expect(res.temporaryPassword).toBe(auth.createStaffAccount.mock.calls[0][0].password);
  });

  it('lets Super Admin create an officer inside a chosen cooperative', async () => {
    const { service, auth, prisma } = build({ tenant: null });
    await service.create({ ...dto, mamcosId: 'm9' } as any, { id: 'su', role: 'SUPER_ADMIN' } as any);
    const [created, , options] = auth.createStaffAccount.mock.calls[0];
    expect(created.staffType).toBe('FIELD_OFFICER');
    expect(options).toEqual({ mustChangePassword: true, onBehalfOfMamcosId: 'm9' });
    expect(prisma.role.findFirst.mock.calls[0][0].where.mamcosId).toBe('m9');
  });

  it('refuses a cooperative administrator who names another cooperative', async () => {
    const { service, auth } = build();
    await expect(service.create({ ...dto, mamcosId: 'm9' } as any, actor)).rejects.toThrow('your own cooperative');
    expect(auth.createStaffAccount).not.toHaveBeenCalled();
  });

  it('refuses accounts with no cooperative (Super Admin)', async () => {
    const { service } = build({ tenant: null });
    await expect(service.create(dto as any, actor)).rejects.toThrow('cooperative');
  });

  it('re-issues credentials: new password, forced change, sessions revoked, SMS sent', async () => {
    const { service, prisma, sms } = build();
    const res = await service.resendCredentials('off1', actor);
    expect(prisma.$transaction).toHaveBeenCalled();
    expect(prisma.user.update.mock.calls[0][0].data.mustChangePassword).toBe(true);
    expect(sms.sendTransactional.mock.calls[0][1]).toContain('taarifa zako');
    expect(res).toEqual({ credentialsSms: 'sent' });
  });
});
