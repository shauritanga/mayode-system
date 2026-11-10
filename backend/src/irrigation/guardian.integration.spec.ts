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
import { EmancipationService } from './emancipation.service';

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
  const uid: Record<string, string> = {};
  const asUser = (name: string) => ({ id: uid[name], role: UserRole.FARMER } as RequestUser);
  const texts: { to: string; text: string }[] = [];
  let emancipation: EmancipationService;

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
    uid[name] = userId;
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
    const sms: any = { send: async (to: string, text: string) => { texts.push({ to, text }); } };
    const notifications: any = { create: async () => ({}) };
    allocations = new AllocationService(prisma as any, scope, structure, sms, notifications);
    emancipation = new EmancipationService(prisma as any, scope, sms, notifications);
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
    expect(requested.status).toBe('AWAITING_RECIPIENT'); // the receiving member is always asked first
    await expect(allocations.approveTransfer(approver, requested.id)).rejects.toThrow(/has not accepted/);
    expect(((await allocations.respondToTransfer(asUser('Zawadi'), requested.id, true)) as any).status).toBe('PENDING_APPROVAL');
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

  it('lets a member start a transfer of their own hectare; the receiver is asked, and it can be withdrawn', async () => {
    const me = asUser('Juma');
    const before = (await allocations.myPlots(me)) as any;
    expect(before.held.map((h: any) => h.hectare.code)).toEqual(['GH1']);
    const hawaNumber = (await prisma.farmer.findUniqueOrThrow({ where: { id: f.Hawa } })).controlNumber;
    await expect(allocations.requestMyTransfer(asUser('Asha'), { hectareId: hectares[0], toMember: hawaNumber, reason: 'x' })).rejects.toThrow(/registered to you/); // not theirs
    await expect(allocations.requestMyTransfer(me, { hectareId: hectares[0], toMember: 'NOPE-1', reason: 'x' })).rejects.toThrow(/No member of your AMCOS/);
    const outsiderNumber = (await prisma.farmer.findUniqueOrThrow({ where: { id: f.Outsider } })).controlNumber;
    await expect(allocations.requestMyTransfer(me, { hectareId: hectares[0], toMember: outsiderNumber, reason: 'x' })).rejects.toThrow(/No member of your AMCOS/); // another AMCOS
    texts.length = 0;
    const t: any = await allocations.requestMyTransfer(me, { hectareId: hectares[0], toMember: hawaNumber, reason: 'Selling to Hawa' });
    expect(t).toMatchObject({ status: 'AWAITING_RECIPIENT', fromFarmerId: f.Juma, toFarmerId: f.Hawa, requestedById: uid.Juma });
    const hawaPhone = (await prisma.user.findUniqueOrThrow({ where: { id: uid.Hawa } })).phone;
    expect(texts.some((m) => m.to === hawaPhone && /Open the MAYODE app to accept/.test(m.text))).toBe(true);
    await expect(allocations.requestMyTransfer(me, { hectareId: hectares[0], toMember: hawaNumber, reason: 'again' })).rejects.toThrow(/already awaiting/);
    expect(((await allocations.myPlots(me)) as any).outgoing).toHaveLength(1);
    await expect(allocations.cancelMyTransfer(asUser('Asha'), t.id)).rejects.toBeInstanceOf(NotFoundException);
    expect(await allocations.cancelMyTransfer(me, t.id)).toEqual({ status: 'CANCELLED' });
    expect(((await allocations.myPlots(me)) as any).outgoing).toHaveLength(0);
  });

  it('emancipation: the guardian asks, the office approves, the guardianship ends and the member is independent', async () => {
    // Asha is registered to a hectare guarded by Zawadi (changed earlier).
    const allocationId = allocationOf.Asha;
    await prisma.farmer.update({ where: { id: f.Asha }, data: { dateOfBirth: new Date(Date.now() - 16 * 365.25 * 86_400_000) } });
    await expect(emancipation.requestMine(asUser('Zawadi'), { allocationId })).rejects.toThrow(/not yet 18/);
    await prisma.farmer.update({ where: { id: f.Asha }, data: { dateOfBirth: new Date(Date.now() - 19 * 365.25 * 86_400_000) } });
    await expect(emancipation.requestMine(asUser('Hawa'), { allocationId })).rejects.toThrow(/Only the guardian/); // a stranger cannot ask
    await expect(emancipation.requestMine(asUser('Juma'), { allocationId })).rejects.toThrow(/Only the guardian/); // the earlier guardian no longer can
    const req: any = await emancipation.requestMine(asUser('Zawadi'), { allocationId, note: 'Asha turned 19' });
    expect(req).toMatchObject({ status: 'PENDING_APPROVAL', holderId: f.Asha, guardianId: f.Zawadi });
    await expect(emancipation.requestMine(asUser('Asha'), { allocationId })).rejects.toBeInstanceOf(ConflictException); // one open request
    expect(((await emancipation.list(admin, { status: 'PENDING_APPROVAL' })) as any).data[0]).toMatchObject({ holder: { name: 'Asha Mbarali', age: 19 }, guardian: { name: 'Zawadi Mbarali' } });
    expect((await allocations.myPlots(asUser('Zawadi')) as any).guided.find((g: any) => g.allocationId === allocationId).emancipationRequested).toBe(true);

    await expect(emancipation.approve(admin, req.id)).rejects.toThrow(/Manager or Accountant/); // no approval permission
    texts.length = 0;
    const done: any = await emancipation.approve(approver, req.id, 'Birth certificate seen');
    expect(done.status).toBe('APPROVED');
    expect((await detail('Asha')).current[0].guardian).toBeNull();
    expect((await detail('Zawadi')).guided.history.some((g: any) => g.holder.name === 'Asha Mbarali' && g.endReason === 'EMANCIPATED')).toBe(true);
    expect(texts.length).toBe(2); // Asha and Zawadi are both told
    await expect(emancipation.approve(approver, req.id)).rejects.toBeInstanceOf(ConflictException);
    await expect(emancipation.requestMine(asUser('Zawadi'), { allocationId })).rejects.toThrow(/no guardian/);
  });

  it('emancipation can be rejected with a reason, withdrawn, filed at the office, and stays inside one AMCOS', async () => {
    await farmer(mamcosA, 'Baraka');
    const allocationId = ((await allocations.allocate(admin, { hectareId: hectares[4], farmerId: f.Baraka, guardianId: f.Juma })) as any).id;
    expect(((await allocations.myPlots(asUser('Juma'))) as any).guided.map((g: any) => g.holder.name)).toEqual(['Baraka Mbarali']);
    const req: any = await emancipation.requestAtOffice(admin, { allocationId });
    await expect(emancipation.approve(admin, req.id)).rejects.toThrow(/Manager or Accountant/);
    await expect(emancipation.reject(approver, req.id, '  ')).rejects.toThrow(/Say why/);
    expect(((await emancipation.reject(approver, req.id, 'Not yet 18 by the register')) as any).status).toBe('REJECTED');
    expect((await detail('Baraka')).current[0].guardian).toMatchObject({ name: 'Juma Mbarali' }); // nothing changed
    const again: any = await emancipation.requestMine(asUser('Juma'), { allocationId });
    await expect(emancipation.cancelMine(asUser('Zawadi'), again.id)).rejects.toBeInstanceOf(NotFoundException);
    expect(await emancipation.cancelMine(asUser('Juma'), again.id)).toEqual({ status: 'CANCELLED' });
    await expect(emancipation.requestAtOffice(otherAdmin, { allocationId })).rejects.toBeInstanceOf(NotFoundException);
    await expect(emancipation.reject(otherAdmin, again.id, 'x')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('the new member routes and emancipation routes declare who may use them', () => {
    const proto = IrrigationController.prototype as any;
    expect(Reflect.getMetadata(PERMISSION_KEY, proto.verifyAllocation)).toEqual({ resource: 'irrigation_verification', action: 'EDIT' });
    expect(Reflect.getMetadata(PERMISSION_KEY, proto.approveEmancipation)).toEqual({ resource: 'irrigation_transfer_approval', action: 'EDIT' });
    expect(Reflect.getMetadata(PERMISSION_KEY, proto.requestEmancipation)).toEqual({ resource: 'irrigation_allocations', action: 'CREATE' });
  });

  it('a new farmer waits for the block chairman, who alone can confirm or refuse; the chairman’s own registration is immediate', async () => {
    const block = await prisma.irrigationBlock.findFirstOrThrow({ where: { hectares: { some: { id: hectares[0] } } } });
    const base = 20;
    const extra: string[] = [];
    for (let n = 1; n <= 3; n++) extra.push((await prisma.irrigationHectare.create({ data: { blockId: block.id, hectareNumber: base + n, code: `GV${n}` } })).id);
    for (const n of ['Chair', 'Plot1', 'Plot2', 'Plot3']) await farmer(mamcosA, n);
    await prisma.irrigationLeadership.create({ data: { position: 'BLOCK_LEADER', canalId: block.canalId, blockId: block.id, farmerId: f.Chair, appointedOn: new Date('2026-01-01'), termStart: new Date('2026-01-01') } });
    const chair = { id: uid.Chair, role: UserRole.CUSTOM, mamcosId: mamcosA } as RequestUser;
    texts.length = 0;

    // registered by the office: waits, the chairman is told
    const a: any = await allocations.allocate(admin, { hectareId: extra[0], farmerId: f.Plot1 });
    expect(a).toMatchObject({ status: 'PENDING_APPROVAL', awaitingChairman: true });
    const chairPhone = (await prisma.user.findUniqueOrThrow({ where: { id: uid.Chair } })).phone;
    expect(texts.find((t) => t.to === chairPhone)!.text).toMatch(/Plot1 Mbarali amesajiliwa kwenye shamba .*Tafadhali thibitisha/);
    expect(((await allocations.listAllocations(admin, { status: 'PENDING_APPROVAL' })) as any).data.find((r: any) => r.id === a.id)).toMatchObject({ awaitingChairman: true });
    await expect(allocations.approve(approver, a.id)).rejects.toThrow(/chairman has not confirmed/);
    await expect(allocations.verifyAllocation(admin, a.id, 'I confirm')).rejects.toThrow(/Only the block or canal chairman/); // the office cannot confirm for them
    await expect(allocations.verifyAllocation(asUser('Plot2'), a.id)).rejects.toBeInstanceOf(Error);
    expect(((await allocations.verifyAllocation(chair, a.id, 'He farms this plot every season')) as any)).toMatchObject({ status: 'ACTIVE', awaitingChairman: false, chairmanVerifiedById: uid.Chair });
    await expect(allocations.verifyAllocation(chair, a.id)).rejects.toThrow(/not waiting for a chairman/);

    // the chairman refuses
    const b: any = await allocations.allocate(admin, { hectareId: extra[1], farmerId: f.Plot2 });
    await expect(allocations.chairmanReject(chair, b.id, 'no')).rejects.toBeInstanceOf(BadRequestException);
    expect(((await allocations.chairmanReject(chair, b.id, 'This plot is farmed by someone else'))) as any).toMatchObject({ status: 'REJECTED', rejectedReason: 'Chairman: This plot is farmed by someone else' });
    expect(await prisma.irrigationHectareAllocation.count({ where: { hectareId: extra[1], status: { in: ['ACTIVE', 'PENDING_APPROVAL'] } } })).toBe(0); // the hectare is free again

    // the chairman registers a farmer in their own block: already verified, no waiting
    const c: any = await allocations.allocate(chair, { hectareId: extra[2], farmerId: f.Plot3 });
    expect(c).toMatchObject({ status: 'ACTIVE', awaitingChairman: false, chairmanVerifiedById: uid.Chair });

    // a scheme can switch the step off
    await prisma.irrigationScheme.updateMany({ where: { mamcosId: mamcosA }, data: { requireChairmanVerification: false } });
    await prisma.irrigationHectare.create({ data: { blockId: block.id, hectareNumber: base + 9, code: 'GV9' } });
    await farmer(mamcosA, 'Plot4');
    const d: any = await allocations.allocate(admin, { hectareId: (await prisma.irrigationHectare.findFirstOrThrow({ where: { code: 'GV9' } })).id, farmerId: f.Plot4 });
    expect(d).toMatchObject({ status: 'ACTIVE', awaitingChairman: false });
    await prisma.irrigationScheme.updateMany({ where: { mamcosId: mamcosA }, data: { requireChairmanVerification: true } });
  });

  it('guardian routes need the allocation edit permission', () => {
    const proto = IrrigationController.prototype as any;
    for (const name of ['setGuardian', 'endGuardian']) expect(Reflect.getMetadata(PERMISSION_KEY, proto[name])).toEqual({ resource: 'irrigation_allocations', action: 'EDIT' });
  });
});
