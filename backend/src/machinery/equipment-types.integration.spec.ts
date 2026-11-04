/**
 * Integration tests for the machine types each AMCOS keeps in Settings, against the throw-away `irrigation_test` schema
 * (scripts/irrigation-test-schema.sh). Skipped unless IRRIGATION_TEST_DATABASE_URL is set.
 */
import 'reflect-metadata';
import { randomUUID } from 'crypto';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaClient, UserRole } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { OwnershipService } from '../common/ownership.service';
import { AccountingService } from '../accounting/accounting.service';
import { MachineryService } from './machinery.service';
import { PERMISSION_KEY } from '../auth/decorators/require-permission.decorator';
import { MachineryController } from './machinery.controller';

const BASE_URL = process.env.IRRIGATION_TEST_DATABASE_URL;
const SCHEMA = 'irrigation_test';
const describeDb = BASE_URL ? describe : describe.skip;

describeDb('Machine types in Settings (PostgreSQL)', () => {
  jest.setTimeout(120_000);
  let pool: Pool;
  let prisma: PrismaClient;
  let svc: MachineryService;
  const coop = async () => {
    const tag = randomUUID().slice(0, 6);
    const m = await prisma.mamcos.create({ data: { name: `Coop ${tag}`, code: `C-${tag.toUpperCase()}` } });
    return { id: m.id, actor: { id: randomUUID(), role: UserRole.CUSTOM, mamcosId: m.id } as any };
  };
  const machine = (c: Awaited<ReturnType<typeof coop>>, name: string, extra: object) =>
    svc.createEquipment(c.actor, { name, ownership: 'AMCOS', ...extra } as any) as Promise<any>;

  beforeAll(async () => {
    const url = `${BASE_URL!.split('?')[0]}?options=${encodeURIComponent(`-c search_path=${SCHEMA}`)}`;
    pool = new Pool({ connectionString: url, max: 6 });
    prisma = new PrismaClient({ adapter: new PrismaPg(pool, { schema: SCHEMA }) });
    const ownership = new OwnershipService(prisma as any);
    svc = new MachineryService(prisma as any, ownership, new AccountingService(prisma as any, ownership));
  });
  afterAll(async () => { await prisma.$disconnect(); await pool.end(); });

  it('starts empty: the AMCOS lists the machines it actually has', async () => {
    const c = await coop();
    expect(await svc.listTypes(c.actor)).toEqual([]);
  });

  it('adds a type, once, ignoring case and extra spaces, and shows it with how many machines use it', async () => {
    const c = await coop();
    const t: any = await svc.createType(c.actor, { name: '  Water   pump ' });
    expect(t.name).toBe('Water pump');
    await expect(svc.createType(c.actor, { name: 'water PUMP' })).rejects.toBeInstanceOf(ConflictException);
    await expect(svc.createType(c.actor, { name: 'x' })).rejects.toBeInstanceOf(BadRequestException);
    await machine(c, 'Pump 1', { typeId: t.id });
    const list: any[] = await svc.listTypes(c.actor);
    expect(list).toMatchObject([{ name: 'Water pump', machines: 1 }]);
  });

  it('saves a machine under the chosen type and lists it by that name', async () => {
    const c = await coop();
    const t: any = await svc.createType(c.actor, { name: 'Rice reaper' });
    const m = await machine(c, 'Reaper A', { typeId: t.id });
    expect(m.typeId).toBe(t.id);
    const items: any[] = await svc.listEquipment(c.actor, {});
    expect(items.find((e) => e.id === m.id)).toMatchObject({ typeName: 'Rice reaper', type: 'OTHER' });
  });

  it('a standard name keeps its standard kind, and renaming changes what is shown everywhere', async () => {
    const c = await coop();
    const t: any = await svc.createType(c.actor, { name: 'Tractor' });
    const m = await machine(c, 'John Deere', { typeId: t.id });
    expect(m.type).toBe('TRACTOR');
    await svc.updateType(c.actor, t.id, { name: 'Farm tractor' });
    const items: any[] = await svc.listEquipment(c.actor, {});
    expect(items.find((e) => e.id === m.id)!.typeName).toBe('Farm tractor');
  });

  it('a switched-off type can no longer be chosen, but machines keep it', async () => {
    const c = await coop();
    const t: any = await svc.createType(c.actor, { name: 'Old thresher' });
    const m = await machine(c, 'T1', { typeId: t.id });
    await svc.updateType(c.actor, t.id, { isActive: false });
    await expect(machine(c, 'T2', { typeId: t.id })).rejects.toThrow('switched off');
    expect((await svc.listTypes(c.actor)).length).toBe(0);
    expect((await svc.listTypes(c.actor, { includeInactive: 'true' })).length).toBe(1);
    expect((await prisma.amcosEquipment.findUnique({ where: { id: m.id } }))!.typeId).toBe(t.id);
    // Adding it again switches it back on instead of duplicating it.
    const again: any = await svc.createType(c.actor, { name: 'old thresher' });
    expect(again.id).toBe(t.id);
    expect(again.isActive).toBe(true);
  });

  it('needs a type, and a type from another AMCOS is not found', async () => {
    const a = await coop();
    const b = await coop();
    await expect(machine(a, 'No type', {})).rejects.toThrow('Choose the type of machine');
    const other: any = await svc.createType(b.actor, { name: 'Trailer' });
    await expect(machine(a, 'Stolen type', { typeId: other.id })).rejects.toBeInstanceOf(NotFoundException);
    expect(await svc.listTypes(a.actor)).toEqual([]);
  });

  it('older callers that send a standard kind still work and add it to the list', async () => {
    const c = await coop();
    const m = await machine(c, 'Legacy', { type: 'SPRAYER' });
    expect(m.type).toBe('SPRAYER');
    expect((await svc.listTypes(c.actor)).map((t: any) => t.name)).toEqual(['Sprayer']);
    await machine(c, 'Legacy 2', { type: 'SPRAYER' });
    expect(await svc.listTypes(c.actor)).toHaveLength(1);
  });

  it('reading the list needs machinery view rights; changing it needs create or edit rights', () => {
    const need = (method: string) => Reflect.getMetadata(PERMISSION_KEY, (MachineryController.prototype as any)[method]);
    expect(need('types')).toMatchObject({ resource: 'machinery', action: 'VIEW' });
    expect(need('createType')).toMatchObject({ resource: 'machinery', action: 'CREATE' });
    expect(need('updateType')).toMatchObject({ resource: 'machinery', action: 'EDIT' });
  });
});
