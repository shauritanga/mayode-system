/**
 * Integration tests for machinery and task management against the throw-away `irrigation_test` schema
 * (scripts/irrigation-test-schema.sh). Skipped unless IRRIGATION_TEST_DATABASE_URL is set.
 */
import 'reflect-metadata';
import { randomUUID } from 'crypto';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaClient, UserRole } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { OwnershipService, RequestUser } from '../common/ownership.service';
import { PERMISSION_KEY } from '../auth/decorators/require-permission.decorator';
import { MachineryController } from './machinery.controller';
import { MachineryService } from './machinery.service';

const BASE_URL = process.env.IRRIGATION_TEST_DATABASE_URL;
const SCHEMA = 'irrigation_test';
const describeDb = BASE_URL ? describe : describe.skip;
const iso = (offsetDays = 0) => new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10);

describeDb('Machinery and task management (PostgreSQL)', () => {
  jest.setTimeout(120_000);
  let pool: Pool;
  let prisma: PrismaClient;
  let svc: MachineryService;
  let adminA: RequestUser;
  let adminB: RequestUser;
  let superAdmin: RequestUser;
  let mamcosA: string;
  let mamcosB: string;
  let blockA: string;
  let blockB: string;
  let tractor: any; // AMCOS-owned
  let harvester: any; // external, 15,000 TZS per hectare

  beforeAll(async () => {
    const url = `${BASE_URL!.split('?')[0]}?options=${encodeURIComponent(`-c search_path=${SCHEMA}`)}`;
    pool = new Pool({ connectionString: url, max: 6 });
    prisma = new PrismaClient({ adapter: new PrismaPg(pool, { schema: SCHEMA }) });
    const [{ current_schema }] = await prisma.$queryRawUnsafe<{ current_schema: string }[]>('select current_schema()');
    expect(current_schema).toBe(SCHEMA);
    svc = new MachineryService(prisma as any, new OwnershipService(prisma as any));

    const tag = randomUUID().slice(0, 5);
    mamcosA = (await prisma.mamcos.create({ data: { name: `Madibira M ${tag}`, code: `MAD-${tag.toUpperCase()}1` } })).id;
    mamcosB = (await prisma.mamcos.create({ data: { name: `Ubaruku M ${tag}`, code: `UBA-${tag.toUpperCase()}2` } })).id;
    const block = async (mamcosId: string, code: string) => {
      const scheme = await prisma.irrigationScheme.create({ data: { mamcosId, name: `Scheme ${code}`, code: `S-${code}-${tag}` } });
      const canal = await prisma.irrigationCanal.create({ data: { schemeId: scheme.id, canalNumber: 1, code: 'C01', name: 'Canal 01' } });
      return (await prisma.irrigationBlock.create({ data: { canalId: canal.id, blockNumber: 1, code: `${code}-C01-B01`, areaHectares: 30, hectareCount: 30 } })).id;
    };
    blockA = await block(mamcosA, 'A');
    blockB = await block(mamcosB, 'B');
    const admin = (mamcosId: string): RequestUser => ({ id: randomUUID(), role: UserRole.CUSTOM, mamcosId });
    adminA = admin(mamcosA);
    adminB = admin(mamcosB);
    superAdmin = { id: randomUUID(), role: UserRole.SUPER_ADMIN, mamcosId: null };
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await pool.end();
  });

  describe('equipment register', () => {
    it('registers AMCOS-owned and external machines and refuses nonsense combinations', async () => {
      tractor = await svc.createEquipment(adminA, { name: 'Tractor MF-385', type: 'TRACTOR', ownership: 'AMCOS', registrationNo: 'T 123 ABC' });
      harvester = await svc.createEquipment(adminA, { name: 'Combine Kubota', type: 'COMBINE_HARVESTER', ownership: 'EXTERNAL', ownerName: 'Juma Hamisi', ownerPhone: '+255712000111', feePerHectare: 15000 });
      expect(tractor).toMatchObject({ ownership: 'AMCOS', feePerHectare: null, ownerName: null, registrationFeeStatus: 'NOT_APPLICABLE' });
      expect(Number(harvester.feePerHectare)).toBe(15000);
      await expect(svc.createEquipment(adminA, { name: 'Mystery', type: 'OTHER', ownership: 'EXTERNAL' })).rejects.toThrow(/owner of this external machine/);
      await expect(svc.createEquipment(adminA, { name: 'Own with fee', type: 'OTHER', ownership: 'AMCOS', registrationFee: 100 })).rejects.toThrow(/registration fee/);
      await expect(svc.createEquipment(adminA, { name: 'Tractor MF-385', type: 'TRACTOR', ownership: 'AMCOS' })).rejects.toBeInstanceOf(ConflictException);
      // another AMCOS may use the same name
      await svc.createEquipment(adminB, { name: 'Tractor MF-385', type: 'TRACTOR', ownership: 'AMCOS' });
    });
  });

  describe('activities and fees', () => {
    let job: any;

    it('with no rate set an AMCOS-owned machine earns nothing; external machines owe hectares × their rate', async () => {
      const own = await svc.createActivity(adminA, { activityDate: iso(-3), type: 'PLOUGHING', equipmentId: tractor.id, hectares: 8.5, operatorName: 'Salim', blockId: blockA });
      expect(own).toMatchObject({ feeStatus: 'NOT_APPLICABLE' });
      expect(Number(own.feeAmount)).toBe(0);
      job = await svc.createActivity(adminA, { activityDate: iso(-2), type: 'HARVESTING', equipmentId: harvester.id, hectares: 12, blockId: blockA, operatorName: 'Juma' });
      expect(job).toMatchObject({ feeStatus: 'PENDING', status: 'COMPLETED' });
      expect(Number(job.feeAmount)).toBe(180000);
      const custom = await svc.createActivity(adminA, { activityDate: iso(-2), type: 'THRESHING', equipmentId: harvester.id, hectares: 4, feeAmount: 50000 });
      expect(Number(custom.feeAmount)).toBe(50000);
    });

    it('checks dates, blocks and machines', async () => {
      await expect(svc.createActivity(adminA, { activityDate: iso(5), type: 'PLOUGHING', equipmentId: tractor.id, hectares: 2 })).rejects.toThrow(/future/);
      const planned = await svc.createActivity(adminA, { activityDate: iso(5), type: 'PLOUGHING', equipmentId: tractor.id, hectares: 2, status: 'PLANNED' });
      expect(planned.status).toBe('PLANNED');
      await expect(svc.createActivity(adminA, { activityDate: iso(-1), type: 'PLOUGHING', equipmentId: tractor.id, hectares: 31, blockId: blockA })).rejects.toThrow(/only 30 ha/);
      await expect(svc.createActivity(adminA, { activityDate: iso(-1), type: 'PLOUGHING', equipmentId: tractor.id, hectares: 2, blockId: blockB })).rejects.toBeInstanceOf(NotFoundException);
      await expect(svc.createActivity(adminA, { activityDate: iso(-1), type: 'PLOUGHING', equipmentId: randomUUID(), hectares: 2 })).rejects.toBeInstanceOf(NotFoundException);
      const parked = await svc.createEquipment(adminA, { name: 'Old sprayer', type: 'SPRAYER', ownership: 'AMCOS' });
      await svc.updateEquipment(adminA, parked.id, { isActive: false });
      await expect(svc.createActivity(adminA, { activityDate: iso(-1), type: 'SPRAYING', equipmentId: parked.id, hectares: 1 })).rejects.toThrow(/inactive/);
    });

    it('collects a fee once, with a sensible date, and then locks the job', async () => {
      await expect(svc.markFeePaid(adminA, job.id, iso(-5))).rejects.toThrow(/before the job date/);
      await expect(svc.markFeePaid(adminA, job.id, iso(3))).rejects.toThrow(/future/);
      const paid = await svc.markFeePaid(adminA, job.id, iso(-1));
      expect(paid).toMatchObject({ feeStatus: 'PAID' });
      await expect(svc.markFeePaid(adminA, job.id)).rejects.toThrow(/already recorded as paid/);
      await expect(svc.updateActivity(adminA, job.id, { hectares: 20 })).rejects.toThrow(/already paid/);
      await expect(svc.updateActivity(adminA, job.id, { status: 'CANCELLED' })).rejects.toBeInstanceOf(ConflictException);
      // things that do not touch the money stay editable
      expect((await svc.updateActivity(adminA, job.id, { operatorName: 'Juma H.' })).operatorName).toBe('Juma H.');
    });

    it('recalculates a pending fee when hectares change, and drops it when the job is cancelled', async () => {
      const j = await svc.createActivity(adminA, { activityDate: iso(-1), type: 'HARVESTING', equipmentId: harvester.id, hectares: 10 });
      expect(Number(j.feeAmount)).toBe(150000);
      const bigger = await svc.updateActivity(adminA, j.id, { hectares: 11 });
      expect(Number(bigger.feeAmount)).toBe(165000);
      const cancelled = await svc.updateActivity(adminA, j.id, { status: 'CANCELLED' });
      expect(cancelled).toMatchObject({ status: 'CANCELLED', feeStatus: 'NOT_APPLICABLE' });
      expect(Number(cancelled.feeAmount)).toBe(0);
      await expect(svc.markFeePaid(adminA, j.id)).rejects.toThrow(/completed job/);
    });
  });

  describe('registration fee and contribution per hectare', () => {
    it('charges tools owned by someone else a registration fee, from the AMCOS default or an agreed amount, never the AMCOS’s own', async () => {
      const mamcosC = (await prisma.mamcos.create({ data: { name: `Mbuyuni F ${randomUUID().slice(0, 5)}` } })).id;
      const adminC: RequestUser = { id: randomUUID(), role: UserRole.CUSTOM, mamcosId: mamcosC };
      expect(await svc.rates(adminC)).toEqual({ toolRegistrationFee: null, toolFeePerHectare: null });
      await svc.updateRates(adminC, { toolRegistrationFee: 50_000, toolFeePerHectare: 3_000 });
      expect(await svc.rates(adminC)).toEqual({ toolRegistrationFee: 50_000, toolFeePerHectare: 3_000 });

      const own = await svc.createEquipment(adminC, { name: 'Own tractor', type: 'TRACTOR', ownership: 'AMCOS' });
      const hired = await svc.createEquipment(adminC, { name: 'Hired combine', type: 'COMBINE_HARVESTER', ownership: 'EXTERNAL', ownerName: 'Asha' });
      const agreed = await svc.createEquipment(adminC, { name: 'Hired sprayer', type: 'SPRAYER', ownership: 'EXTERNAL', ownerName: 'Musa', registrationFee: 20_000, feePerHectare: 1_000 });
      const free = await svc.createEquipment(adminC, { name: 'Hired pump', type: 'OTHER', ownership: 'EXTERNAL', ownerName: 'Neema', registrationFee: 0 });
      expect([own, hired, agreed, free].map((e) => [Number(e.registrationFee), e.registrationFeeStatus])).toEqual([
        [0, 'NOT_APPLICABLE'], [50_000, 'PENDING'], [20_000, 'PENDING'], [0, 'NOT_APPLICABLE'],
      ]);

      // paid once, with a sensible date; nothing to pay for the AMCOS's own tool
      await expect(svc.markRegistrationFeePaid(adminC, own.id)).rejects.toThrow(/no registration fee/);
      await expect(svc.markRegistrationFeePaid(adminC, hired.id, iso(3))).rejects.toThrow(/future/);
      expect(await svc.markRegistrationFeePaid(adminC, hired.id, iso(-1))).toMatchObject({ registrationFeeStatus: 'PAID' });
      await expect(svc.markRegistrationFeePaid(adminC, hired.id)).rejects.toThrow(/already recorded as paid/);
      await expect(svc.markRegistrationFeePaid(adminA, agreed.id)).rejects.toBeInstanceOf(NotFoundException);

      // every tool contributes per hectare: its own rate, else the AMCOS default, whoever owns it
      const job = (equipmentId: string, hectares: number) => svc.createActivity(adminC, { activityDate: iso(-1), type: 'PLOUGHING', equipmentId, hectares });
      expect(await job(own.id, 4)).toMatchObject({ feeStatus: 'PENDING' });
      expect(Number((await job(own.id, 4)).feeAmount)).toBe(12_000);
      expect(Number((await job(hired.id, 2)).feeAmount)).toBe(6_000);
      expect(Number((await job(agreed.id, 5)).feeAmount)).toBe(5_000);
      const listed: any[] = await svc.listEquipment(adminC, {});
      expect(listed.find((e) => e.id === agreed.id)).toMatchObject({ effectiveFeePerHectare: 1_000, registrationFee: 20_000 });
      expect(listed.find((e) => e.id === own.id)).toMatchObject({ effectiveFeePerHectare: 3_000 });

      // the database refuses a fee that disagrees with its status
      await expect(prisma.$executeRawUnsafe(`update amcos_equipment set registration_fee_status = 'PAID' where id = '${agreed.id}'`)).rejects.toThrow(/consistent|check/);
    });
  });

  describe('listing and totals', () => {
    it('filters by date, type, machine, ownership and text, and totals only completed work', async () => {
      const all: any = await svc.listActivities(adminA, {});
      expect(all.meta.total).toBeGreaterThanOrEqual(5);
      // completed jobs: 8.5 (own) + 12 + 4 (external) = 24.5 ha; planned / cancelled excluded
      expect(all.summary.hectares).toBeCloseTo(24.5, 2);
      expect(all.summary.jobs).toBe(3);
      expect(all.summary.feesPaid).toBe(180000);
      expect(all.summary.feesDue).toBe(50000);
      expect(all.summary.byType.find((t: any) => t.type === 'HARVESTING')).toMatchObject({ jobs: 1, hectares: 12 });

      const harvesting: any = await svc.listActivities(adminA, { type: 'HARVESTING' as any });
      expect(harvesting.data.every((r: any) => r.type === 'HARVESTING')).toBe(true);
      const external: any = await svc.listActivities(adminA, { ownership: 'EXTERNAL' as any, status: 'COMPLETED' as any });
      expect(external.summary.hectares).toBeCloseTo(16, 2);
      const byMachine: any = await svc.listActivities(adminA, { equipmentId: tractor.id });
      expect(byMachine.data.every((r: any) => r.equipment.id === tractor.id)).toBe(true);
      const recent: any = await svc.listActivities(adminA, { from: iso(-2), to: iso(-2) });
      expect(recent.data.every((r: any) => new Date(r.activityDate).toISOString().startsWith(iso(-2)))).toBe(true);
      expect((await svc.listActivities(adminA, { q: 'salim' }) as any).data).toHaveLength(1);
      expect((await svc.listActivities(adminA, { feeStatus: 'PENDING' as any }) as any).data.every((r: any) => r.feeStatus === 'PENDING')).toBe(true);
      expect((await svc.listActivities(adminA, { pageSize: 2 }) as any).data).toHaveLength(2);
    });

    it('shows each machine its own jobs, hectares and fees earned', async () => {
      const list: any[] = await svc.listEquipment(adminA, {});
      const h = list.find((e) => e.id === harvester.id);
      expect(h).toMatchObject({ jobs: 2, hectaresWorked: 16, feesEarned: 230000 });
      expect(list.some((e) => e.name === 'Old sprayer')).toBe(false); // inactive machines are hidden unless asked for
      expect((await svc.listEquipment(adminA, { includeInactive: 'true' })).some((e: any) => e.name === 'Old sprayer')).toBe(true);
    });
  });

  describe('cooperative boundaries', () => {
    it('keeps each AMCOS to its own machines and jobs', async () => {
      expect((await svc.listActivities(adminB, {}) as any).meta.total).toBe(0);
      expect((await svc.listEquipment(adminB, {})).every((e: any) => e.id !== tractor.id)).toBe(true);
      await expect(svc.createActivity(adminB, { activityDate: iso(-1), type: 'PLOUGHING', equipmentId: tractor.id, hectares: 1 })).rejects.toBeInstanceOf(NotFoundException);
      const anyJob = await prisma.machineryActivity.findFirstOrThrow({ where: { mamcosId: mamcosA } });
      await expect(svc.updateActivity(adminB, anyJob.id, { operatorName: 'x' })).rejects.toBeInstanceOf(NotFoundException);
      await expect(svc.markFeePaid(adminB, anyJob.id)).rejects.toBeInstanceOf(NotFoundException);
      await expect(svc.updateEquipment(adminB, tractor.id, { notes: 'x' })).rejects.toBeInstanceOf(NotFoundException);
      await expect(svc.listActivities(adminB, { mamcosId: mamcosA })).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('platform accounts must say which cooperative', async () => {
      await expect(svc.listActivities(superAdmin, {})).rejects.toBeInstanceOf(BadRequestException);
      expect((await svc.listActivities(superAdmin, { mamcosId: mamcosA }) as any).meta.total).toBeGreaterThan(0);
    });
  });

  describe('the database backs the rules', () => {
    it('refuses a paid fee with no date, a zero-hectare job and a fee on a not-applicable job', async () => {
      const insert = (cols: string, vals: string) => prisma.$executeRawUnsafe(
        `insert into machinery_activities (id, mamcos_id, activity_date, type, equipment_id, status, updated_at, ${cols}) values ('${randomUUID()}', '${mamcosA}', current_date, 'PLOUGHING', '${tractor.id}', 'COMPLETED', now(), ${vals})`);
      await expect(insert('hectares, fee_amount, fee_status', `2, 1000, 'PAID'`)).rejects.toThrow(/fee_consistent|check/);
      await expect(insert('hectares', '0')).rejects.toThrow(/hectares_positive|check/);
      await expect(insert('hectares, fee_amount, fee_status', `2, 500, 'NOT_APPLICABLE'`)).rejects.toThrow(/fee_consistent|check/);
      await expect(prisma.$executeRawUnsafe(`delete from amcos_equipment where id = '${tractor.id}'`)).rejects.toThrow(); // referenced by jobs
    });
  });

  it('declares an explicit permission on every machinery route', () => {
    const proto = MachineryController.prototype as any;
    const handlers = Object.getOwnPropertyNames(proto).filter((n) => n !== 'constructor' && typeof proto[n] === 'function');
    expect(handlers.length).toBe(10);
    for (const name of handlers) {
      const required = Reflect.getMetadata(PERMISSION_KEY, proto[name]);
      expect({ name, resource: required?.resource }).toEqual({ name, resource: 'machinery' });
      if (Reflect.getMetadata('method', proto[name]) !== 0) expect(required.action).not.toBe('VIEW');
    }
  });
});
