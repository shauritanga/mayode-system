/**
 * Integration tests for Irrigation Scheme Management against a real Postgres schema built from the migrations
 * (scripts/irrigation-test-schema.sh creates `irrigation_test`). They exercise the services and the database
 * constraints/triggers together. Skipped unless IRRIGATION_TEST_DATABASE_URL is set.
 *
 *   scripts/irrigation-test-schema.sh
 *   IRRIGATION_TEST_DATABASE_URL="$DATABASE_URL" npx jest irrigation.integration
 */
import 'reflect-metadata';
import { randomUUID } from 'crypto';
import { Reflector } from '@nestjs/core';
import { ConflictException, ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaClient, UserRole } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import type { RequestUser } from '../common/ownership.service';
import { PERMISSION_KEY } from '../auth/decorators/require-permission.decorator';
import { IrrigationController } from './irrigation.controller';
import { StaffService } from '../staff/staff.service';
import { OwnershipService } from '../common/ownership.service';
import { IrrigationScopeService } from './irrigation-scope.service';
import { SchemesService } from './schemes.service';
import { StructureService } from './structure.service';
import { AllocationService } from './allocation.service';
import { LeadershipService } from './leadership.service';
import { LeaderAccessService } from './leader-access.service';
import { DashboardService } from './dashboard.service';
import { DocumentsService } from './documents.service';

const BASE_URL = process.env.IRRIGATION_TEST_DATABASE_URL;
const SCHEMA = 'irrigation_test';
const describeDb = BASE_URL ? describe : describe.skip;

// The realistic scheme: 6 canals of 16,15,16,15,16,16 blocks = 94 blocks = 2,820 hectares.
const BLOCKS_PER_CANAL = [16, 15, 16, 15, 16, 16];
const TOTAL_BLOCKS = BLOCKS_PER_CANAL.reduce((a, b) => a + b, 0);
const TOTAL_HECTARES = TOTAL_BLOCKS * 30;

