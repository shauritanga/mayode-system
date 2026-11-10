/**
 * Integration tests for the water register (schedules, the daily log, water issues) against the throw-away `irrigation_test`
 * schema (scripts/irrigation-test-schema.sh). Skipped unless IRRIGATION_TEST_DATABASE_URL is set.
 */
import 'reflect-metadata';
import { randomUUID } from 'crypto';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaClient, UserRole } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { OwnershipService, RequestUser } from '../common/ownership.service';
import { PERMISSION_KEY } from '../auth/decorators/require-permission.decorator';
import { IrrigationScopeService } from '../irrigation/irrigation-scope.service';
import { WaterController } from './water.controller';
import { WaterService } from './water.service';

const BASE_URL = process.env.IRRIGATION_TEST_DATABASE_URL;
const SCHEMA = 'irrigation_test';
const describeDb = BASE_URL ? describe : describe.skip;
const ymd = (offsetDays: number) => new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10);

describeDb('Water register (PostgreSQL)', () => {
  jest.setTimeout(120_000);
  let pool: Pool; let prisma: PrismaClient; let water: WaterService;
  let mamcosA: string; let mamcosB: string; let canalId: string; let blockA: string; let blockB: string;
  let office: RequestUser; let chairman: RequestUser; let outsider: RequestUser; let openerId: string; let plainId: string;
  const grants = (list: [string, string][]) => ({ isActive: true, isSystem: false, permissions: list.map(([resource, action]) => ({ action, resource: { key: resource } })) });
  const user = async (mamcosId: string) => (await prisma.user.create({ data: { phone: `+2556${Math.floor(Math.random() * 1e8).toString().padStart(8, '0')}`, passwordHash: 'x', role: UserRole.CUSTOM, mamcosId, firstName: 'U', lastName: 'Test' } as any })).id;

  beforeAll(async () => {
    const url = `${BASE_URL!.split('?')[0]}?options=${encodeURIComponent(`-c search_path=${SCHEMA}`)}`;
    pool = new Pool({ connectionString: url, max: 6 });
    prisma = new PrismaClient({ adapter: new PrismaPg(pool, { schema: SCHEMA }) });
    const ownership = new OwnershipService(prisma as any);
    water = new WaterService(prisma as any, ownership, new IrrigationScopeService(prisma as any));
    const tag = randomUUID().slice(0, 5);
    mamcosA = (await prisma.mamcos.create({ data: { name: `Water A ${tag}` } })).id;
    mamcosB = (await prisma.mamcos.create({ data: { name: `Water B ${tag}` } })).id;
    const scheme = await prisma.irrigationScheme.create({ data: { mamcosId: mamcosA, name: `Scheme ${tag}` } });
    canalId = (await prisma.irrigationCanal.create({ data: { schemeId: scheme.id, canalNumber: 1, code: `W1-${tag}`, name: 'Canal 1' } })).id;
    blockA = (await prisma.irrigationBlock.create({ data: { canalId, blockNumber: 1, code: '1.1R', side: 'RIGHT', areaHectares: 30, hectareCount: 30 } })).id;
    blockB = (await prisma.irrigationBlock.create({ data: { canalId, blockNumber: 2, code: '1.2R', side: 'RIGHT', areaHectares: 30, hectareCount: 30 } })).id;
    const full = grants([['water', 'VIEW'], ['water', 'CREATE'], ['water', 'EDIT'], ['water_schedules', 'VIEW'], ['water_schedules', 'CREATE'], ['water_schedules', 'EDIT']]);
    office = { id: await user(mamcosA), role: UserRole.CUSTOM, mamcosId: mamcosA, customRole: full } as RequestUser;
    // the chairman is a member whose login holds the block leader office of block A only
    const chairId = await user(mamcosA);
    const farmer = await prisma.farmer.create({ data: { userId: chairId, controlNumber: `W-${tag}`, firstName: 'Block', lastName: 'Chairman', mamcosId: mamcosA } });
    await prisma.irrigationLeadership.create({ data: { position: 'BLOCK_LEADER', canalId, blockId: blockA, farmerId: farmer.id, appointedOn: new Date('2026-01-01'), termStart: new Date('2026-01-01') } });
    chairman = { id: chairId, role: UserRole.CUSTOM, mamcosId: mamcosA, customRole: grants([['water', 'VIEW'], ['water', 'CREATE'], ['water', 'EDIT']]) } as RequestUser;
    outsider = { id: await user(mamcosB), role: UserRole.CUSTOM, mamcosId: mamcosB, customRole: full } as RequestUser;
    const mk = (n: string, title: string, compliance: 'WATER_LOG' | 'NONE', i: number) => prisma.payrollPayee.create({ data: { mamcosId: mamcosA, workerCode: `WK-90${i}`, fullName: n, phone: `+25575600000${i}`, title, compliance, monthlySalary: 100_000, startDate: new Date('2026-01-01'), verifiedAt: new Date() } });
    openerId = (await mk('Gate Opener', 'Water Gate Opener', 'WATER_LOG', 1)).id;
    plainId = (await mk('Cleaner', 'Office Cleaner', 'NONE', 2)).id;
  });
  afterAll(async () => { await prisma.$disconnect(); await pool.end(); });

  it('lists the canals, blocks and gate openers the screens offer, narrowed for a chairman', async () => {
    const all: any = await water.structure(office);
    expect(all.blocks.map((b: any) => b.code).sort()).toEqual(['1.1R', '1.2R']);
    expect(all.gateOpeners.map((g: any) => g.name)).toEqual(['Gate Opener']); // only people whose pay depends on the log
    const mine: any = await water.structure(chairman);
    expect(mine.blocks.map((b: any) => b.code)).toEqual(['1.1R']);
    expect(((await water.structure(outsider)) as any).canals).toHaveLength(0);
    await expect(water.structure(office, mamcosB)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('sets a water schedule, refusing a block off the canal, a person who is not a gate opener, and nonsense dates', async () => {
    const other = await prisma.irrigationCanal.create({ data: { schemeId: (await prisma.irrigationCanal.findUniqueOrThrow({ where: { id: canalId } })).schemeId, canalNumber: 2, code: `W2-${randomUUID().slice(0, 4)}`, name: 'Canal 2' } });
    const otherBlock = await prisma.irrigationBlock.create({ data: { canalId: other.id, blockNumber: 1, code: '2.1R', side: 'RIGHT', areaHectares: 30, hectareCount: 30 } });
    const base = { canalId, weekdays: [1, 3, 5] };
    await expect(water.createSchedule(office, { ...base, weekdays: [] } as any)).rejects.toThrow(/days water runs/);
    await expect(water.createSchedule(office, { ...base, blockId: otherBlock.id } as any)).rejects.toThrow(/not on this canal/);
    await expect(water.createSchedule(office, { ...base, gateOpenerPayeeId: plainId } as any)).rejects.toThrow(/not a gate opener/);
    await expect(water.createSchedule(office, { ...base, startsOn: ymd(5), endsOn: ymd(1) } as any)).rejects.toThrow(/cannot end before/);
    await expect(water.createSchedule(outsider, base as any)).rejects.toBeInstanceOf(NotFoundException);
    const s: any = await water.createSchedule(office, { ...base, blockId: blockA, gateOpenerPayeeId: openerId, startsOn: ymd(-30), note: 'Mon, Wed, Fri' } as any);
    expect(s.weekdays).toEqual([1, 3, 5]);
    const list: any = await water.schedules(office);
    expect(list.data[0]).toMatchObject({ canal: { id: canalId }, block: { code: '1.1R' }, gateOpener: { name: 'Gate Opener' }, isActive: true });
    expect(((await water.schedules(outsider)) as any).data).toHaveLength(0);
    const off: any = await water.updateSchedule(office, s.id, { isActive: false });
    expect(off.isActive).toBe(false);
    await water.updateSchedule(office, s.id, { isActive: true, weekdays: [0, 1, 2, 3, 4, 5, 6] });
  });

  it('records the daily log: a chairman only for their own block, no future or long-late days, an issue needs a description', async () => {
    const entry: any = await water.log(chairman, { canalId, blockId: blockA, gateOpenerPayeeId: openerId, openedAt: new Date().toISOString(), note: 'Gate opened on time' } as any);
    expect(entry).toMatchObject({ canalId, blockId: blockA, gateOpenerPayeeId: openerId, loggedById: chairman.id });
    await expect(water.log(chairman, { canalId, blockId: blockB } as any)).rejects.toBeInstanceOf(Error); // a block they do not lead
    await expect(water.log(chairman, { canalId } as any)).rejects.toThrow(/Choose your block/); // the whole canal is not theirs
    await expect(water.log(office, { canalId, date: ymd(1) } as any)).rejects.toThrow(/has not happened/);
    await expect(water.log(office, { canalId, date: ymd(-9) } as any)).rejects.toThrow(/up to a week late/);
    await expect(water.log(office, { canalId, gateOpenerPayeeId: plainId } as any)).rejects.toThrow(/not a gate opener/);
    await expect(water.log(office, { canalId, openedAt: '2026-05-02T10:00:00Z', closedAt: '2026-05-02T08:00:00Z' } as any)).rejects.toThrow(/cannot close before/);
    await expect(water.log(office, { canalId, issueType: 'FLOOD', issueNote: 'x' } as any)).rejects.toThrow(/kind of water issue/);
    await expect(water.log(office, { canalId, issueType: 'LEAK' } as any)).rejects.toThrow(/Describe the water issue/);
    await expect(water.log(outsider, { canalId } as any)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('reports water issues, shows the open ones, and lets only someone with a stake resolve them, once', async () => {
    const leak: any = await water.log(chairman, { canalId, blockId: blockA, issueType: 'LEAK', issueNote: 'Bank breached near the gate' } as any);
    const dispute: any = await water.log(office, { canalId, blockId: blockB, issueType: 'DISPUTE', issueNote: 'Farmers disagree on turns' } as any);
    const open: any = await water.logs(office, { issues: 'open' });
    expect(open.data.map((r: any) => r.issue.type).sort()).toEqual(['DISPUTE', 'LEAK']);
    expect(open.data.find((r: any) => r.issue.type === 'LEAK')).toMatchObject({ canal: expect.any(String), block: '1.1R', loggedBy: 'U Test' });
    expect(((await water.logs(chairman, { issues: 'open' })) as any).data.map((r: any) => r.issue.type)).toEqual(['LEAK']); // the chairman sees only their canal's block scope
    await expect(water.resolveIssue(chairman, dispute.id, { resolution: 'We fixed it' })).rejects.toBeInstanceOf(Error); // not their block
    expect(await water.resolveIssue(chairman, leak.id, { resolution: 'Sandbags placed, repaired Friday' })).toEqual({ id: leak.id, issueStatus: 'RESOLVED' });
    await expect(water.resolveIssue(chairman, leak.id, { resolution: 'again please' })).rejects.toBeInstanceOf(ConflictException);
    await expect(water.resolveIssue(outsider, dispute.id, { resolution: 'not mine at all' })).rejects.toBeInstanceOf(NotFoundException);
    expect(((await water.logs(office, { issues: 'open' })) as any).data).toHaveLength(1);
    expect(((await water.logs(office, { issues: 'all' })) as any).data.find((r: any) => r.id === leak.id).issue).toMatchObject({ status: 'RESOLVED', resolution: 'Sandbags placed, repaired Friday' });
    expect(((await water.logs(outsider, {})) as any).data).toHaveLength(0);
  });

  it('shows today’s water: which canals are scheduled, which have been logged, and the issues still open', async () => {
    const o: any = await water.overview(office);
    expect(o.canals[0]).toMatchObject({ scheduledToday: true, loggedToday: true, openIssues: 1 });
    expect(o.totals).toEqual({ scheduledToday: 1, loggedToday: 1, openIssues: 1 });
    expect(((await water.overview(outsider)) as any).canals).toHaveLength(0);
  });

  it('declares explicit permissions on every route: logging, resolving and scheduling are different rights', () => {
    const proto = WaterController.prototype as any;
    const handlers = Object.getOwnPropertyNames(proto).filter((n) => n !== 'constructor' && typeof proto[n] === 'function');
    for (const h of handlers) expect(Reflect.getMetadata(PERMISSION_KEY, proto[h])).toBeTruthy();
    expect(Reflect.getMetadata(PERMISSION_KEY, proto.log)).toEqual({ resource: 'water', action: 'CREATE' });
    expect(Reflect.getMetadata(PERMISSION_KEY, proto.createSchedule)).toEqual({ resource: 'water_schedules', action: 'CREATE' });
    expect(Reflect.getMetadata(PERMISSION_KEY, proto.resolve)).toEqual({ resource: 'water', action: 'EDIT' });
  });
});
