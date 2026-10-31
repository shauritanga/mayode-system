/**
 * Integration tests for asset management against the throw-away `irrigation_test` schema
 * (scripts/irrigation-test-schema.sh). Skipped unless IRRIGATION_TEST_DATABASE_URL is set.
 */
import 'reflect-metadata';
import { randomUUID } from 'crypto';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaClient, UserRole } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { OwnershipService, RequestUser } from '../common/ownership.service';
import { AccountingService } from '../accounting/accounting.service';
import { PERMISSION_KEY } from '../auth/decorators/require-permission.decorator';
import { AssetsController } from './assets.controller';
import { AssetsService } from './assets.service';

const BASE_URL = process.env.IRRIGATION_TEST_DATABASE_URL;
const SCHEMA = 'irrigation_test';
const describeDb = BASE_URL ? describe : describe.skip;
const iso = (offsetDays = 0) => new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10);
const lastMonth = () => { const d = new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - 1); return d.toISOString().slice(0, 7); };
const thisMonth = () => new Date().toISOString().slice(0, 7);
const nextMonth = () => { const d = new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + 1); return d.toISOString().slice(0, 7); };

describeDb('Asset management (PostgreSQL)', () => {
  jest.setTimeout(120_000);
  let pool: Pool;
  let prisma: PrismaClient;
  let svc: AssetsService;
  let ledger: AccountingService;
  let adminA: RequestUser;
  let adminB: RequestUser;
  let superAdmin: RequestUser;
  let mamcosA: string;
  let mamcosB: string;
  let tractor: any;
  let laptop: any;

  beforeAll(async () => {
    const url = `${BASE_URL!.split('?')[0]}?options=${encodeURIComponent(`-c search_path=${SCHEMA}`)}`;
    pool = new Pool({ connectionString: url, max: 6 });
    prisma = new PrismaClient({ adapter: new PrismaPg(pool, { schema: SCHEMA }) });
    const [{ current_schema }] = await prisma.$queryRawUnsafe<{ current_schema: string }[]>('select current_schema()');
    expect(current_schema).toBe(SCHEMA);
    const ownership = new OwnershipService(prisma as any);
    ledger = new AccountingService(prisma as any, ownership);
    svc = new AssetsService(prisma as any, ownership, ledger);
    const tag = randomUUID().slice(0, 5);
    mamcosA = (await prisma.mamcos.create({ data: { name: `Madibira A ${tag}` } })).id;
    mamcosB = (await prisma.mamcos.create({ data: { name: `Ubaruku A ${tag}` } })).id;
    adminA = { id: randomUUID(), role: UserRole.CUSTOM, mamcosId: mamcosA };
    adminB = { id: randomUUID(), role: UserRole.CUSTOM, mamcosId: mamcosB };
    superAdmin = { id: randomUUID(), role: UserRole.SUPER_ADMIN, mamcosId: null };
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await pool.end();
  });

  describe('register', () => {
    it('registers assets with sequential tags, category default lives and a custody record', async () => {
      tractor = await svc.create(adminA, {
        name: 'Tractor MF-385', category: 'MACHINERY_VEHICLE', purchaseDate: iso(-200), cost: 12_000_000, usefulLifeYears: 10,
        custodianName: 'Juma Hamisi', serviceIntervalDays: 90, postToLedger: true,
      });
      laptop = await svc.create(adminA, { name: 'Office laptop', category: 'OFFICE_IT', purchaseDate: iso(-100), cost: 1_200_000 });
      expect(tractor).toMatchObject({ tag: 'AST-0001', cost: 12_000_000, bookValue: 12_000_000, accumulatedDepreciation: 0, status: 'IN_USE', postedPurchase: true });
      expect(laptop).toMatchObject({ tag: 'AST-0002', usefulLifeYears: 4, salvageValue: 0 });
      expect(tractor.custodyLog).toHaveLength(1);
      expect(iso(0) > tractor.nextServiceDue.toISOString().slice(0, 10)).toBe(true); // bought 200 days ago, 90-day interval: overdue
      // another AMCOS has its own numbering
      expect((await svc.create(adminB, { name: 'Pump', category: 'TOOLS', purchaseDate: iso(-5), cost: 500_000 })).tag).toBe('AST-0001');
    });

    it('refuses impossible figures and dates', async () => {
      const base = { name: 'X', category: 'TOOLS' as const, purchaseDate: iso(-10), cost: 1000 };
      await expect(svc.create(adminA, { ...base, salvageValue: 2000 })).rejects.toThrow(/Salvage value/);
      await expect(svc.create(adminA, { ...base, purchaseDate: iso(3) })).rejects.toThrow(/future/);
      await expect(svc.create(adminA, { ...base, depreciationStart: iso(-20) })).rejects.toThrow(/before the purchase date/);
      await expect(svc.create(adminA, { ...base, fundingSource: 'GRANT', postToLedger: true })).rejects.toThrow(/AMCOS funds/);
    });

    it('lists with filters and totals that match the register', async () => {
      const all: any = await svc.list(adminA, {});
      expect(all.total).toBe(2);
      expect(all.totals).toMatchObject({ count: 2, cost: 13_200_000, accumulatedDepreciation: 0, bookValue: 13_200_000 });
      expect((await svc.list(adminA, { category: 'OFFICE_IT' }) as any).items.map((i: any) => i.name)).toEqual(['Office laptop']);
      expect((await svc.list(adminA, { q: 'ast-0001' }) as any).total).toBe(1);
      expect((await svc.list(adminA, { custodian: 'juma' }) as any).total).toBe(1);
      expect((await svc.list(adminA, { pageSize: 1 }) as any).items).toHaveLength(1);
    });

    it('books the purchase on the AMCOS ledger only', async () => {
      const purchase = (await ledger.journalEntries(ledger.scopeFor(adminA)) as any[]).filter((j) => j.sourceType === 'AssetPurchase');
      expect(purchase).toHaveLength(1); // Dr Property, plant and equipment, Cr Cash
      expect(purchase[0]).toMatchObject({ totalDebit: 12_000_000, totalCredit: 12_000_000 });
      expect(purchase[0].lines.map((l: any) => l.account.code).sort()).toEqual(['1000', '1500']);
      expect((await ledger.journalEntries(ledger.scopeFor(adminB))).some((j: any) => j.sourceType === 'AssetPurchase')).toBe(false);
    });
  });

  describe('maintenance', () => {
    it('logs work, moves the next service date and shows what is due', async () => {
      const due0: any = await svc.due(adminA, {});
      expect(due0.items.some((i: any) => i.assetId === tractor.id && i.kind === 'SERVICE' && i.overdue)).toBe(true);
      const after: any = await svc.addMaintenance(adminA, tractor.id, { kind: 'SERVICE', doneOn: iso(-1), cost: 250_000, performedBy: 'Agro workshop', postToLedger: true }, undefined);
      expect(after.maintenance).toHaveLength(1);
      expect(after.upkeepCost).toBe(250_000);
      expect(after.nextServiceDue.toISOString().slice(0, 10)).toBe(iso(89)); // yesterday + 90 days
      const due1: any = await svc.due(adminA, {});
      expect(due1.items.some((i: any) => i.assetId === tractor.id && i.kind === 'SERVICE')).toBe(false);
      expect((await ledger.profitAndLoss(ledger.scopeFor(adminA))).expenses).toBe(250_000);
      await expect(svc.addMaintenance(adminA, tractor.id, { kind: 'REPAIR', doneOn: iso(2) })).rejects.toThrow(/not done yet/);
      await expect(svc.addMaintenance(adminA, tractor.id, { kind: 'REPAIR', doneOn: iso(-300) })).rejects.toThrow(/before the asset was bought/);
    });

    it('flags lapsing insurance and ignores warranties that already ended', async () => {
      const a: any = await svc.create(adminA, { name: 'Weighbridge', category: 'MILL_PROCESSING', purchaseDate: iso(-400), cost: 3_000_000, insuranceExpiresOn: iso(10), warrantyExpiresOn: iso(-5) });
      const due: any = await svc.due(adminA, {});
      expect(due.items.filter((i: any) => i.assetId === a.id).map((i: any) => i.kind)).toEqual(['INSURANCE']);
    });
  });

  describe('custody', () => {
    it('reassigns and keeps the history, which the database refuses to rewrite', async () => {
      const r: any = await svc.reassign(adminA, tractor.id, { toName: 'Neema Joseph', note: 'Moved to the Madibira depot' });
      expect(r.custodianName).toBe('Neema Joseph');
      expect(r.custodyLog.map((l: any) => [l.fromName, l.toName]).sort()).toEqual([[null, 'Juma Hamisi'], ['Juma Hamisi', 'Neema Joseph']].sort());
      await expect(svc.reassign(adminA, tractor.id, { toName: 'neema joseph' })).rejects.toThrow(/already holds/);
      await expect(prisma.$executeRawUnsafe(`delete from asset_custody_log where asset_id = '${tractor.id}'`)).rejects.toThrow(/cannot be changed or deleted/);
      await expect(prisma.$executeRawUnsafe(`update asset_custody_log set to_name = 'x' where asset_id = '${tractor.id}'`)).rejects.toThrow(/cannot be changed or deleted/);
    });
  });

  describe('depreciation', () => {
    it('previews, then posts a month once and only to this AMCOS ledger', async () => {
      const period = lastMonth();
      const preview: any = await svc.depreciationPreview(adminA, { period });
      // tractor 12,000,000 / 120 = 100,000; laptop 1,200,000 / 48 = 25,000; weighbridge 3,000,000 / 144 = 20,833.33
      expect(preview).toMatchObject({ alreadyPosted: false, total: 145_833.33 });
      expect(preview.lines.map((l: any) => l.amount).sort((x: number, y: number) => y - x)).toEqual([100_000, 25_000, 20_833.33]);
      const run: any = await svc.runDepreciation(adminA, period);
      expect(run).toMatchObject({ period, total: 145_833.33, assets: 3 });
      await expect(svc.runDepreciation(adminA, period)).rejects.toBeInstanceOf(ConflictException);
      expect((await svc.depreciationPreview(adminA, { period }) as any).alreadyPosted).toBe(true);
      const detail: any = await svc.get(adminA, tractor.id);
      expect(detail).toMatchObject({ accumulatedDepreciation: 100_000, bookValue: 11_900_000 });
      expect(detail.schedule).toEqual([{ period, amount: 100_000 }]);
      const books = ledger.scopeFor(adminA);
      const entries: any[] = await ledger.journalEntries(books) as any;
      const dep = entries.filter((e) => e.sourceType === 'AssetDepreciation');
      expect(dep.length).toBeGreaterThan(0);
      expect(JSON.stringify(dep)).toContain('145833.33');
      expect((await ledger.journalEntries(ledger.scopeFor(adminB))).some((j: any) => j.sourceType === 'AssetDepreciation')).toBe(false);
      expect((await ledger.profitAndLoss(books)).expenses).toBe(250_000 + 145_833.33);
      expect(((await svc.depreciationRuns(adminA, {})) as any[]).map((r) => r.period)).toEqual([period]);
    });

    it('will not post a month that has not started and skips fully depreciated assets', async () => {
      await expect(svc.runDepreciation(adminA, nextMonth())).rejects.toThrow(/not started/);
      const tiny: any = await svc.create(adminA, { name: 'Hand tool', category: 'TOOLS', purchaseDate: iso(-60), cost: 100, salvageValue: 100, usefulLifeYears: 1 });
      const preview: any = await svc.depreciationPreview(adminA, { period: thisMonth() });
      expect(preview.lines.some((l: any) => l.assetId === tiny.id)).toBe(false); // nothing to write off above salvage
    });

    it('does not depreciate before the start date', async () => {
      const later: any = await svc.create(adminA, { name: 'New mill', category: 'MILL_PROCESSING', purchaseDate: iso(-30), cost: 6_000_000, depreciationStart: iso(-1) });
      const preview: any = await svc.depreciationPreview(adminA, { period: lastMonth() });
      expect(preview.lines.some((l: any) => l.assetId === later.id)).toBe(false);
    });
  });

  describe('disposal', () => {
    it('closes the asset once, records the gain or loss and posts a balanced entry', async () => {
      const d: any = await svc.dispose(adminA, tractor.id, { disposedOn: iso(0), method: 'SOLD', proceeds: 9_000_000, reason: 'Replaced', postToLedger: true });
      expect(d.status).toBe('DISPOSED');
      expect(d.disposal).toMatchObject({ proceeds: 9_000_000, bookValue: 11_900_000, gainLoss: -2_900_000, posted: true });
      const entries: any[] = (await ledger.journalEntries(ledger.scopeFor(adminA)) as any).filter((e: any) => e.sourceType === 'AssetDisposal');
      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({ totalDebit: 12_000_000, totalCredit: 12_000_000 });
      expect(entries[0].lines.map((l: any) => l.account.code).sort()).toEqual(['1000', '1500', '1590', '4300']);
      await expect(svc.dispose(adminA, tractor.id, { disposedOn: iso(0), method: 'SCRAPPED' })).rejects.toBeInstanceOf(ConflictException);
      await expect(svc.update(adminA, tractor.id, { notes: 'x' })).rejects.toThrow(/disposed asset/);
      await expect(svc.addMaintenance(adminA, tractor.id, { kind: 'SERVICE', doneOn: iso(0) })).rejects.toThrow(/disposed/);
      expect(((await svc.listDisposals(adminA, {})) as any[]).map((x) => x.asset.tag)).toEqual(['AST-0001']);
    });

    it('rejects proceeds on a write-off and archives only disposed assets', async () => {
      await expect(svc.dispose(adminA, laptop.id, { disposedOn: iso(0), method: 'SCRAPPED', proceeds: 5 })).rejects.toThrow(/Only a sale/);
      await expect(svc.archive(adminA, laptop.id)).rejects.toThrow(/Dispose of the asset/);
      await svc.archive(adminA, tractor.id);
      expect((await svc.list(adminA, {}) as any).items.some((i: any) => i.id === tractor.id)).toBe(false);
    });

    it('a disposed asset drops out of later depreciation', async () => {
      const preview: any = await svc.depreciationPreview(adminA, { period: thisMonth() });
      expect(preview.lines.some((l: any) => l.assetId === tractor.id)).toBe(false);
    });
  });

  describe('machinery link', () => {
    it('links a Task Management machine once and shows its work beside the asset', async () => {
      const machine = await prisma.amcosEquipment.create({ data: { mamcosId: mamcosA, name: 'Combine', type: 'COMBINE_HARVESTER', ownership: 'AMCOS' } });
      const a: any = await svc.create(adminA, { name: 'Combine harvester', category: 'MACHINERY_VEHICLE', purchaseDate: iso(-50), cost: 40_000_000, equipmentId: machine.id });
      await prisma.machineryActivity.create({ data: { mamcosId: mamcosA, activityDate: new Date(iso(-2)), type: 'HARVESTING', equipmentId: machine.id, hectares: 12, status: 'COMPLETED', feeAmount: 0, feeStatus: 'NOT_APPLICABLE' } });
      await svc.addMaintenance(adminA, a.id, { kind: 'FUEL', doneOn: iso(-1), cost: 60_000 });
      const detail: any = await svc.get(adminA, a.id);
      expect(detail.usage).toMatchObject({ jobs: 1, hectares: 12 });
      expect(detail.costPerHectare).toBe(5000);
      await expect(svc.create(adminA, { name: 'Dup', category: 'TOOLS', purchaseDate: iso(-1), cost: 1, equipmentId: machine.id })).rejects.toBeInstanceOf(ConflictException);
      await expect(svc.create(adminB, { name: 'Steal', category: 'TOOLS', purchaseDate: iso(-1), cost: 1, equipmentId: machine.id })).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('cooperative boundaries', () => {
    it('keeps each AMCOS to its own assets and books', async () => {
      expect((await svc.list(adminB, {}) as any).items.every((i: any) => i.mamcosId === mamcosB)).toBe(true);
      await expect(svc.get(adminB, laptop.id)).rejects.toBeInstanceOf(NotFoundException);
      await expect(svc.update(adminB, laptop.id, { notes: 'x' })).rejects.toBeInstanceOf(NotFoundException);
      await expect(svc.addMaintenance(adminB, laptop.id, { kind: 'SERVICE', doneOn: iso(-1) })).rejects.toBeInstanceOf(NotFoundException);
      await expect(svc.reassign(adminB, laptop.id, { toName: 'x' })).rejects.toBeInstanceOf(NotFoundException);
      await expect(svc.dispose(adminB, laptop.id, { disposedOn: iso(0), method: 'SCRAPPED' })).rejects.toBeInstanceOf(NotFoundException);
      await expect(svc.list(adminB, { mamcosId: mamcosA })).rejects.toBeInstanceOf(ForbiddenException);
      expect((await svc.depreciationPreview(adminB, { period: lastMonth() }) as any).total).toBe(0);
      await expect(svc.runDepreciation(adminB, lastMonth())).rejects.toThrow(/Nothing to depreciate/);
    });

    it('platform accounts must say which cooperative', async () => {
      await expect(svc.list(superAdmin, {})).rejects.toBeInstanceOf(BadRequestException);
      expect((await svc.list(superAdmin, { mamcosId: mamcosA }) as any).total).toBeGreaterThan(0);
    });
  });

  describe('the database backs the rules', () => {
    it('refuses negative cost, salvage above cost, zero life, a bad period and a second run for a month', async () => {
      const insert = (cols: string, vals: string) => prisma.$executeRawUnsafe(
        `insert into assets (id, mamcos_id, tag, name, category, purchase_date, depreciation_start, updated_at, ${cols}) values ('${randomUUID()}', '${mamcosA}', 'T-${randomUUID().slice(0, 6)}', 'n', 'TOOLS', current_date, current_date, now(), ${vals})`);
      await expect(insert('cost, useful_life_years', '-1, 5')).rejects.toThrow(/cost_not_negative|check/);
      await expect(insert('cost, salvage_value, useful_life_years', '100, 200, 5')).rejects.toThrow(/salvage_within_cost|check/);
      await expect(insert('cost, useful_life_years', '100, 0')).rejects.toThrow(/useful_life_positive|check/);
      await expect(prisma.$executeRawUnsafe(`insert into asset_depreciation_runs (id, mamcos_id, period, total) values ('${randomUUID()}', '${mamcosA}', '2026-13', 1)`)).rejects.toThrow(/period_format|check/);
      await expect(prisma.$executeRawUnsafe(`insert into asset_depreciation_runs (id, mamcos_id, period, total) values ('${randomUUID()}', '${mamcosA}', '${lastMonth()}', 1)`)).rejects.toThrow(/unique|duplicate/);
      await expect(prisma.$executeRawUnsafe(`delete from assets where id = '${laptop.id}'`)).rejects.toThrow(); // it has depreciation lines
    });
  });

  it('declares an explicit assets permission on every route', () => {
    const proto = AssetsController.prototype as any;
    const handlers = Object.getOwnPropertyNames(proto).filter((n) => n !== 'constructor' && typeof proto[n] === 'function');
    expect(handlers.length).toBe(13);
    for (const name of handlers) {
      const required = Reflect.getMetadata(PERMISSION_KEY, proto[name]);
      expect({ name, resource: required?.resource }).toEqual({ name, resource: 'assets' });
    }
    expect(Reflect.getMetadata(PERMISSION_KEY, proto.run).action).toBe('EDIT');
    expect(Reflect.getMetadata(PERMISSION_KEY, proto.archive).action).toBe('DELETE');
  });
});
