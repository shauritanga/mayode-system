import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PERMISSION_KEY } from '../auth/decorators/require-permission.decorator';
import { HarvestFeesController } from './harvest-fees.controller';
import { HarvestFeesService, clearanceFor, effectiveRate, planFees } from './harvest-fees.service';

const rate = (over: any) => ({ id: 'r', scope: 'AMCOS', canalId: null, blockId: null, ratePerHectare: 10000, status: 'ACTIVE', ...over });

describe('which rate applies to a block', () => {
  const block = { id: 'b1', canalId: 'c1' };
  it('prefers the block rate, then the canal rate, then the AMCOS rate', () => {
    const all = [rate({ id: 'a' }), rate({ id: 'c', scope: 'CANAL', canalId: 'c1', ratePerHectare: 12000 }), rate({ id: 'b', scope: 'BLOCK', blockId: 'b1', ratePerHectare: 15000 })];
    expect(effectiveRate(all, block)).toMatchObject({ id: 'b', rate: 15000, scope: 'BLOCK' });
    expect(effectiveRate(all.slice(0, 2), block)).toMatchObject({ id: 'c', rate: 12000 });
    expect(effectiveRate(all.slice(0, 1), block)).toMatchObject({ id: 'a', rate: 10000 });
  });
  it('ignores other blocks, pending, rejected and superseded rates', () => {
    const all = [rate({ id: 'x', scope: 'BLOCK', blockId: 'other' }), rate({ id: 'p', status: 'PENDING_APPROVAL' }), rate({ id: 's', status: 'SUPERSEDED' }), rate({ id: 'j', status: 'REJECTED' })];
    expect(effectiveRate(all, block)).toBeNull();
  });
});

describe('fee per holder', () => {
  it('adds up the hectares a farmer holds in the block and multiplies by the rate', () => {
    const plan = planFees([{ farmerId: 'f1', areaHectares: 1 }, { farmerId: 'f1', areaHectares: '1.50' }, { farmerId: 'f2', areaHectares: 1 }], 25000.5);
    expect(plan).toEqual([{ farmerId: 'f1', hectares: 2.5, amount: 62501.25 }, { farmerId: 'f2', hectares: 1, amount: 25000.5 }]);
  });
});

describe('clearance colour', () => {
  it('is green only when the fee is paid and no loan is outstanding', () => {
    expect(clearanceFor({ holder: true, charged: true, balance: 0, activeLoan: false })).toBe('GREEN');
    expect(clearanceFor({ holder: true, charged: true, balance: 0, activeLoan: true })).toBe('YELLOW');
    expect(clearanceFor({ holder: true, charged: true, balance: 500, activeLoan: false })).toBe('RED');
    expect(clearanceFor({ holder: true, charged: true, balance: 500, activeLoan: true })).toBe('RED');
    expect(clearanceFor({ holder: true, charged: false, balance: 0, activeLoan: false })).toBe('NOT_CHARGED');
    expect(clearanceFor({ holder: false, charged: false, balance: 0, activeLoan: false })).toBe('UNALLOCATED');
  });
});

const manager = (id: string) => ({ id, role: UserRole.CUSTOM, mamcosId: 'amcos-1', customRole: { isActive: true, isSystem: false, permissions: [{ action: 'EDIT', resource: { key: 'harvest_fee_approval' } }] } }) as any;
const cashier = { id: 'cashier', role: UserRole.CUSTOM, mamcosId: 'amcos-1', customRole: { isActive: true, isSystem: false, permissions: [] } } as any;

function build(over: any = {}) {
  const tx: any = {
    harvestFeeRate: { updateMany: jest.fn().mockResolvedValue({ count: 1 }), update: jest.fn().mockResolvedValue({}), create: jest.fn().mockResolvedValue({ id: 'new', scope: 'AMCOS', status: 'PENDING_APPROVAL' }) },
    auditLog: { create: jest.fn() },
    farmerDueType: { create: jest.fn().mockResolvedValue({ id: 't1', rate: 10000 }) },
    farmerDue: { createMany: jest.fn().mockResolvedValue({ count: 2 }) },
  };
  const prisma: any = {
    ...tx,
    harvestFeeRate: { ...tx.harvestFeeRate, findFirst: jest.fn(), findMany: jest.fn().mockResolvedValue([rate({ ratePerHectare: 10000 })]) },
    irrigationCanal: { findFirst: jest.fn().mockResolvedValue({ id: 'c1' }) },
    irrigationBlock: { findFirst: jest.fn().mockResolvedValue({ id: 'b1' }) },
    farmingSeason: { findFirst: jest.fn().mockResolvedValue({ id: 's1', name: '2026/27' }) },
    irrigationHectareAllocation: { findMany: jest.fn().mockResolvedValue([{ farmerId: 'f1', hectare: { areaHectares: 1 } }, { farmerId: 'f1', hectare: { areaHectares: 1 } }, { farmerId: 'f2', hectare: { areaHectares: 1 } }]) },
    farmerDueType: { ...tx.farmerDueType, findUnique: jest.fn().mockResolvedValue(null) },
    farmerDue: { ...tx.farmerDue, findMany: jest.fn().mockResolvedValue([]) },
    $transaction: jest.fn((fn: any) => fn(tx)),
    ...over,
  };
  const ownership: any = { resolveTenantMamcosId: (u: any) => u.mamcosId ?? null };
  const block = { id: 'b1', code: '5.15R', canalId: 'c1', canal: { scheme: { mamcosId: 'amcos-1' } } };
  const scope: any = { resolve: jest.fn().mockResolvedValue({ restricted: false }), assertUnrestricted: jest.fn(), assertBlock: jest.fn().mockResolvedValue(block) };
  return { svc: new HarvestFeesService(prisma, ownership, scope), prisma, tx, scope };
}

