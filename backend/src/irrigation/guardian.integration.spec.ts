/**
 * Integration tests for hectare guardians (the real owner of a hectare registered in a relative's name) against the
 * throw-away `irrigation_test` schema (scripts/irrigation-test-schema.sh). Skipped unless IRRIGATION_TEST_DATABASE_URL is set.
 */
import 'reflect-metadata';
import { randomUUID } from 'crypto';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaClient, UserRole } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import type { RequestUser } from '../common/ownership.service';
import { PERMISSION_KEY } from '../auth/decorators/require-permission.decorator';
import { IrrigationController } from './irrigation.controller';
import { IrrigationScopeService } from './irrigation-scope.service';
import { SchemesService } from './schemes.service';
import { DebtExposureService } from './debt-exposure.service';
import { StructureService } from './structure.service';
import { AllocationService } from './allocation.service';

const BASE_URL = process.env.IRRIGATION_TEST_DATABASE_URL;
const SCHEMA = 'irrigation_test';
const describeDb = BASE_URL ? describe : describe.skip;

describeDb('Hectare guardians (PostgreSQL)', () => {
  jest.setTimeout(120_000);
  let pool: Pool;
  let prisma: PrismaClient;
  let allocations: AllocationService;
  let structure: StructureService;
  let admin: RequestUser;
  let otherAdmin: RequestUser;
  let approver: RequestUser;
  let mamcosA: string;
  let mamcosB: string;
  let hectares: string[] = [];
  const f: Record<string, string> = {};
  const allocationOf: Record<string, string> = {};

  const MANAGER = {
    isActive: true, isSystem: false,
    permissions: [['irrigation', 'VIEW'], ['irrigation', 'EDIT'], ['irrigation_allocations', 'VIEW'], ['irrigation_allocations', 'CREATE'], ['irrigation_allocations', 'EDIT']]
      .map(([resource, action]) => ({ action, resource: { key: resource } })),
  };
  const APPROVER = { ...MANAGER, permissions: [...MANAGER.permissions, { action: 'EDIT', resource: { key: 'irrigation_transfer_approval' } }] };
  const user = async (mamcosId: string, role: any = MANAGER): Promise<RequestUser> => {
    const id = randomUUID();
    await prisma.user.create({ data: { id, phone: `+2557${Math.floor(Math.random() * 1e8).toString().padStart(8, '0')}`, passwordHash: 'x', role: UserRole.CUSTOM, mamcosId, firstName: 'Admin', lastName: 'Test' } });
    return { id, role: UserRole.CUSTOM, mamcosId, customRole: role } as RequestUser;
  };
  const farmer = async (mamcosId: string, name: string) => {
    const userId = randomUUID();
    await prisma.user.create({ data: { id: userId, phone: `+2556${Math.floor(Math.random() * 1e8).toString().padStart(8, '0')}`, passwordHash: 'x', role: UserRole.FARMER } });
    f[name] = (await prisma.farmer.create({ data: { userId, controlNumber: `G-${randomUUID().slice(0, 6)}`, firstName: name, lastName: 'Mbarali', mamcosId } })).id;
  };
  const detail = async (name: string) => (await allocations.farmerDetail(admin, f[name])) as any;

  beforeAll(async () => {
    const url = `${BASE_URL!.split('?')[0]}?options=${encodeURIComponent(`-c search_path=${SCHEMA}`)}`;
    pool = new Pool({ connectionString: url, max: 6 });
    prisma = new PrismaClient({ adapter: new PrismaPg(pool, { schema: SCHEMA }) });
    const [{ current_schema }] = await prisma.$queryRawUnsafe<{ current_schema: string }[]>('select current_schema()');
    expect(current_schema).toBe(SCHEMA);
    const scope = new IrrigationScopeService(prisma as any);
    const schemes = new SchemesService(prisma as any, scope);
    structure = new StructureService(prisma as any, scope, schemes, new DebtExposureService(prisma as any));
    allocations = new AllocationService(prisma as any, scope, structure, { send: async () => undefined } as any, { create: async () => ({}) } as any);
    const tag = randomUUID().slice(0, 5);
    mamcosA = (await prisma.mamcos.create({ data: { name: `Madibira G ${tag}` } })).id;
    mamcosB = (await prisma.mamcos.create({ data: { name: `Ubaruku G ${tag}` } })).id;
    admin = await user(mamcosA);
    otherAdmin = await user(mamcosB);
    approver = await user(mamcosA, APPROVER);
    for (const n of ['Juma', 'Asha', 'Neema', 'Hawa', 'Zawadi']) await farmer(mamcosA, n);
    await farmer(mamcosB, 'Outsider');
    const scheme = await prisma.irrigationScheme.create({ data: { mamcosId: mamcosA, name: `Scheme ${tag}`, code: `G-${tag}`, maxHectaresPerFarmer: 1 } });
    const canal = await prisma.irrigationCanal.create({ data: { schemeId: scheme.id, canalNumber: 1, code: 'C01', name: 'Canal 01' } });
    const block = await prisma.irrigationBlock.create({ data: { canalId: canal.id, blockNumber: 1, code: `G-C01-B01-${tag}`, areaHectares: 30, hectareCount: 30 } });
    for (let n = 1; n <= 6; n++) hectares.push((await prisma.irrigationHectare.create({ data: { blockId: block.id, hectareNumber: n, code: `GH${n}` } })).id);
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await pool.end();
  });

  it('one member owns four hectares: one in their own name and three registered to relatives', async () => {
    allocationOf.Juma = ((await allocations.allocate(admin, { hectareId: hectares[0], farmerId: f.Juma })) as any).id;
    for (const [i, rel] of ['Asha', 'Neema', 'Hawa'].entries()) {
      allocationOf[rel] = ((await allocations.allocate(admin, { hectareId: hectares[i + 1], farmerId: f[rel], guardianId: f.Juma })) as any).id;
    }
    // the one-hectare limit still holds for the member's own name
    await expect(allocations.allocate(admin, { hectareId: hectares[4], farmerId: f.Juma })).rejects.toBeInstanceOf(ConflictException);
    const juma = await detail('Juma');
    expect(juma.current).toHaveLength(1);
    expect(juma.guided.current.map((g: any) => g.holder.name).sort()).toEqual(['Asha Mbarali', 'Hawa Mbarali', 'Neema Mbarali']);
    expect(juma.guided.current[0]).toMatchObject({ hectare: { areaHectares: 1 }, canal: { code: 'C01' } });
  });

  it("shows the guardian on the holder's profile, the allocation list and the hectare", async () => {
    expect(((await detail('Asha')).current[0]).guardian).toMatchObject({ name: 'Juma Mbarali' });
    expect((await detail('Asha')).guided.current).toHaveLength(0);
    const list: any = await allocations.listAllocations(admin, { status: 'ACTIVE' });
    expect(list.data.find((a: any) => a.farmer.name === 'Neema Mbarali').guardian.name).toBe('Juma Mbarali');
    expect(list.data.find((a: any) => a.farmer.name === 'Juma Mbarali').guardian).toBeNull();
    const h: any = await structure.getHectare(admin, hectares[1]);
    expect(h.guardian.name).toBe('Juma Mbarali');
    expect(h.history[0].guardians[0]).toMatchObject({ name: 'Juma Mbarali', endedOn: null });
  });

  it('refuses a guardian who is the holder, another AMCOS member, or already the guardian', async () => {
    await expect(allocations.setGuardian(admin, allocationOf.Asha, { guardianId: f.Asha })).rejects.toThrow(/different member/);
    await expect(allocations.setGuardian(admin, allocationOf.Asha, { guardianId: f.Outsider })).rejects.toThrow(/not a member of the AMCOS/);
    await expect(allocations.setGuardian(admin, allocationOf.Asha, { guardianId: f.Juma })).rejects.toThrow(/already the guardian/);
    await expect(allocations.allocate(admin, { hectareId: hectares[4], farmerId: f.Zawadi, guardianId: f.Zawadi })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('changes the guardian and keeps the earlier one in the history', async () => {
    await allocations.setGuardian(admin, allocationOf.Asha, { guardianId: f.Zawadi, note: 'Zawadi bought it from Juma' });
    expect((await detail('Juma')).guided.current).toHaveLength(2);
    expect((await detail('Juma')).guided.history[0]).toMatchObject({ endReason: 'REPLACED', holder: { name: 'Asha Mbarali' } });
    expect((await detail('Zawadi')).guided.current.map((g: any) => g.holder.name)).toEqual(['Asha Mbarali']);
  });

  it('adds or ends a guardian on an existing allocation', async () => {
    await allocations.endGuardian(admin, allocationOf.Hawa, 'Handed over to Hawa');
    expect((await detail('Hawa')).current[0].guardian).toBeNull();
    await expect(allocations.endGuardian(admin, allocationOf.Hawa, 'again')).rejects.toBeInstanceOf(NotFoundException);
    expect((await detail('Juma')).guided.history.some((g: any) => g.endReason === 'ENDED: Handed over to Hawa')).toBe(true);
    await allocations.setGuardian(admin, allocationOf.Hawa, { guardianId: f.Juma }); // a hectare can get a guardian later
    expect((await detail('Juma')).guided.current.map((g: any) => g.holder.name).sort()).toEqual(['Hawa Mbarali', 'Neema Mbarali']);
  });

  it('handing the hectare over completely ends the guardian\'s part', async () => {
    const requested: any = await allocations.createTransfer(admin, { hectareId: hectares[2], toFarmerId: f.Zawadi, reason: 'Neema gives the hectare to Zawadi' });
    expect(requested.status).toBe('PENDING_APPROVAL');
    const result: any = await allocations.approveTransfer(approver, requested.id);
    expect(result.status).toBe('COMPLETED');
    const juma = await detail('Juma');
    expect(juma.guided.current.map((g: any) => g.holder.name)).toEqual(['Hawa Mbarali']);
    expect(juma.guided.history.find((g: any) => g.holder.name === 'Neema Mbarali')).toMatchObject({ endReason: 'OWNERSHIP_TRANSFERRED' });
    const zawadi = await detail('Zawadi');
    expect(zawadi.current.find((c: any) => c.hectare.id === hectares[2])).toMatchObject({ guardian: null });
  });

  it('releasing a hectare ends its guardianship too', async () => {
    await allocations.release(admin, allocationOf.Hawa, 'Left the scheme');
    expect((await detail('Juma')).guided.current).toHaveLength(0);
    expect((await detail('Juma')).guided.history.some((g: any) => g.holder.name === 'Hawa Mbarali' && g.endReason === 'RELEASED')).toBe(true);
  });

  it('stays within one AMCOS', async () => {
    await expect(allocations.setGuardian(otherAdmin, allocationOf.Asha, { guardianId: f.Outsider })).rejects.toBeInstanceOf(NotFoundException);
    await expect(allocations.endGuardian(otherAdmin, allocationOf.Asha, 'x')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('keeps the history in the database: one current guardian per allocation, no deletes', async () => {
    const allocationId = allocationOf.Asha;
    await expect(prisma.$executeRawUnsafe(`insert into irrigation_hectare_guardians (id, allocation_id, guardian_id, started_on) values ('${randomUUID()}', '${allocationId}', '${f.Juma}', current_date)`)).rejects.toThrow(); // Zawadi is current
    await expect(prisma.$executeRawUnsafe(`delete from irrigation_hectare_guardians`)).rejects.toThrow(/historical/);
    await expect(prisma.$executeRawUnsafe(`update irrigation_hectare_guardians set ended_on = current_date where ended_on is null and allocation_id = '${allocationId}'`)).rejects.toThrow(/end_consistent|check/);
  });

  it('guardian routes need the allocation edit permission', () => {
    const proto = IrrigationController.prototype as any;
    for (const name of ['setGuardian', 'endGuardian']) expect(Reflect.getMetadata(PERMISSION_KEY, proto[name])).toEqual({ resource: 'irrigation_allocations', action: 'EDIT' });
  });
});
