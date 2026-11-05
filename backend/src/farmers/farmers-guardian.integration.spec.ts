/**
 * Integration tests for naming a guardian when a farmer is registered on a hectare, against the throw-away `irrigation_test`
 * schema (scripts/irrigation-test-schema.sh). Skipped unless IRRIGATION_TEST_DATABASE_URL is set.
 */
import 'reflect-metadata';
import { randomUUID } from 'crypto';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaClient, UserRole } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { OwnershipService } from '../common/ownership.service';
import { FarmersService } from './farmers.service';

const BASE_URL = process.env.IRRIGATION_TEST_DATABASE_URL;
const SCHEMA = 'irrigation_test';
const describeDb = BASE_URL ? describe : describe.skip;

describeDb('Registering a farmer with a guardian (PostgreSQL)', () => {
  jest.setTimeout(120_000);
  let pool: Pool;
  let prisma: PrismaClient;
  let farmers: FarmersService;
  const phone = () => `+2557${Math.floor(Math.random() * 1e8)}`;

  async function coop() {
    const tag = randomUUID().slice(0, 6);
    const mamcos = await prisma.mamcos.create({ data: { name: `Coop ${tag}`, code: `C-${tag.toUpperCase()}` } });
    const scheme = await prisma.irrigationScheme.create({ data: { mamcosId: mamcos.id, code: `S-${tag}`, name: `Scheme ${tag}`, region: 'Mbeya', district: 'Mbarali', waterSource: 'River' } as any });
    const canal = await prisma.irrigationCanal.create({ data: { schemeId: scheme.id, canalNumber: 1, code: 'C01', name: 'Canal 01' } as any });
    const block = await prisma.irrigationBlock.create({ data: { canalId: canal.id, blockNumber: 1, side: 'RIGHT', code: `${tag}.1R`, areaHectares: 30, hectareCount: 30 } as any });
    const hectare = async (n: number) => prisma.irrigationHectare.create({ data: { blockId: block.id, hectareNumber: n, code: `${tag}.1R${n}`, areaHectares: 1 } });
    const staff = await prisma.user.create({ data: { phone: phone(), passwordHash: 'x', firstName: 'Reg', lastName: 'Admin', role: UserRole.CUSTOM } });
    const actor = { id: staff.id, role: UserRole.CUSTOM, mamcosId: mamcos.id } as any;
    const member = async (name: string, extra: object = {}) => {
      const u = await prisma.user.create({ data: { phone: phone(), passwordHash: 'x', role: UserRole.FARMER } });
      return prisma.farmer.create({ data: { userId: u.id, controlNumber: `M-${randomUUID().slice(0, 6)}`, firstName: name, lastName: 'Member', mamcosId: mamcos.id, ...extra } });
    };
    return { mamcos, hectare, actor, member };
  }
  type Coop = Awaited<ReturnType<typeof coop>>;
  const register = (c: Coop, hectareId: string, extra: object = {}) =>
    farmers.create({ phone: phone(), password: 'Secret123', firstName: 'Neema', lastName: 'Joseph', hectareId, ...extra } as any, c.actor) as Promise<any>;

  beforeAll(async () => {
    const url = `${BASE_URL!.split('?')[0]}?options=${encodeURIComponent(`-c search_path=${SCHEMA}`)}`;
    pool = new Pool({ connectionString: url, max: 6 });
    prisma = new PrismaClient({ adapter: new PrismaPg(pool, { schema: SCHEMA }) });
    farmers = new FarmersService(prisma as any, { get: () => 'GD' } as any, {} as any, {} as any, {} as any, new OwnershipService(prisma as any), {} as any);
  });
  afterAll(async () => { await prisma.$disconnect(); await pool.end(); });

  it('names the guardian on the new farmer’s hectare, who then guards it in their own name', async () => {
    const c = await coop();
    const guardian = await c.member('Baraka');
    const h = await c.hectare(1);
    const created = await register(c, h.id, { guardianId: guardian.id });
    const allocation = (await prisma.irrigationHectareAllocation.findFirst({ where: { hectareId: h.id, farmerId: created.id } }))!;
    expect(allocation.status).toBe('ACTIVE');
    const g = (await prisma.irrigationHectareGuardian.findFirst({ where: { allocationId: allocation.id } }))!;
    expect(g.guardianId).toBe(guardian.id);
    expect(g.endedOn).toBeNull();
    expect(g.note).toBe('Named when the farmer was registered');
    expect(await prisma.auditLog.count({ where: { entityId: h.id, action: 'irrigation_hectare.set-guardian' } })).toBe(1);
  });

  it('the guardian is optional: registering without one leaves the hectare with no guardian', async () => {
    const c = await coop();
    const h = await c.hectare(2);
    const created = await register(c, h.id);
    const allocation = (await prisma.irrigationHectareAllocation.findFirst({ where: { hectareId: h.id, farmerId: created.id } }))!;
    expect(await prisma.irrigationHectareGuardian.count({ where: { allocationId: allocation.id } })).toBe(0);
  });

  it('one member can guard several new hectares', async () => {
    const c = await coop();
    const guardian = await c.member('Baraka');
    await register(c, (await c.hectare(3)).id, { guardianId: guardian.id });
    await register(c, (await c.hectare(4)).id, { guardianId: guardian.id });
    expect(await prisma.irrigationHectareGuardian.count({ where: { guardianId: guardian.id, endedOn: null } })).toBe(2);
  });

  it('refuses a guardian without a hectare, one from another cooperative, a blacklisted one, or one who does not exist, and registers nobody', async () => {
    const c = await coop();
    const other = await coop();
    const stranger = await other.member('Outsider');
    const blocked = await c.member('Blocked', { isBlacklisted: true });
    const ok = await c.member('Fine');
    const h = await c.hectare(5);
    const before = await prisma.farmer.count({ where: { mamcosId: c.mamcos.id } });
    await expect(farmers.create({ phone: phone(), password: 'Secret123', firstName: 'A', lastName: 'B', guardianId: ok.id } as any, c.actor)).rejects.toThrow('Choose a hectare before naming a guardian');
    await expect(register(c, h.id, { guardianId: stranger.id })).rejects.toBeInstanceOf(BadRequestException);
    await expect(register(c, h.id, { guardianId: blocked.id })).rejects.toThrow('blacklisted');
    await expect(register(c, h.id, { guardianId: randomUUID() })).rejects.toBeInstanceOf(NotFoundException);
    expect(await prisma.farmer.count({ where: { mamcosId: c.mamcos.id } })).toBe(before);
    expect(await prisma.irrigationHectareAllocation.count({ where: { hectareId: h.id } })).toBe(0);
  });
});