describe('rate approval', () => {
  const pending = { id: 'r1', status: 'PENDING_APPROVAL', requestedById: 'cashier', scope: 'AMCOS', canalId: null, blockId: null };
  it('lets a different manager approve, replacing the active rate of the same scope', async () => {
    const { svc, prisma, tx } = build();
    prisma.harvestFeeRate.findFirst.mockResolvedValue(pending);
    await expect(svc.decideRate('r1', { approve: true }, manager('mgr'))).resolves.toEqual({ id: 'r1', status: 'ACTIVE' });
    expect(tx.harvestFeeRate.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { status: 'SUPERSEDED' } }));
    expect(tx.harvestFeeRate.update.mock.calls[0][0].data).toMatchObject({ status: 'ACTIVE', decidedById: 'mgr' });
  });
  it('refuses the proposer, someone without the grant, and a rate that is not pending', async () => {
    const { svc, prisma } = build();
    prisma.harvestFeeRate.findFirst.mockResolvedValue(pending);
    await expect(svc.decideRate('r1', { approve: true }, manager('cashier'))).rejects.toBeInstanceOf(ConflictException);
    await expect(svc.decideRate('r1', { approve: true }, cashier)).rejects.toBeInstanceOf(ForbiddenException);
    prisma.harvestFeeRate.findFirst.mockResolvedValue({ ...pending, status: 'ACTIVE' });
    await expect(svc.decideRate('r1', { approve: true }, manager('mgr'))).rejects.toBeInstanceOf(ConflictException);
    prisma.harvestFeeRate.findFirst.mockResolvedValue(null);
    await expect(svc.decideRate('r1', { approve: true }, manager('mgr'))).rejects.toBeInstanceOf(NotFoundException);
  });
  it('rejecting leaves the active rate alone', async () => {
    const { svc, prisma, tx } = build();
    prisma.harvestFeeRate.findFirst.mockResolvedValue(pending);
    await svc.decideRate('r1', { approve: false, note: 'Too high' }, manager('mgr'));
    expect(tx.harvestFeeRate.updateMany).not.toHaveBeenCalled();
    expect(tx.harvestFeeRate.update.mock.calls[0][0].data).toMatchObject({ status: 'REJECTED', decisionNote: 'Too high' });
  });
  it('a proposal needs its canal/block, and only one can wait per target', async () => {
    const { svc, prisma } = build();
    await expect(svc.proposeRate({ scope: 'BLOCK', ratePerHectare: 1000 } as any, cashier)).rejects.toBeInstanceOf(BadRequestException);
    prisma.harvestFeeRate.findFirst.mockResolvedValue({ id: 'x' });
    await expect(svc.proposeRate({ scope: 'AMCOS', ratePerHectare: 1000 }, cashier)).rejects.toBeInstanceOf(ConflictException);
    prisma.harvestFeeRate.findFirst.mockResolvedValue(null);
    await expect(svc.proposeRate({ scope: 'AMCOS', ratePerHectare: 1000 }, cashier)).resolves.toMatchObject({ status: 'PENDING_APPROVAL' });
  });
});

