import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AmcosRentalsService, standardTerms } from './amcos-rentals.service';
import { withoutMoney } from '../marketplace/marketplace.service';

const listing = (over: any = {}) => ({
  id: 'l1', farmId: 'f1', ownerId: 'o1', leaseDurationMonths: 12, seasonCount: 2, rentOutReason: ' Family reasons ', leaseTerms: null,
  leaseStartDate: new Date('2026-12-01'), leaseEndDate: new Date('2027-12-01'),
  farm: { id: 'f1', farmCode: 'FP-01', name: 'Farm', mamcosId: 'amcos-1' },
  owner: { id: 'o1', firstName: 'Elisha', lastName: 'M', mamcosId: 'amcos-1' },
  renter: { id: 't1', firstName: 'Placidius', lastName: 'K' },
  hectare: { id: 'h1', code: '5.15R12' }, ...over,
});
function build(l: any = listing(), mine: string[] = ['h1']) {
  const prisma: any = {
    landListing: { findUnique: jest.fn().mockResolvedValue(l), findMany: jest.fn().mockResolvedValue([]) },
    amcosRentalRecord: { upsert: jest.fn().mockResolvedValue({}), findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn(), updateMany: jest.fn(), update: jest.fn() },
    irrigationHectareAllocation: { findMany: jest.fn().mockResolvedValue(mine.map((hectareId) => ({ hectareId }))) },
    irrigationHectareGuardian: { findMany: jest.fn().mockResolvedValue([]) },
    irrigationHectare: { findUnique: jest.fn().mockResolvedValue({ id: 'h1', code: '5.15R12' }) },
    dispute: { create: jest.fn().mockResolvedValue({ id: 'd1' }) },
  };
  const ownership: any = { resolveTenantMamcosId: (u: any) => u.mamcosId ?? null };
  return { svc: new AmcosRentalsService(prisma, ownership), prisma };
}

describe('AMCOS rental record', () => {
  it('is written when a rental activates, with names, hectare, dates, seasons, reason and terms and no money', async () => {
    const { svc, prisma } = build();
    await svc.recordActivated('l1');
    const call = prisma.amcosRentalRecord.upsert.mock.calls[0][0];
    expect(call.where).toEqual({ listingId: 'l1' });
    expect(call.create).toMatchObject({
      mamcosId: 'amcos-1', hectareCode: '5.15R12', ownerName: 'Elisha M', tenantName: 'Placidius K',
      seasonCount: 2, durationMonths: 12, reason: 'Family reasons', status: 'ACTIVE',
    });
    expect(call.create.terms).toMatch(/Elisha M.*Placidius K/);
    expect(JSON.stringify(call.create)).not.toMatch(/price|commission|escrow|payout|amount/i);
  });
  it('keeps the owner’s own terms when given, and is idempotent (upsert)', async () => {
    const { svc, prisma } = build(listing({ leaseTerms: 'Tenant pays the canal fees.' }));
    await svc.recordActivated('l1');
    expect(prisma.amcosRentalRecord.upsert.mock.calls[0][0].create.terms).toBe('Tenant pays the canal fees.');
  });
  it('writes nothing for a farm outside any cooperative, and never throws', async () => {
    const { svc, prisma } = build(listing({ farm: { id: 'f1', farmCode: 'X', name: 'F', mamcosId: null }, owner: { id: 'o1', firstName: 'E', lastName: 'M', mamcosId: null } }));
    await svc.recordActivated('l1');
    expect(prisma.amcosRentalRecord.upsert).not.toHaveBeenCalled();
    prisma.landListing.findUnique.mockRejectedValue(new Error('db down'));
    await expect(svc.recordActivated('l1')).resolves.toBeUndefined();
  });
  it('picks the owner’s only hectare, or refuses one that is not theirs', async () => {
    const { svc } = build(undefined, ['h1']);
    await expect(svc.resolveHectareId('o1')).resolves.toBe('h1');
    await expect(svc.resolveHectareId('o1', 'other')).rejects.toBeInstanceOf(BadRequestException);
    const many = build(undefined, ['h1', 'h2']);
    await expect(many.svc.resolveHectareId('o1')).resolves.toBeNull();
  });
  it('shows an overdue active rental as ENDED and lists only the cooperative’s own', async () => {
    const { svc, prisma } = build();
    prisma.amcosRentalRecord.findMany.mockResolvedValue([{ id: 'r1', status: 'ACTIVE', endDate: new Date('2020-01-01'), _count: { disputes: 1 } }]);
    const res = await svc.list({ id: 'u', role: 'MAMCOS_SECRETARY', mamcosId: 'amcos-1' } as any, {});
    expect(prisma.amcosRentalRecord.findMany.mock.calls[0][0].where).toMatchObject({ mamcosId: 'amcos-1' });
    expect(res.data[0]).toMatchObject({ status: 'ENDED', openDisputes: 1 });
    expect(res.summary).toMatchObject({ ended: 1, openDisputes: 1 });
  });
  it('refuses a record of another cooperative', async () => {
    const { svc, prisma } = build();
    prisma.amcosRentalRecord.findFirst.mockResolvedValue(null);
    await expect(svc.addWitnessNote('x', 'seen', { id: 'u', role: 'MAMCOS_SECRETARY', mamcosId: 'amcos-1' } as any)).rejects.toBeInstanceOf(NotFoundException);
  });
  it('standard terms mention seasons and carry no price', () => {
    const t = standardTerms({ owner: 'A', tenant: 'B', place: 'hectare 1:1R-1', start: new Date('2026-12-01'), end: new Date('2027-12-01'), months: 12, seasons: 2 });
    expect(t).toMatch(/2 farming seasons/);
    expect(t).not.toMatch(/TZS|price|rent of/i);
  });
});

describe('listing shown to cooperative staff', () => {
  it('has no price, commission or payment detail', () => {
    const out = withoutMoney({ id: 'l', askingPrice: 5, finalPrice: 4, commissionAmount: 1, commissionRate: .1, rentScheduleJson: [1], minimumPrice: 3, leaseStatus: 'ACTIVE',
      escrowPayments: [{ id: 'e', status: 'RELEASED', amount: 4, mpesaRef: 'X', payoutStatus: 'PAID', releasedAt: null }] });
    expect(JSON.stringify(out)).not.toMatch(/askingPrice|finalPrice|commission|rentSchedule|minimumPrice|amount|mpesa|payout/);
    expect(out).toMatchObject({ leaseStatus: 'ACTIVE', escrowPayments: [{ id: 'e', status: 'RELEASED' }] });
  });
});