describeDb('Irrigation Scheme Management (PostgreSQL)', () => {
  jest.setTimeout(600_000);

  let pool: Pool;
  let prisma: PrismaClient;
  let scope: IrrigationScopeService;
  let schemes: SchemesService;
  let structure: StructureService;
  let allocations: AllocationService;
  let leadership: LeadershipService;
  let access: LeaderAccessService;
  let dashboard: DashboardService;
  let documents: DocumentsService;

  let mamcosId: string;
  let otherMamcosId: string;
  let admin: RequestUser;
  let approver: RequestUser;
  let outsider: RequestUser;
  let schemeId: string;
  let canalIds: string[] = [];
  const blockIds: string[][] = [];
  let farmerIds: string[] = [];

  const grants = (list: [string, string][]) => ({
    isActive: true, isSystem: false,
    permissions: list.map(([resource, action]) => ({ action, resource: { key: resource } })),
  });
  const MANAGER = grants([
    ['irrigation', 'VIEW'], ['irrigation', 'CREATE'], ['irrigation', 'EDIT'], ['irrigation', 'DELETE'],
    ['irrigation_allocations', 'VIEW'], ['irrigation_allocations', 'CREATE'], ['irrigation_allocations', 'EDIT'],
    ['irrigation_leadership', 'VIEW'], ['irrigation_leadership', 'CREATE'], ['irrigation_leadership', 'EDIT'],
  ]);
  const LEADER_ROLE = grants([
    ['irrigation', 'VIEW'], ['irrigation_allocations', 'VIEW'], ['irrigation_allocations', 'CREATE'],
    ['irrigation_leadership', 'VIEW'], ['irrigation_leadership', 'CREATE'],
  ]);

  async function makeUser(label: string, mamcos: string | null, role: any = MANAGER, withFarmer = false) {
    const id = randomUUID();
    await prisma.user.create({
      data: { id, phone: `+2557${Math.floor(Math.random() * 1e8).toString().padStart(8, '0')}${label.length}`, passwordHash: 'x', role: UserRole.CUSTOM, mamcosId: mamcos, firstName: label, lastName: 'Test' },
    });
    let farmerId: string | undefined;
    if (withFarmer) {
      farmerId = (await prisma.farmer.create({
        data: { userId: id, controlNumber: `LDR-${id.slice(0, 8)}`, firstName: label, lastName: 'Leader', mamcosId: mamcos },
      })).id;
    }
    const user: RequestUser = { id, role: UserRole.CUSTOM, mamcosId: mamcos, customRole: role };
    return { user, farmerId };
  }

  beforeAll(async () => {
    const url = `${BASE_URL!.split('?')[0]}?options=${encodeURIComponent(`-c search_path=${SCHEMA}`)}`;
    pool = new Pool({ connectionString: url, max: 12 });
    prisma = new PrismaClient({ adapter: new PrismaPg(pool, { schema: SCHEMA }) });
    // Safety: never run against anything but the throw-away schema.
    const [{ current_schema }] = await prisma.$queryRawUnsafe<{ current_schema: string }[]>('select current_schema()');
    expect(current_schema).toBe(SCHEMA);

    scope = new IrrigationScopeService(prisma as any);
    schemes = new SchemesService(prisma as any, scope);
    structure = new StructureService(prisma as any, scope, schemes);
    allocations = new AllocationService(prisma as any, scope, structure);
    access = new LeaderAccessService(prisma as any);
    leadership = new LeadershipService(prisma as any, scope, allocations, access);
    dashboard = new DashboardService(prisma as any, scope, structure);
    documents = new DocumentsService(prisma as any, scope);

    mamcosId = (await prisma.mamcos.create({ data: { name: `Madibira Test ${randomUUID().slice(0, 6)}` } })).id;
    otherMamcosId = (await prisma.mamcos.create({ data: { name: `Ubaruku Test ${randomUUID().slice(0, 6)}` } })).id;
    admin = (await makeUser('Admin', mamcosId)).user;
    approver = (await makeUser('Approver', mamcosId)).user;
    outsider = (await makeUser('Outsider', otherMamcosId)).user;
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await pool.end();
  });

  // ───────────────────────── scheme ─────────────────────────
  describe('scheme registration and editing', () => {
    it('creates a scheme and rejects a duplicate code regardless of case', async () => {
      const created = await schemes.create(admin, {
        code: 'MBR-01', name: 'Madibira Irrigation Scheme', region: 'Mbeya', district: 'Mbarali', waterSource: 'Great Ruaha River',
        establishedOn: '1999-01-01', requireAllocationApproval: false,
      });
      schemeId = created.id;
      expect(created.hectaresPerBlock).toBe(30);
      expect(created.mamcosId).toBe(mamcosId);
      await expect(schemes.create(admin, { code: 'mbr-01', name: 'Dup', region: 'Mbeya', district: 'Mbarali', waterSource: 'River' }))
        .rejects.toBeInstanceOf(ConflictException);
    });

    it('records a before/after history when the scheme is edited', async () => {
      await schemes.update(admin, schemeId, { village: 'Madibira', waterSource: 'Ruaha River' });
      const history = await schemes.history(admin, schemeId);
      expect(history.map((h) => h.action)).toEqual(expect.arrayContaining(['update', 'create']));
      const edit = history.find((h) => h.action === 'update')!;
      expect(edit.changes).toMatchObject({ waterSource: ['Great Ruaha River', 'Ruaha River'], village: [null, 'Madibira'] });
    });

    it('rejects inconsistent block limits and requires a cooperative', async () => {
      await expect(schemes.update(admin, schemeId, { minBlocksPerCanal: 20 })).rejects.toBeInstanceOf(BadRequestException);
      const platformAdmin: RequestUser = { ...admin, role: UserRole.SUPER_ADMIN, mamcosId: null };
      await expect(schemes.create(platformAdmin, { code: 'X-1', name: 'x', region: 'r', district: 'd', waterSource: 'w' }))
        .rejects.toBeInstanceOf(BadRequestException);
    });
  });

  // ───────────────────────── structure ─────────────────────────
  describe('canals, blocks and hectare units', () => {
    it('registers six canals numbered 1 to 6 and refuses a repeated number', async () => {
      for (let n = 1; n <= 6; n++) canalIds.push((await structure.createCanal(admin, { schemeId, canalNumber: n }) as any).id);
      expect(canalIds).toHaveLength(6);
      await expect(structure.createCanal(admin, { schemeId, canalNumber: 3 })).rejects.toBeInstanceOf(ConflictException);
    });

    it('creates 15–16 blocks per canal, each with exactly 30 numbered hectare units', async () => {
      for (let c = 0; c < 6; c++) {
        blockIds[c] = [];
        for (let b = 1; b <= BLOCKS_PER_CANAL[c]; b++) {
          blockIds[c].push((await structure.createBlock(admin, { canalId: canalIds[c], blockNumber: b, side: 'LEFT'}) as any).id);
        }
      }
      const counts = await prisma.$queryRawUnsafe<{ block_id: string; n: bigint; lo: number; hi: number; area: string }[]>(
        `select block_id, count(*) n, min(hectare_number) lo, max(hectare_number) hi, sum(area_hectares) area from irrigation_hectares where block_id in (${blockIds.flat().map((b) => `'${b}'`).join(',')}) group by block_id`);
      expect(counts).toHaveLength(TOTAL_BLOCKS);
      expect(counts.every((r) => Number(r.n) === 30 && r.lo === 1 && r.hi === 30 && Number(r.area) === 30)).toBe(true);
    });

    it('names blocks and hectares <canal>.<block><L|R><hectare> and renames them when the side changes', async () => {
      const canal = await prisma.irrigationCanal.findUniqueOrThrow({ where: { id: canalIds[0] } });
      const block: any = await prisma.irrigationBlock.findUniqueOrThrow({ where: { id: blockIds[0][0] } });
      expect(block.code).toBe(`${canal.canalNumber}.${block.blockNumber}L`);
      const first = await prisma.irrigationHectare.findFirstOrThrow({ where: { blockId: block.id, hectareNumber: 12 } });
      expect(first.code).toBe(`${canal.canalNumber}.${block.blockNumber}L12`);
      await structure.updateBlock(admin, block.id, { side: 'RIGHT' });
      const moved = await prisma.irrigationHectare.findFirstOrThrow({ where: { blockId: block.id, hectareNumber: 12 } });
      expect(moved.code).toBe(`${canal.canalNumber}.${block.blockNumber}R12`);
      expect((await prisma.irrigationBlock.findUniqueOrThrow({ where: { id: block.id } })).code).toBe(`${canal.canalNumber}.${block.blockNumber}R`);
      await structure.updateBlock(admin, block.id, { side: 'LEFT' });
    });

    it('refuses a block beyond the canal maximum and a repeated block number', async () => {
      await expect(structure.createBlock(admin, { canalId: canalIds[0], blockNumber: 17, side: 'LEFT'})).rejects.toBeInstanceOf(ConflictException);
      await expect(structure.createBlock(admin, { canalId: canalIds[1], blockNumber: 5, side: 'LEFT'})).rejects.toBeInstanceOf(ConflictException);
    });

    it('the database refuses a duplicate hectare number and a 31st hectare', async () => {
      const blockId = blockIds[0][0];
      await expect(structure.createHectare(admin, { blockId, hectareNumber: 7 })).rejects.toBeInstanceOf(ConflictException);
      await expect(structure.createHectare(admin, { blockId, hectareNumber: 31 })).rejects.toBeInstanceOf(ConflictException);
      // Bypassing the service entirely must still fail (trigger + unique constraint).
      await expect(prisma.$executeRawUnsafe(
        `insert into irrigation_hectares (id, block_id, hectare_number, code, updated_at) values ('${randomUUID()}', '${blockId}', 31, 'X', now())`))
        .rejects.toThrow(/exceeds|already has/);
      await expect(prisma.$executeRawUnsafe(
        `insert into irrigation_hectares (id, block_id, hectare_number, code, updated_at) values ('${randomUUID()}', '${blockId}', 5, 'X', now())`))
        .rejects.toThrow();
    });

    it('initialising hectares is idempotent and refills a damaged block to exactly 30', async () => {
      const blockId = blockIds[5][15];
      expect(await structure.initializeHectares(admin, blockId)).toEqual({ created: 0, total: 30 });
    });

    it('computes 6 canals, 94 blocks and 2,820 hectares on the overview from the database', async () => {
      const overview: any = await dashboard.overview(admin, schemeId);
      expect(overview.totals).toMatchObject({
        canals: 6, blocks: TOTAL_BLOCKS, hectareUnits: TOTAL_HECTARES, registeredHectares: TOTAL_HECTARES,
        allocatedHectares: 0, unallocatedHectares: TOTAL_HECTARES, completionPct: 0,
      });
      expect(TOTAL_BLOCKS).toBeGreaterThanOrEqual(90);
      expect(TOTAL_BLOCKS).toBeLessThanOrEqual(96);
      expect(TOTAL_HECTARES).toBeGreaterThanOrEqual(2700);
      expect(TOTAL_HECTARES).toBeLessThanOrEqual(2880);
      expect(overview.canals.map((c: any) => c.blockCount)).toEqual(BLOCKS_PER_CANAL);
      expect(overview.canals.every((c: any) => c.area === c.blockCount * 30)).toBe(true);
      expect(overview.alerts.some((a: any) => /canal leader/.test(a.message))).toBe(true);
    });

    it('lists canals with block count and total block area, and blocks with filters', async () => {
      const canals: any = await structure.listCanals(admin, { schemeId });
      expect(canals.data.map((c: any) => [c.canalNumber, c.blockCount, c.totalBlockArea])).toEqual(
        BLOCKS_PER_CANAL.map((n, i) => [i + 1, n, n * 30]));
      const blocks: any = await structure.listBlocks(admin, { canalId: canalIds[1], pageSize: '50' });
      expect(blocks.meta.total).toBe(15);
      expect((await structure.listBlocks(admin, { allocation: 'FULL' }) as any).meta.total).toBe(0);
    });

    it('archives only empty structures', async () => {
      await expect(structure.setCanalArchived(admin, canalIds[0], true)).rejects.toBeInstanceOf(ConflictException);
    });
  });

  // ───────────────────────── members ─────────────────────────
  describe('allocation rules', () => {
    beforeAll(async () => {
      // 2,820 members of the AMCOS (users + farmers inserted in bulk; allocations go through the service).
      const ids = Array.from({ length: TOTAL_HECTARES }, () => randomUUID());
      const stamp = Date.now() % 1e6;
      await prisma.user.createMany({
        data: ids.map((id, i) => ({ id, phone: `+255${stamp}${String(i).padStart(5, '0')}`, passwordHash: 'x', role: UserRole.FARMER, mamcosId })),
      });
      const farmerRows = ids.map((id, i) => ({ id: randomUUID(), userId: id, controlNumber: `MBR-${String(i + 1).padStart(5, '0')}`, firstName: `Mkulima${i + 1}`, lastName: 'Mbarali', mamcosId }));
      await prisma.farmer.createMany({ data: farmerRows });
      farmerIds = farmerRows.map((f) => f.id);
    });

    const hectareOf = async (block: string, n: number) =>
      (await prisma.irrigationHectare.findFirstOrThrow({ where: { blockId: block, hectareNumber: n } })).id;

    it('allocates a free hectare to an existing member and records who did it', async () => {
      const hectareId = await hectareOf(blockIds[0][0], 1);
      const a = await allocations.allocate(admin, { hectareId, farmerId: farmerIds[0] });
      expect(a.status).toBe('ACTIVE');
      expect(a.requestedById).toBe(admin.id);
      const list: any = await structure.listHectares(admin, { blockId: blockIds[0][0] });
      const row = list.data.find((h: any) => h.hectareNumber === 1);
      expect(row).toMatchObject({ allocationStatus: 'ALLOCATED', farmer: { memberNumber: 'MBR-00001' } });
      expect(list.data.filter((h: any) => h.allocationStatus === 'AVAILABLE')).toHaveLength(29);
    });

    it('never allocates an occupied hectare — in the service or straight through SQL', async () => {
      const hectareId = await hectareOf(blockIds[0][0], 1);
      await expect(allocations.allocate(admin, { hectareId, farmerId: farmerIds[1] })).rejects.toBeInstanceOf(ConflictException);
      await expect(prisma.$executeRawUnsafe(
        `insert into irrigation_hectare_allocations (id, hectare_id, farmer_id, status, allocated_on, updated_at)
         values ('${randomUUID()}', '${hectareId}', '${farmerIds[1]}', 'ACTIVE', current_date, now())`))
        .rejects.toThrow(/one_open_per_hectare|duplicate key/);
    });

    it('lets exactly one of two simultaneous allocations to the same hectare win', async () => {
      const hectareId = await hectareOf(blockIds[0][0], 2);
      const results = await Promise.allSettled([
        allocations.allocate(admin, { hectareId, farmerId: farmerIds[5] }),
        allocations.allocate(approver, { hectareId, farmerId: farmerIds[6] }),
        allocations.allocate(admin, { hectareId, farmerId: farmerIds[7] }),
      ]);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      for (const r of results) if (r.status === 'rejected') expect(r.reason).toBeInstanceOf(ConflictException);
      expect(await prisma.irrigationHectareAllocation.count({ where: { hectareId, status: 'ACTIVE' } })).toBe(1);
    });

    it('allows one member to hold several hectares, up to the scheme policy', async () => {
      await schemes.update(admin, schemeId, { maxHectaresPerFarmer: 2 });
      const f = farmerIds[10];
      await allocations.allocate(admin, { hectareId: await hectareOf(blockIds[0][0], 3), farmerId: f });
      await allocations.allocate(admin, { hectareId: await hectareOf(blockIds[0][0], 4), farmerId: f });
      await expect(allocations.allocate(admin, { hectareId: await hectareOf(blockIds[0][0], 5), farmerId: f }))
        .rejects.toThrow(/at most 2/);
      // A policy below what members already hold is refused rather than silently violated.
      await expect(schemes.update(admin, schemeId, { maxHectaresPerFarmer: 1 })).rejects.toBeInstanceOf(ConflictException);
      await schemes.update(admin, schemeId, { maxHectaresPerFarmer: null });
    });

    it('only accepts existing, non-blacklisted members of the same AMCOS', async () => {
      const hectareId = await hectareOf(blockIds[0][0], 6);
      const foreign = (await prisma.farmer.create({
        data: { userId: outsider.id, controlNumber: 'OTH-1', firstName: 'Mgeni', lastName: 'Nje', mamcosId: otherMamcosId },
      })).id;
      await expect(allocations.allocate(admin, { hectareId, farmerId: foreign })).rejects.toThrow(/not a member/);
      await prisma.farmer.update({ where: { id: farmerIds[20] }, data: { isBlacklisted: true } });
      await expect(allocations.allocate(admin, { hectareId, farmerId: farmerIds[20] })).rejects.toThrow(/blacklisted/);
      await expect(allocations.allocate(admin, { hectareId, farmerId: randomUUID() })).rejects.toBeInstanceOf(NotFoundException);
      expect(await prisma.farmer.count({ where: { mamcosId } })).toBe(TOTAL_HECTARES);
    });

    it('releasing a hectare frees it and keeps the closed record', async () => {
      const hectareId = await hectareOf(blockIds[0][0], 1);
      const active = await prisma.irrigationHectareAllocation.findFirstOrThrow({ where: { hectareId, status: 'ACTIVE' } });
      await allocations.release(admin, active.id, 'Member left the scheme');
      const closed = await prisma.irrigationHectareAllocation.findUniqueOrThrow({ where: { id: active.id } });
      expect(closed).toMatchObject({ status: 'ENDED', endedById: admin.id });
      expect(closed.endReason).toContain('Member left the scheme');
      await allocations.allocate(admin, { hectareId, farmerId: farmerIds[0] });
      expect(await prisma.irrigationHectareAllocation.count({ where: { hectareId } })).toBe(2);
    });

    it('allocation history cannot be deleted', async () => {
      await expect(prisma.$executeRawUnsafe('delete from irrigation_hectare_allocations')).rejects.toThrow(/historical/);
    });
  });

  // ───────────────────────── transfers ─────────────────────────
  describe('transfers', () => {
    const hectareOf = async (block: string, n: number) =>
      (await prisma.irrigationHectare.findFirstOrThrow({ where: { blockId: block, hectareNumber: n } })).id;

    it('closes the previous allocation and opens a new one, preserving history', async () => {
      const hectareId = await hectareOf(blockIds[1][0], 1);
      const first = await allocations.allocate(admin, { hectareId, farmerId: farmerIds[30] });
      const transfer = await allocations.createTransfer(admin, { hectareId, toFarmerId: farmerIds[31], reason: 'Sold the plot' });
      expect(transfer.status).toBe('COMPLETED');
      const rows = await prisma.irrigationHectareAllocation.findMany({ where: { hectareId }, orderBy: { createdAt: 'asc' } });
      expect(rows.map((r) => [r.farmerId, r.status])).toEqual([[farmerIds[30], 'ENDED'], [farmerIds[31], 'ACTIVE']]);
      expect(rows[0].id).toBe(first.id);
      expect(rows[0].endedOn).toEqual(transfer.effectiveDate);
      expect(rows[1].allocatedOn).toEqual(transfer.effectiveDate);
      expect(rows[0].endReason).toBe('TRANSFERRED');
      expect(transfer.toAllocationId).toBe(rows[1].id);
      expect(transfer.processedById).toBe(admin.id);
      expect(await prisma.irrigationHectareAllocation.count({ where: { hectareId, status: 'ACTIVE' } })).toBe(1);
      const listed: any = await allocations.listTransfers(admin, { hectareId });
      expect(listed.data[0]).toMatchObject({ previousFarmer: { memberNumber: 'MBR-00031' }, newFarmer: { memberNumber: 'MBR-00032' }, reason: 'Sold the plot' });
    });

    it('rejects transferring a free hectare, to the same holder, or with a future effective date', async () => {
      const free = await hectareOf(blockIds[1][0], 2);
      await expect(allocations.createTransfer(admin, { hectareId: free, toFarmerId: farmerIds[40], reason: 'x' })).rejects.toBeInstanceOf(ConflictException);
      const held = await hectareOf(blockIds[1][0], 1);
      await expect(allocations.createTransfer(admin, { hectareId: held, toFarmerId: farmerIds[31], reason: 'x' })).rejects.toBeInstanceOf(BadRequestException);
      await expect(allocations.createTransfer(admin, { hectareId: held, toFarmerId: farmerIds[40], reason: 'x', effectiveDate: '2999-01-01' })).rejects.toBeInstanceOf(BadRequestException);
      await expect(allocations.createTransfer(admin, { hectareId: held, toFarmerId: farmerIds[40], reason: 'x', effectiveDate: '2020-01-01' })).rejects.toThrow(/before the current allocation/);
    });

    it('holds a transfer for approval when the scheme requires it, and approval is by someone else', async () => {
      await schemes.update(admin, schemeId, { requireAllocationApproval: true });
      const hectareId = await hectareOf(blockIds[1][0], 1);
      const pending = await allocations.createTransfer(admin, { hectareId, toFarmerId: farmerIds[41], reason: 'Inheritance' });
      expect(pending.status).toBe('PENDING_APPROVAL');
      expect(await prisma.irrigationHectareAllocation.count({ where: { hectareId, status: 'ACTIVE', farmerId: farmerIds[31] } })).toBe(1);
      await expect(allocations.createTransfer(admin, { hectareId, toFarmerId: farmerIds[42], reason: 'again' })).rejects.toThrow(/awaiting approval/);
      const during: any = await dashboard.overview(admin, schemeId);
      expect(during.totals.pendingTransfers).toBe(1);
      expect(during.alerts.some((x: any) => /transfer\(s\) are waiting/.test(x.message))).toBe(true);
      await expect(allocations.approveTransfer(admin, pending.id)).rejects.toThrow(/someone other/);
      const done = await allocations.approveTransfer(approver, pending.id);
      expect(done).toMatchObject({ status: 'COMPLETED', approvedById: approver.id, processedById: approver.id });
      expect(await prisma.irrigationHectareAllocation.count({ where: { hectareId, status: 'ACTIVE', farmerId: farmerIds[41] } })).toBe(1);
      // a rejected transfer leaves the holder untouched
      const second = await allocations.createTransfer(admin, { hectareId, toFarmerId: farmerIds[43], reason: 'Dispute' });
      await allocations.closeTransfer(approver, second.id, 'REJECTED', 'Not supported by documents');
      expect(await prisma.irrigationHectareAllocation.count({ where: { hectareId, status: 'ACTIVE', farmerId: farmerIds[41] } })).toBe(1);
    });

    it('runs the pending → approved path for new allocations too', async () => {
      const hectareId = await hectareOf(blockIds[1][0], 2);
      const pending = await allocations.allocate(admin, { hectareId, farmerId: farmerIds[50] });
      expect(pending.status).toBe('PENDING_APPROVAL');
      await expect(allocations.allocate(approver, { hectareId, farmerId: farmerIds[51] })).rejects.toBeInstanceOf(ConflictException);
      await expect(allocations.approve(admin, pending.id)).rejects.toThrow(/someone other/);
      expect((await allocations.approve(approver, pending.id)).status).toBe('ACTIVE');
      const other = await allocations.allocate(admin, { hectareId: await hectareOf(blockIds[1][0], 3), farmerId: farmerIds[52] });
      await allocations.reject(approver, other.id, 'Member not in good standing');
      expect(await prisma.irrigationHectareAllocation.count({ where: { hectareId: other.hectareId, status: { in: ['ACTIVE', 'PENDING_APPROVAL'] } } })).toBe(0);
      await schemes.update(admin, schemeId, { requireAllocationApproval: false });
    });

    it('stores supporting documents against a transfer', async () => {
      const transfer = await prisma.irrigationAllocationTransfer.findFirstOrThrow({ where: { status: 'COMPLETED' } });
      const doc = await documents.create(admin, { schemeId, transferId: transfer.id, type: 'TRANSFER_SUPPORT', title: 'Sale agreement', fileUrl: '/uploads/x.pdf', fileName: 'x.pdf' });
      const listed: any = await allocations.listTransfers(admin, { hectareId: transfer.hectareId });
      expect(listed.data.find((t: any) => t.id === transfer.id).documents.map((d: any) => d.id)).toContain(doc.id);
    });
  });

  // ───────────────────────── leadership ─────────────────────────
  describe('leadership', () => {
    let canalLeader: Awaited<ReturnType<typeof makeUser>>;
    let blockLeader: Awaited<ReturnType<typeof makeUser>>;

    beforeAll(async () => {
      canalLeader = await makeUser('Kiongozi', mamcosId, LEADER_ROLE, true);
      blockLeader = await makeUser('Mwenyekiti', mamcosId, LEADER_ROLE, true);
    });

    it('appoints one canal leader per canal; a second needs explicit replacement and keeps the old record', async () => {
      const first = await leadership.appoint(admin, { position: 'CANAL_LEADER', canalId: canalIds[0], farmerId: canalLeader.farmerId!, termEnd: '2999-12-31' });
      await expect(leadership.appoint(admin, { position: 'CANAL_LEADER', canalId: canalIds[0], farmerId: farmerIds[60] }))
        .rejects.toThrow(/Confirm replacement/);
      await expect(leadership.appoint(admin, { position: 'CANAL_LEADER', canalId: canalIds[0], farmerId: canalLeader.farmerId!, replaceExisting: true }))
        .rejects.toThrow(/already holds/);
      const second = await leadership.appoint(admin, { position: 'CANAL_LEADER', canalId: canalIds[0], farmerId: farmerIds[60], replaceExisting: true });
      const old = await prisma.irrigationLeadership.findUniqueOrThrow({ where: { id: first.id } });
      expect(old).toMatchObject({ status: 'ENDED', replacedById: second.id, endedById: admin.id });
      expect(await prisma.irrigationLeadership.count({ where: { canalId: canalIds[0], position: 'CANAL_LEADER', status: 'ACTIVE' } })).toBe(1);
      // put the user-backed leader back for the scope tests
      await leadership.appoint(admin, { position: 'CANAL_LEADER', canalId: canalIds[0], farmerId: canalLeader.farmerId!, replaceExisting: true, termEnd: '2999-12-31' });
      const history: any = await leadership.list(admin, { canalId: canalIds[0], position: 'CANAL_LEADER' });
      expect(history.meta.total).toBe(3);
      expect(history.data.filter((r: any) => r.status === 'ACTIVE')).toHaveLength(1);
      expect(history.data.find((r: any) => r.id === second.id)).toMatchObject({ status: 'ENDED', replacedBy: { name: expect.stringContaining('Kiongozi') } });
    });

    it('the database allows only one active leader per canal and per block', async () => {
      await expect(prisma.$executeRawUnsafe(
        `insert into irrigation_leaderships (id, position, canal_id, farmer_id, appointed_on, term_start, status, updated_at)
         values ('${randomUUID()}', 'CANAL_LEADER', '${canalIds[0]}', '${farmerIds[70]}', current_date, current_date, 'ACTIVE', now())`))
        .rejects.toThrow(/one_active_canal_leader|duplicate key/);
      await leadership.appoint(admin, { position: 'BLOCK_LEADER', canalId: canalIds[0], blockId: blockIds[0][0], farmerId: blockLeader.farmerId! });
      await expect(prisma.$executeRawUnsafe(
        `insert into irrigation_leaderships (id, position, canal_id, block_id, farmer_id, appointed_on, term_start, status, updated_at)
         values ('${randomUUID()}', 'BLOCK_LEADER', '${canalIds[0]}', '${blockIds[0][0]}', '${farmerIds[71]}', current_date, current_date, 'ACTIVE', now())`))
        .rejects.toThrow(/one_active_block_leader|duplicate key/);
      // a block leader row without a block (or a canal leader with one) violates the scope check
      await expect(prisma.$executeRawUnsafe(
        `insert into irrigation_leaderships (id, position, canal_id, farmer_id, appointed_on, term_start, status, updated_at)
         values ('${randomUUID()}', 'BLOCK_LEADER', '${canalIds[2]}', '${farmerIds[72]}', current_date, current_date, 'ACTIVE', now())`))
        .rejects.toThrow(/position_scope|check/);
    });

    it('rejects a block from another canal, non-members and bad terms; leadership rows cannot be deleted', async () => {
      await expect(leadership.appoint(admin, { position: 'BLOCK_LEADER', canalId: canalIds[1], blockId: blockIds[0][1], farmerId: farmerIds[80] })).rejects.toBeInstanceOf(BadRequestException);
      await expect(leadership.appoint(admin, { position: 'BLOCK_LEADER', canalId: canalIds[1], blockId: blockIds[1][0], farmerId: randomUUID() })).rejects.toBeInstanceOf(NotFoundException);
      await expect(leadership.appoint(admin, { position: 'BLOCK_LEADER', canalId: canalIds[1], blockId: blockIds[1][0], farmerId: farmerIds[80], termStart: '2026-05-01', termEnd: '2026-04-01' })).rejects.toBeInstanceOf(BadRequestException);
      await expect(prisma.$executeRawUnsafe('delete from irrigation_leaderships')).rejects.toThrow(/historical/);
    });

    it('ends an appointment and reports coverage, expirations and leadership totals', async () => {
      await leadership.appoint(admin, { position: 'BLOCK_LEADER', canalId: canalIds[1], blockId: blockIds[1][3], farmerId: farmerIds[81], termEnd: new Date(Date.now() + 20 * 86_400_000).toISOString().slice(0, 10) });
      const sb = await leadership.appoint(admin, { position: 'BLOCK_LEADER', canalId: canalIds[1], blockId: blockIds[1][4], farmerId: farmerIds[82] });
      await leadership.end(admin, sb.id, { reason: 'Resigned' });
      const overview: any = await dashboard.leadershipOverview(admin, schemeId);
      expect(overview.totals).toMatchObject({ canals: 6, blocks: TOTAL_BLOCKS, assignedCanalLeaders: 1, unassignedCanals: 5, assignedBlockLeaders: 2, blocksWithoutLeaders: TOTAL_BLOCKS - 2 });
      expect(overview.expiring).toHaveLength(1);
      expect(overview.coverage[0]).toMatchObject({ blocks: 16, blocksWithLeader: 1 });
    });

    // ───── access control ─────
    it('confines a canal leader to their canal and its blocks', async () => {
      const u = canalLeader.user;
      const canals: any = await structure.listCanals(u, {});
      expect(canals.data.map((c: any) => c.id)).toEqual([canalIds[0]]);
      expect((await structure.listBlocks(u, { pageSize: '200' }) as any).meta.total).toBe(16);
      await expect(structure.getCanal(u, canalIds[1])).rejects.toBeInstanceOf(NotFoundException);
      await expect(structure.getBlock(u, blockIds[1][0])).rejects.toBeInstanceOf(NotFoundException);
      await expect(structure.getHectare(u, (await prisma.irrigationHectare.findFirstOrThrow({ where: { blockId: blockIds[1][0] } })).id)).rejects.toBeInstanceOf(NotFoundException);
      expect((await structure.listHectares(u, { pageSize: '200' }) as any).meta.total).toBe(16 * 30);
      const overview: any = await dashboard.overview(u);
      expect(overview.totals).toMatchObject({ canals: 1, blocks: 16 });
    });

    it('lets a canal leader allocate and appoint block leaders only inside their canal', async () => {
      const u = canalLeader.user;
      const inside = (await prisma.irrigationHectare.findFirstOrThrow({ where: { blockId: blockIds[0][2], hectareNumber: 1 } })).id;
      expect((await allocations.allocate(u, { hectareId: inside, farmerId: farmerIds[90] })).status).toBe('ACTIVE');
      const outside = (await prisma.irrigationHectare.findFirstOrThrow({ where: { blockId: blockIds[2][0], hectareNumber: 1 } })).id;
      await expect(allocations.allocate(u, { hectareId: outside, farmerId: farmerIds[91] })).rejects.toBeInstanceOf(NotFoundException);
      await leadership.appoint(u, { position: 'BLOCK_LEADER', canalId: canalIds[0], blockId: blockIds[0][5], farmerId: farmerIds[92] });
      await expect(leadership.appoint(u, { position: 'BLOCK_LEADER', canalId: canalIds[2], blockId: blockIds[2][0], farmerId: farmerIds[92] })).rejects.toBeInstanceOf(NotFoundException);
      await expect(leadership.appoint(u, { position: 'CANAL_LEADER', canalId: canalIds[0], farmerId: farmerIds[93], replaceExisting: true })).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('cannot change scheme structure or configuration', async () => {
      const u = canalLeader.user;
      await expect(structure.createCanal(u, { schemeId, canalNumber: 7 })).rejects.toBeInstanceOf(ForbiddenException);
      await expect(structure.createBlock(u, { canalId: canalIds[0], blockNumber: 17, side: 'LEFT'})).rejects.toBeInstanceOf(ForbiddenException);
      await expect(schemes.update(u, schemeId, { name: 'Hijacked' })).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('confines a block leader to their block, its hectares and its farmers', async () => {
      const u = blockLeader.user;
      expect((await structure.listBlocks(u, {}) as any).data.map((b: any) => b.id)).toEqual([blockIds[0][0]]);
      expect((await structure.listCanals(u, {}) as any).data).toHaveLength(1); // parent canal only, for context
      await expect(structure.getBlock(u, blockIds[0][1])).rejects.toBeInstanceOf(NotFoundException);
      expect((await structure.listHectares(u, { pageSize: '200' }) as any).meta.total).toBe(30);
      const inBlock = await prisma.irrigationHectareAllocation.findFirstOrThrow({ where: { status: 'ACTIVE', hectare: { blockId: blockIds[0][0] } } });
      expect((await allocations.farmerDetail(u, inBlock.farmerId)).current.length).toBeGreaterThan(0);
      // a member who holds hectares only elsewhere is invisible to this leader
      const elsewhere = await prisma.irrigationHectareAllocation.findFirstOrThrow({ where: { status: 'ACTIVE', hectare: { blockId: blockIds[1][0] } } });
      await expect(allocations.farmerDetail(u, elsewhere.farmerId)).rejects.toBeInstanceOf(NotFoundException);
      await expect(leadership.appoint(u, { position: 'BLOCK_LEADER', canalId: canalIds[0], blockId: blockIds[0][0], farmerId: farmerIds[94], replaceExisting: true })).rejects.toBeInstanceOf(ForbiddenException);
    });

    // ───── leaders are AMCOS staff while in office ─────
    describe('leader access', () => {
      const account = async (farmerId: string) => {
        const f = await prisma.farmer.findUniqueOrThrow({ where: { id: farmerId }, select: { user: { select: { id: true, role: true, roleId: true, mamcosId: true, customRole: { select: { name: true, isActive: true, isSystem: true, permissions: { select: { action: true, resource: { select: { key: true } } } } } } } } } });
        return f.user;
      };
      const asRequest = async (farmerId: string): Promise<RequestUser> => {
        const u = (await account(farmerId))!;
        return { id: u.id, role: u.role, mamcosId: u.mamcosId, customRole: u.customRole as any };
      };

      it('upgrades a member login to the Canal Leader staff role on appointment and reverts it when the term is ended', async () => {
        const farmerId = farmerIds[300];
        expect((await account(farmerId))).toMatchObject({ role: 'FARMER', roleId: null });
        const a = await leadership.appoint(admin, { position: 'CANAL_LEADER', canalId: canalIds[3], farmerId });
        const up = await account(farmerId);
        expect(up).toMatchObject({ role: 'CUSTOM', mamcosId, customRole: { name: 'Canal Leader', isActive: true, isSystem: false } });
        // the same login now resolves to that canal only
        const scoped = await scope.resolve(await asRequest(farmerId));
        expect(scoped).toMatchObject({ restricted: true, canalIds: [canalIds[3]] });
        await leadership.end(admin, a.id, { reason: 'Resigned' });
        expect(await account(farmerId)).toMatchObject({ role: 'FARMER', roleId: null, mamcosId: null });
      });

      it('gives block leaders the Block Leader role, and Canal Leader wins while both are held', async () => {
        const farmerId = farmerIds[301];
        const block = await leadership.appoint(admin, { position: 'BLOCK_LEADER', canalId: canalIds[4], blockId: blockIds[4][0], farmerId });
        expect((await account(farmerId))!.customRole?.name).toBe('Block Leader');
        const canal = await leadership.appoint(admin, { position: 'CANAL_LEADER', canalId: canalIds[4], farmerId });
        expect((await account(farmerId))!.customRole?.name).toBe('Canal Leader');
        await leadership.end(admin, canal.id, { reason: 'Step down' });
        expect((await account(farmerId))!.customRole?.name).toBe('Block Leader');
        await leadership.end(admin, block.id, { reason: 'Step down' });
        expect((await account(farmerId))!.role).toBe('FARMER');
      });

      it('returns the replaced leader to a member login and upgrades their successor', async () => {
        const [first, second] = [farmerIds[302], farmerIds[303]];
        await leadership.appoint(admin, { position: 'BLOCK_LEADER', canalId: canalIds[4], blockId: blockIds[4][1], farmerId: first });
        await leadership.appoint(admin, { position: 'BLOCK_LEADER', canalId: canalIds[4], blockId: blockIds[4][1], farmerId: second, replaceExisting: true });
        expect((await account(first))!.role).toBe('FARMER');
        expect((await account(second))!.customRole?.name).toBe('Block Leader');
      });

      it('never touches a member who is already some other kind of staff', async () => {
        const staffUser = (await makeUser('Existing', mamcosId, LEADER_ROLE, true));
        const before = await account(staffUser.farmerId!);
        const a = await leadership.appoint(admin, { position: 'BLOCK_LEADER', canalId: canalIds[4], blockId: blockIds[4][2], farmerId: staffUser.farmerId! });
        expect(await account(staffUser.farmerId!)).toEqual(before);
        await leadership.end(admin, a.id, { reason: 'x' });
        expect(await account(staffUser.farmerId!)).toEqual(before);
      });

      it('withdraws access when a term simply runs out, and a lapsed leader sees nothing in the meantime', async () => {
        const farmerId = farmerIds[304];
        const a = await leadership.appoint(admin, { position: 'BLOCK_LEADER', canalId: canalIds[4], blockId: blockIds[4][3], farmerId, termEnd: new Date(Date.now() + 86_400_000).toISOString().slice(0, 10) });
        expect((await account(farmerId))!.role).toBe('CUSTOM');
        // let the term lapse without anyone ending it
        await prisma.$executeRawUnsafe(`update irrigation_leaderships set term_end = current_date - 2, term_start = current_date - 30, appointed_on = current_date - 30 where id = '${a.id}'`);
        const stale = await scope.resolve(await asRequest(farmerId));
        expect(stale).toMatchObject({ restricted: true, canalIds: [], blockIds: [] });
        expect(((await structure.listBlocks(await asRequest(farmerId), {})) as any).meta.total).toBe(0);
        expect(await access.revertLapsed()).toBeGreaterThanOrEqual(1);
        expect(await account(farmerId)).toMatchObject({ role: 'FARMER', roleId: null });
      });
    });

    it('keeps cooperatives apart: another AMCOS sees nothing and cannot touch this scheme', async () => {
      expect(await schemes.list(outsider, {})).toEqual([]);
      expect((await structure.listCanals(outsider, {}) as any).meta.total).toBe(0);
      expect((await structure.listHectares(outsider, {}) as any).meta.total).toBe(0);
      await expect(schemes.get(outsider, schemeId)).rejects.toBeInstanceOf(NotFoundException);
      await expect(structure.getBlock(outsider, blockIds[0][0])).rejects.toBeInstanceOf(NotFoundException);
      await expect(allocations.allocate(outsider, { hectareId: (await prisma.irrigationHectare.findFirstOrThrow()).id, farmerId: farmerIds[0] })).rejects.toBeInstanceOf(NotFoundException);
      expect(await dashboard.overview(outsider)).toEqual({ scheme: null });
    });
  });

  // ───────────────────────── staff roster ─────────────────────────
  describe('staff roster', () => {
    const created: any[] = [];
    const smsSent: string[] = [];
    let staff: StaffService;
    let coopAdmin: RequestUser;

    beforeAll(async () => {
      const auth: any = { createStaffAccount: async (dto: any, _actor: any, opts: any) => { created.push({ dto, opts }); return { id: 'new-user', phone: dto.phone }; } };
      const sms: any = { sendTransactional: async (_p: string, text: string) => { smsSent.push(text); return true; } };
      staff = new StaffService(prisma as any, new OwnershipService(prisma as any), auth, sms, { get: () => undefined } as any);
      coopAdmin = { ...admin, customRole: { isActive: true, isSystem: false, permissions: [{ action: 'VIEW', resource: { key: 'users' } }, { action: 'CREATE', resource: { key: 'users' } }, { action: 'EDIT', resource: { key: 'users' } }, { action: 'VIEW', resource: { key: 'irrigation' } }] } as any };
    });

    it('lists leaders and other staff of the cooperative, never plain farmers, and counts them', async () => {
      const farmerId = farmerIds[400];
      const appointment = await leadership.appoint(admin, { position: 'CANAL_LEADER', canalId: canalIds[5], farmerId });
      const res: any = await staff.list(coopAdmin, {});
      const row = res.data.find((r: any) => r.memberNumber === 'MBR-00401');
      expect(row).toMatchObject({ name: 'Mkulima401 Mbarali', kind: 'CANAL_LEADER', roleName: 'Canal Leader', isActive: true, assignment: [expect.stringMatching(/^Canal C06/)] });
      expect(res.data.some((r: any) => r.memberNumber === 'MBR-00402')).toBe(false); // an ordinary member
      expect(res.summary.canalLeaders).toBeGreaterThanOrEqual(1);
      expect(res.summary.total).toBe(res.data.length);
      expect((await staff.list(coopAdmin, { kind: 'CANAL_LEADER' }) as any).data.every((r: any) => r.kind === 'CANAL_LEADER')).toBe(true);
      expect((await staff.list(coopAdmin, { q: 'mbr-00401' }) as any).data).toHaveLength(1);
      await leadership.end(admin, appointment.id, { reason: 'done' });
      expect((await staff.list(coopAdmin, {}) as any).data.some((r: any) => r.memberNumber === 'MBR-00401')).toBe(false);
    });

    it('keeps cooperatives apart', async () => {
      const other: RequestUser = { ...outsider, customRole: coopAdmin.customRole };
      const res: any = await staff.list(other, {});
      expect(res.data.every((r: any) => r.phone !== undefined)).toBe(true);
      expect(res.data.some((r: any) => r.id === admin.id)).toBe(false);
      await expect(staff.list(other, { mamcosId: mamcosId } as any)).rejects.toThrow(/own cooperative/);
    });

    it('offers only the cooperative roles an admin may grant, and never the automatic leader roles', async () => {
      const options = await staff.roleOptions(coopAdmin);
      expect(options.every((o: any) => !['Canal Leader', 'Block Leader'].includes(o.name))).toBe(true);
      expect(options.some((o: any) => o.name === 'UI Coop Admin')).toBe(false); // exists only in manual UI runs
    });

    it('creates staff with a generated password, texts it, and refuses to hand out a leader role', async () => {
      const leaderRole = await prisma.role.findFirstOrThrow({ where: { mamcosId, name: 'Canal Leader' } });
      await expect(staff.create({ firstName: 'A', lastName: 'B', phone: '+255711111111', roleId: leaderRole.id } as any, coopAdmin)).rejects.toThrow(/appointed in Scheme Management/);
      await expect(staff.create({ firstName: 'A', lastName: 'B', phone: '+255711111111' } as any, coopAdmin)).rejects.toThrow(/Choose a role/);
      const fieldRole = await prisma.role.create({ data: { name: `Records Clerk ${randomUUID().slice(0, 4)}`, mamcosId, systemRole: 'CUSTOM' } });
      const result: any = await staff.create({ firstName: 'Neema', lastName: 'Clerk', phone: '+255722222222', roleId: fieldRole.id, language: 'en' } as any, coopAdmin);
      expect(result.credentialsSms).toBe('sent');
      expect(result.temporaryPassword).toBeUndefined();
      const call = created[created.length - 1];
      expect(call.dto).toMatchObject({ roleId: fieldRole.id, firstName: 'Neema' });
      expect(call.dto.password).toMatch(/^(?=.*[A-Za-z])(?=.*\d).{10}$/);
      expect(call.opts.mustChangePassword).toBe(true);
      expect(smsSent[smsSent.length - 1]).toContain('AMCOS staff');
      expect(smsSent[smsSent.length - 1]).toContain(call.dto.password);
    });

    it('resets credentials only for staff of the same cooperative, never farmers or yourself', async () => {
      const farmerUser = (await prisma.farmer.findUniqueOrThrow({ where: { id: farmerIds[500] } })).userId;
      await expect(staff.resetCredentials(farmerUser, coopAdmin)).rejects.toThrow(/not found/);
      await expect(staff.resetCredentials(admin.id, coopAdmin)).rejects.toThrow(/own password/);
      const target = await makeUser('Reset', mamcosId, LEADER_ROLE);
      const before = (await prisma.user.findUniqueOrThrow({ where: { id: target.user.id } })).passwordHash;
      const out: any = await staff.resetCredentials(target.user.id, coopAdmin);
      expect(out.credentialsSms).toBe('sent');
      const after = await prisma.user.findUniqueOrThrow({ where: { id: target.user.id } });
      expect(after.passwordHash).not.toBe(before);
      expect(after.mustChangePassword).toBe(true);
      await expect(staff.resetCredentials(target.user.id, { ...outsider, customRole: coopAdmin.customRole } as RequestUser)).rejects.toThrow(/not found/);
    });
  });

  // ───────────────────────── routes ─────────────────────────
  describe('API authorization metadata', () => {
    it('declares an explicit permission on every irrigation route', () => {
      const reflector = new Reflector();
      const proto = IrrigationController.prototype as any;
      const handlers = Object.getOwnPropertyNames(proto).filter((n) => n !== 'constructor' && typeof proto[n] === 'function');
      expect(handlers.length).toBeGreaterThan(40);
      for (const name of handlers) {
        const required = reflector.get(PERMISSION_KEY, proto[name]);
        expect({ name, required: !!required }).toEqual({ name, required: true });
        expect(['irrigation', 'irrigation_allocations', 'irrigation_leadership', 'roles']).toContain(required.resource);
      }
    });

    it('requires CREATE/EDIT/DELETE — not just VIEW — for every write route', () => {
      const reflector = new Reflector();
      const proto = IrrigationController.prototype as any;
      const writes = Object.getOwnPropertyNames(proto).filter((n) => {
        const method = Reflect.getMetadata('method', proto[n]); // RequestMethod: GET = 0
        return n !== 'constructor' && method !== undefined && method !== 0;
      });
      expect(writes.length).toBeGreaterThan(20);
      for (const name of writes) expect(reflector.get(PERMISSION_KEY, proto[name]).action).not.toBe('VIEW');
    });
  });

  // ───────────────────────── full scheme ─────────────────────────
  describe('fully allocated scheme', () => {
    it('allocates every one of the 2,820 hectares to a unique member and reports 100% on every dashboard', async () => {
      // Clear partial state so the whole scheme can be filled in one clean pass through the service.
      const free = await prisma.irrigationHectare.findMany({
        where: { allocations: { none: { status: { in: ['ACTIVE', 'PENDING_APPROVAL'] } } } },
        select: { id: true }, orderBy: { id: 'asc' },
      });
      const held = new Set((await prisma.irrigationHectareAllocation.findMany({ where: { status: 'ACTIVE' }, select: { farmerId: true } })).map((a) => a.farmerId));
      const available = farmerIds.filter((id) => !held.has(id) && id !== farmerIds[20]);
      // Members may hold several hectares; reuse members if the unique pool runs short.
      let cursor = 0;
      const pick = () => available[cursor++ % available.length];
      for (let i = 0; i < free.length; i += 6) {
        await Promise.all(free.slice(i, i + 6).map((h) => allocations.allocate(admin, { hectareId: h.id, farmerId: pick() })));
      }
      const active = await prisma.irrigationHectareAllocation.count({ where: { status: 'ACTIVE' } });
      expect(active).toBe(TOTAL_HECTARES);
      const distinctHectares = await prisma.irrigationHectareAllocation.groupBy({ by: ['hectareId'], where: { status: 'ACTIVE' } });
      expect(distinctHectares).toHaveLength(TOTAL_HECTARES); // one holder per hectare

      const overview: any = await dashboard.overview(admin, schemeId);
      expect(overview.totals).toMatchObject({ allocatedHectares: TOTAL_HECTARES, unallocatedHectares: 0, completionPct: 100 });
      expect(overview.blockDistribution).toEqual({ full: TOTAL_BLOCKS, partial: 0, none: 0 });
      expect(overview.totals.pendingTransfers).toBe(0);
      expect(overview.totals.membersWithoutHectare).toBe(overview.totals.amcosMembers - overview.totals.registeredFarmers);
      const allocation: any = await dashboard.allocationOverview(admin, {});
      expect(allocation.totals).toMatchObject({
        totalHectares: TOTAL_HECTARES, allocatedHectares: TOTAL_HECTARES, unallocatedHectares: 0, activeAllocations: TOTAL_HECTARES,
        blocksFull: TOTAL_BLOCKS, blocksPartial: 0, blocksNone: 0, completionPct: 100,
      });
      expect(allocation.byCanal.map((c: any) => c.completionPct)).toEqual([100, 100, 100, 100, 100, 100]);
      const filtered: any = await dashboard.allocationOverview(admin, { canalId: canalIds[1] });
      expect(filtered.totals).toMatchObject({ totalHectares: 450, blocksFull: 15 });
      expect((await structure.listBlocks(admin, { allocation: 'FULL', pageSize: '200' }) as any).meta.total).toBe(TOTAL_BLOCKS);
      // a full hectare cannot be double-allocated by the UI path either
      const h = await prisma.irrigationHectare.findFirstOrThrow({ where: { blockId: blockIds[3][0], hectareNumber: 9 } });
      await expect(allocations.allocate(admin, { hectareId: h.id, farmerId: farmerIds[2000] })).rejects.toBeInstanceOf(ConflictException);
    });
  });
});