describe('opening a harvest for a block', () => {
  const dto = { blockId: 'b1', seasonId: 's1' };
  it('charges each holder hectares x the approved rate once', async () => {
    const { svc, tx } = build();
    const res: any = await svc.openHarvest(dto, cashier);
    expect(res).toMatchObject({ created: 2, farmers: 2, ratePerHectare: 10000, totalNew: 30000 });
    const type = tx.farmerDueType.create.mock.calls[0][0].data;
    expect(type).toMatchObject({ category: 'HARVEST_FEE', basis: 'PER_HECTARE', rate: 10000, name: 'Harvest fee 2026/27 · 5.15R' });
    const rows = tx.farmerDue.createMany.mock.calls[0][0];
    expect(rows.skipDuplicates).toBe(true);
    expect(rows.data.map((r: any) => [r.farmerId, r.hectares, r.amount])).toEqual([['f1', 2, 20000], ['f2', 1, 10000]]);
  });
  it('a dry run writes nothing', async () => {
    const { svc, tx } = build();
    await expect(svc.openHarvest({ ...dto, dryRun: true }, cashier)).resolves.toMatchObject({ dryRun: true, newCharges: 2 });
    expect(tx.farmerDue.createMany).not.toHaveBeenCalled();
  });
  it('run again, it keeps the opening rate and only charges farmers not charged yet', async () => {
    const { svc, prisma, tx } = build();
    prisma.farmerDueType.findUnique.mockResolvedValue({ id: 't1', rate: 8000 });
    prisma.farmerDue.findMany.mockResolvedValue([{ farmerId: 'f1' }]);
    await svc.openHarvest(dto, cashier);
    expect(tx.farmerDueType.create).not.toHaveBeenCalled();
    expect(tx.farmerDue.createMany.mock.calls[0][0].data.map((r: any) => [r.farmerId, r.amount])).toEqual([['f2', 8000]]);
  });
  it('needs an approved rate and refuses someone limited to their block', async () => {
    const { svc, prisma, scope } = build();
    prisma.harvestFeeRate.findMany.mockResolvedValue([rate({ status: 'PENDING_APPROVAL' })]);
    await expect(svc.openHarvest(dto, cashier)).rejects.toBeInstanceOf(BadRequestException);
    scope.assertUnrestricted.mockImplementation(() => { throw new ForbiddenException('limited'); });
    await expect(svc.openHarvest(dto, cashier)).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('clearance list', () => {
  it('colours each hectare by its holder’s harvest fee and loans', async () => {
    const { svc, prisma } = build();
    prisma.farmerDueType = { ...prisma.farmerDueType, findMany: jest.fn().mockResolvedValue([{ id: 't1', season: '2026/27', rate: 10000, createdAt: new Date() }]) };
    const alloc = (id: string, name: string) => [{ farmer: { id, firstName: name, lastName: 'X', controlNumber: id }, guardians: [] }];
    prisma.irrigationHectare = { findMany: jest.fn().mockResolvedValue([
      { id: 'h1', code: '5.15R1', hectareNumber: 1, areaHectares: 1, allocations: alloc('paid', 'Paid') },
      { id: 'h2', code: '5.15R2', hectareNumber: 2, areaHectares: 1, allocations: alloc('owes', 'Owes') },
      { id: 'h3', code: '5.15R3', hectareNumber: 3, areaHectares: 1, allocations: alloc('loan', 'Loan') },
      { id: 'h4', code: '5.15R4', hectareNumber: 4, areaHectares: 1, allocations: [] },
    ]) };
    prisma.farmerDue.findMany.mockResolvedValue([
      { farmerId: 'paid', amount: 10000, waivedAmount: 0, payments: [{ amount: 10000 }] },
      { farmerId: 'owes', amount: 10000, waivedAmount: 0, payments: [{ amount: 4000 }] },
      { farmerId: 'loan', amount: 10000, waivedAmount: 0, payments: [{ amount: 10000 }] },
    ]);
    prisma.loanRecord = { groupBy: jest.fn().mockResolvedValue([{ farmerId: 'loan', _count: 1 }]) };
    const res: any = await svc.clearance('b1', cashier);
    expect(res.hectares.map((h: any) => [h.code, h.status])).toEqual([['5.15R1', 'GREEN'], ['5.15R2', 'RED'], ['5.15R3', 'YELLOW'], ['5.15R4', 'UNALLOCATED']]);
    expect(res.hectares[1]).toMatchObject({ farmerBalance: 6000, cleared: false });
    expect(res.summary).toMatchObject({ green: 1, red: 1, yellow: 1, unallocated: 1 });
  });
});

describe('who may call what', () => {
  const perm = (name: keyof HarvestFeesController) => Reflect.getMetadata(PERMISSION_KEY, HarvestFeesController.prototype[name] as any);
  it('guards every route with its own permission', () => {
    expect(perm('rates')).toMatchObject({ resource: 'harvest_fees', action: 'VIEW' });
    expect(perm('propose')).toMatchObject({ resource: 'harvest_fees', action: 'CREATE' });
    expect(perm('decide')).toMatchObject({ resource: 'harvest_fee_approval', action: 'EDIT' });
    expect(perm('open')).toMatchObject({ resource: 'harvest_fees', action: 'CREATE' });
    expect(perm('clearance')).toMatchObject({ resource: 'harvest_clearance', action: 'VIEW' });
    expect(perm('canal')).toMatchObject({ resource: 'harvest_clearance', action: 'VIEW' });
  });
});
