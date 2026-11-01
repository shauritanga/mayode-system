/**
 * Integration tests for AMCOS codes and join requests against the throw-away `irrigation_test` schema
 * (scripts/irrigation-test-schema.sh). Skipped unless IRRIGATION_TEST_DATABASE_URL is set.
 */
import 'reflect-metadata';
import { randomUUID } from 'crypto';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaClient, UserRole } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import type { RequestUser } from '../common/ownership.service';
import { OwnershipService } from '../common/ownership.service';
import { AuthService } from '../auth/auth.service';
import { JoinRequestsService } from './join-requests.service';
import { FarmerCredentialsService } from '../farmers/farmer-credentials.service';
import { FarmersService } from '../farmers/farmers.service';
import { generateAmcosCode, normalizeAmcosCode } from './amcos-code';

const BASE_URL = process.env.IRRIGATION_TEST_DATABASE_URL;
const SCHEMA = 'irrigation_test';
const describeDb = BASE_URL ? describe : describe.skip;

describeDb('AMCOS codes and join requests (PostgreSQL)', () => {
  jest.setTimeout(120_000);
  let pool: Pool;
  let prisma: PrismaClient;
  let auth: AuthService;
  let requests: JoinRequestsService;
  let madibira: { id: string; code: string };
  let ubaruku: { id: string; code: string };
  let adminA: RequestUser;
  let adminB: RequestUser;
  const phone = () => `+2557${Math.floor(Math.random() * 1e8).toString().padStart(8, '0')}`;

  const register = (extra: Record<string, unknown> = {}) =>
    auth.registerVerifiedFarmer({ phone: phone(), firstName: 'Asha', lastName: 'Mwita', dataShareConsent: true, ...extra } as any);
  const farmerOf = async (userId: string) => prisma.farmer.findUniqueOrThrow({ where: { userId } });

  beforeAll(async () => {
    const url = `${BASE_URL!.split('?')[0]}?options=${encodeURIComponent(`-c search_path=${SCHEMA}`)}`;
    pool = new Pool({ connectionString: url, max: 6 });
    prisma = new PrismaClient({ adapter: new PrismaPg(pool, { schema: SCHEMA }) });
    const [{ current_schema }] = await prisma.$queryRawUnsafe<{ current_schema: string }[]>('select current_schema()');
    expect(current_schema).toBe(SCHEMA);

    const jwt: any = { sign: () => randomUUID(), signAsync: async () => randomUUID(), verify: () => ({}) };
    const config: any = { get: (key: string) => (key === 'CONTROL_NUMBER_PREFIX' ? 'JR' : undefined) };
    auth = new AuthService(prisma as any, jwt, config, { sendTransactional: async () => true } as any);
    requests = new JoinRequestsService(prisma as any, new OwnershipService(prisma as any));

    const make = async (name: string) => {
      const code = generateAmcosCode(name);
      const m = await prisma.mamcos.create({ data: { name: `${name} ${randomUUID().slice(0, 5)}`, code } });
      return { id: m.id, code };
    };
    madibira = await make('Madibira AMCOS');
    ubaruku = await make('Ubaruku AMCOS');
    const asAdmin = (mamcosId: string): RequestUser => ({
      id: randomUUID(), role: UserRole.CUSTOM, mamcosId,
      customRole: { isActive: true, isSystem: false, permissions: [{ action: 'VIEW', resource: { key: 'farmers' } }, { action: 'EDIT', resource: { key: 'farmers' } }] },
    });
    adminA = asAdmin(madibira.id);
    adminB = asAdmin(ubaruku.id);
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await pool.end();
  });

  it('makes readable codes and matches them ignoring case, spaces and the dash', () => {
    expect(generateAmcosCode('Madibira AMCOS')).toMatch(/^MAD-[0-9A-F]{6}$/);
    expect(normalizeAmcosCode(' mad-4f2a91 ')).toBe('MAD4F2A91');
  });

  it('lets a farmer register with no AMCOS at all', async () => {
    const res: any = await register();
    expect(res.joinRequest).toBeUndefined();
    expect((await farmerOf(res.user.id)).mamcosId).toBeNull();
    expect(await prisma.amcosJoinRequest.count({ where: { farmerId: (await farmerOf(res.user.id)).id } })).toBe(0);
  });

  it('turns a sign-up code into a pending request and does not join the AMCOS until approved', async () => {
    const res: any = await register({ amcosCode: madibira.code.toLowerCase().replace('-', ' ') });
    expect(res.joinRequest).toMatchObject({ status: 'PENDING' });
    const farmer = await farmerOf(res.user.id);
    expect(farmer.mamcosId).toBeNull();
    const list: any = await requests.list(adminA, {});
    const row = list.data.find((r: any) => r.farmer.id === farmer.id);
    expect(row).toMatchObject({ status: 'PENDING', farmer: { name: 'Asha Mwita' } });
    expect(list.amcos.code).toBe(madibira.code);

    await requests.approve(adminA, row.id);
    expect(await farmerOf(res.user.id)).toMatchObject({ mamcosId: madibira.id, verificationStatus: 'VERIFIED' });
    expect((await prisma.amcosJoinRequest.findUniqueOrThrow({ where: { id: row.id } })).status).toBe('APPROVED');
    await expect(requests.approve(adminA, row.id)).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects an unknown code before any account is created', async () => {
    const before = await prisma.user.count();
    await expect(register({ amcosCode: 'NOP-000000' })).rejects.toBeInstanceOf(BadRequestException);
    expect(await prisma.user.count()).toBe(before);
  });

  it('only the AMCOS that was asked can see or decide a request', async () => {
    const res: any = await register({ amcosCode: ubaruku.code });
    const farmer = await farmerOf(res.user.id);
    expect((await requests.list(adminA, {}) as any).data.some((r: any) => r.farmer.id === farmer.id)).toBe(false);
    const row = (await requests.list(adminB, {}) as any).data.find((r: any) => r.farmer.id === farmer.id);
    await expect(requests.approve(adminA, row.id)).rejects.toBeInstanceOf(NotFoundException);
    await expect(requests.list(adminA, { mamcosId: ubaruku.id })).rejects.toBeInstanceOf(ForbiddenException);
    await requests.reject(adminB, row.id, 'Not on our register');
    expect((await farmerOf(res.user.id)).mamcosId).toBeNull();
    expect(await prisma.amcosJoinRequest.findUniqueOrThrow({ where: { id: row.id } })).toMatchObject({ status: 'REJECTED', rejectedReason: 'Not on our register' });
  });

  it('lets an independent farmer ask later, but only one request at a time and never while in another AMCOS', async () => {
    const res: any = await register();
    const user: RequestUser = { id: res.user.id, role: UserRole.FARMER, mamcosId: null };
    const first = await requests.request(user, madibira.code);
    expect(first.status).toBe('PENDING');
    await expect(requests.request(user, ubaruku.code)).rejects.toThrow(/already have a request/);
    expect((await requests.mine(user)).request).toMatchObject({ status: 'PENDING', amcosName: expect.stringContaining('Madibira') });
    await requests.cancel(user, first.id);
    expect((await requests.mine(user)).request?.status).toBe('CANCELLED');
    const again = await requests.request(user, madibira.code);
    await requests.approve(adminA, again.id);
    await expect(requests.request(user, ubaruku.code)).rejects.toThrow(/already belong to another AMCOS/);
    await expect(requests.request(user, madibira.code)).rejects.toThrow(/already a member/);
  });

  it('shows only the AMCOS name when a code is looked up', async () => {
    expect(await requests.lookup(madibira.code)).toEqual({ name: expect.stringContaining('Madibira') });
    await expect(requests.lookup('ZZZ-999999')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('the database allows one pending request per farmer', async () => {
    const res: any = await register({ amcosCode: madibira.code });
    const farmer = await farmerOf(res.user.id);
    await expect(prisma.$executeRawUnsafe(
      `insert into amcos_join_requests (id, farmer_id, mamcos_id, status, updated_at) values ('${randomUUID()}', '${farmer.id}', '${ubaruku.id}', 'PENDING', now())`,
    )).rejects.toThrow();
  });

  it('farmer overview numbers cover only the signed-in AMCOS', async () => {
    const farmers = new FarmersService(prisma as any, {} as any, {} as any, {} as any, {} as any, new OwnershipService(prisma as any), {} as any);
    const own = await prisma.farmer.count({ where: { mamcosId: madibira.id } });
    const everyone = await prisma.farmer.count();
    expect(everyone).toBeGreaterThan(own);
    expect((await farmers.getOverview(adminA)).total).toBe(own);
    expect((await farmers.findAllUnpaginated(adminA)).every((f) => f.mamcosId === madibira.id)).toBe(true);
    expect((await farmers.getOverview()).total).toBe(everyone); // platform view is unchanged
  });

  it("registers a farmer on a free hectare, and that hectare's code becomes their ID", async () => {
    const farmers = new FarmersService(prisma as any, { get: () => 'JR' } as any, {} as any, {} as any, {} as any, new OwnershipService(prisma as any), {} as any);
    const tag = randomUUID().slice(0, 6);
    const scheme = await prisma.irrigationScheme.create({ data: { mamcosId: madibira.id, code: `HR-${tag}`, name: `Scheme ${tag}`, region: 'Mbeya', district: 'Mbarali', waterSource: 'River' } as any });
    const canal = await prisma.irrigationCanal.create({ data: { schemeId: scheme.id, canalNumber: 5, code: 'C05', name: 'Canal 05' } as any });
    const block = await prisma.irrigationBlock.create({ data: { canalId: canal.id, blockNumber: 15, side: 'RIGHT', code: '5.15R', areaHectares: 30, hectareCount: 30 } });
    const hectare = await prisma.irrigationHectare.create({ data: { blockId: block.id, hectareNumber: 12, code: '5.15R12', areaHectares: 1 } });

    // The allocation is audited against a real user, so the registering admin needs a row.
    const staff = await prisma.user.create({ data: { phone: phone(), passwordHash: 'x', firstName: 'Reg', lastName: 'Admin', role: UserRole.CUSTOM } });
    const registrar = { ...adminA, id: staff.id };
    const created: any = await farmers.create({ phone: phone(), password: 'Secret123', firstName: 'Neema', lastName: 'Joseph', hectareId: hectare.id } as any, registrar);
    expect(created.controlNumber).toBe('5.15R12');
    expect(created.mamcosId).toBe(madibira.id);
    expect(created.verificationStatus).toBe('VERIFIED');
    const allocation = await prisma.irrigationHectareAllocation.findFirstOrThrow({ where: { hectareId: hectare.id } });
    expect(allocation).toMatchObject({ farmerId: created.id, status: 'ACTIVE' });

    // The hectare now belongs to someone, so nobody else can be registered on it.
    await expect(farmers.create({ phone: phone(), password: 'Secret123', firstName: 'Juma', lastName: 'Ali', hectareId: hectare.id } as any, registrar)).rejects.toBeInstanceOf(ConflictException);
    // Another AMCOS cannot use it either.
    await expect(farmers.create({ phone: phone(), password: 'Secret123', firstName: 'Juma', lastName: 'Ali', hectareId: hectare.id } as any, adminB)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('texts a new farmer their sign-in details without the password reaching the log', async () => {
    const sent: any[] = [];
    const sms: any = { sendTransactional: async (...args: any[]) => { sent.push(args); return true; } };
    const credentials = new FarmerCredentialsService(sms, { get: () => undefined } as any);
    const password = credentials.temporaryPassword();
    expect(password).toMatch(/^(?=.*[A-Za-z])(?=.*\d).{10}$/);
    expect(await credentials.send('+255712345678', 'Neema', 'en', password)).toBe(true);
    const [to, text, kind, logged] = sent[0];
    expect(to).toBe('+255712345678');
    expect(text).toContain(password);
    expect(text).toContain('farmer account');
    expect(logged).not.toContain(password);
    expect(kind).toBe('farmer_credentials');
  });
});
