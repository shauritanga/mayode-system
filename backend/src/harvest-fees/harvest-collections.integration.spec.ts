/**
 * Integration tests for combine harvest payments (register, bags and baskets, collection by the leaders, receipts, pending list, reports)
 * and for the SMS sent to the farmer and the leaders when a payment is recorded. Skipped unless IRRIGATION_TEST_DATABASE_URL is set.
 */
import 'reflect-metadata';
import { randomUUID } from 'crypto';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaClient, UserRole } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { OwnershipService, RequestUser } from '../common/ownership.service';
import { PERMISSION_KEY } from '../auth/decorators/require-permission.decorator';
import { AccountingService } from '../accounting/accounting.service';
import { DuesService } from '../dues/dues.service';
import { IrrigationScopeService } from '../irrigation/irrigation-scope.service';
import { HarvestCollectionsService } from './harvest-collections.service';
import { HarvestCollectionsController } from './harvest-collections.controller';

const BASE_URL = process.env.IRRIGATION_TEST_DATABASE_URL;
const SCHEMA = 'irrigation_test';
const describeDb = BASE_URL ? describe : describe.skip;
const ymd = (offsetDays: number) => new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10);

describeDb('Combine harvest payments (PostgreSQL)', () => {
  jest.setTimeout(120_000);
  let pool: Pool; let prisma: PrismaClient; let svc: HarvestCollectionsService; let dues: DuesService;
  let mamcosA: string; let mamcosB: string; let tag: string;
  let office: RequestUser; let blockLeader: RequestUser; let otherBlockLeader: RequestUser; let outsider: RequestUser;
  let canalLeaderId: string; let blockLeaderFarmerId: string; let farmerId: string; let hectareA: string; let hectareB: string;
  const texts: { to: string; text: string }[] = [];
  const phones: Record<string, string> = {};
  const grants = (list: [string, string][]) => ({ isActive: true, isSystem: false, permissions: list.map(([resource, action]) => ({ action, resource: { key: resource } })) });
  const user = async (mamcosId: string, language = 'sw') => { const phone = `+2556${Math.floor(Math.random() * 1e8).toString().padStart(8, '0')}`; const u = await prisma.user.create({ data: { phone, passwordHash: 'x', role: UserRole.CUSTOM, mamcosId, firstName: 'U', lastName: 'T', language } as any }); phones[u.id] = phone; return u.id; };
  const member = async (name: string, mamcosId: string, language = 'sw') => { const userId = await user(mamcosId, language); const f = await prisma.farmer.create({ data: { userId, controlNumber: `HC-${randomUUID().slice(0, 6)}`, firstName: name, lastName: 'Test', mamcosId } }); return { userId, farmerId: f.id }; };
  const sentTo = (userId: string) => texts.filter((t) => t.to === phones[userId]);

  beforeAll(async () => {
    const url = `${BASE_URL!.split('?')[0]}?options=${encodeURIComponent(`-c search_path=${SCHEMA}`)}`;
    pool = new Pool({ connectionString: url, max: 6 });
    prisma = new PrismaClient({ adapter: new PrismaPg(pool, { schema: SCHEMA }) });
    const ownership = new OwnershipService(prisma as any);
    const sms: any = { send: async (to: string, text: string) => { texts.push({ to, text }); } };
    svc = new HarvestCollectionsService(prisma as any, ownership, new IrrigationScopeService(prisma as any), sms);
    dues = new DuesService(prisma as any, ownership, new AccountingService(prisma as any, ownership), { get: () => sms } as any);
    tag = randomUUID().slice(0, 5);
    mamcosA = (await prisma.mamcos.create({ data: { name: `Madibira HC ${tag}` } })).id;
    mamcosB = (await prisma.mamcos.create({ data: { name: `Ubaruku HC ${tag}` } })).id;
    const scheme = await prisma.irrigationScheme.create({ data: { mamcosId: mamcosA, name: `HC Scheme ${tag}` } });
    const canal = await prisma.irrigationCanal.create({ data: { schemeId: scheme.id, canalNumber: 1, code: `HC1-${tag}`, name: 'Canal 1' } });
    const b1 = await prisma.irrigationBlock.create({ data: { canalId: canal.id, blockNumber: 1, code: '1.1R', side: 'RIGHT', areaHectares: 2, hectareCount: 2 } });
    const b2 = await prisma.irrigationBlock.create({ data: { canalId: canal.id, blockNumber: 2, code: '1.2R', side: 'RIGHT', areaHectares: 2, hectareCount: 2 } });
    hectareA = (await prisma.irrigationHectare.create({ data: { blockId: b1.id, hectareNumber: 1, code: '1.1R1', areaHectares: 1 } })).id;
    hectareB = (await prisma.irrigationHectare.create({ data: { blockId: b2.id, hectareNumber: 1, code: '1.2R1', areaHectares: 1 } })).id;
    const farmer = await member('Asha', mamcosA); farmerId = farmer.farmerId;
    await prisma.irrigationHectareAllocation.create({ data: { hectareId: hectareA, farmerId, status: 'ACTIVE', allocatedOn: new Date('2026-01-01') } });
    const far2 = await member('Juma', mamcosA);
    await prisma.irrigationHectareAllocation.create({ data: { hectareId: hectareB, farmerId: far2.farmerId, status: 'ACTIVE', allocatedOn: new Date('2026-01-01') } });
    const bl = await member('BlockLeader', mamcosA); blockLeaderFarmerId = bl.farmerId;
    const cl = await member('CanalLeader', mamcosA, 'en'); canalLeaderId = cl.farmerId; (global as any).__cl = cl.userId; (global as any).__bl = bl.userId; (global as any).__asha = farmer.userId;
    const ob = await member('OtherBlockLeader', mamcosA);
    const term = { appointedOn: new Date('2026-01-01'), termStart: new Date('2026-01-01') };
    await prisma.irrigationLeadership.create({ data: { position: 'BLOCK_LEADER', canalId: canal.id, blockId: b1.id, farmerId: bl.farmerId, ...term } });
    await prisma.irrigationLeadership.create({ data: { position: 'BLOCK_LEADER', canalId: canal.id, blockId: b2.id, farmerId: ob.farmerId, ...term } });
    await prisma.irrigationLeadership.create({ data: { position: 'CANAL_LEADER', canalId: canal.id, farmerId: cl.farmerId, ...term } });
    const full: [string, string][] = [['harvest_collections', 'VIEW'], ['harvest_collections', 'CREATE'], ['harvest_collections', 'EDIT'], ['combine_harvesters', 'VIEW'], ['combine_harvesters', 'CREATE'], ['combine_harvesters', 'EDIT'], ['farm_administration', 'VIEW']];
    office = { id: await user(mamcosA), role: UserRole.CUSTOM, mamcosId: mamcosA, customRole: grants(full) } as RequestUser;
    blockLeader = { id: bl.userId, role: UserRole.CUSTOM, mamcosId: mamcosA, customRole: grants(full.slice(0, 3).concat([['combine_harvesters', 'VIEW']])) } as RequestUser;
    otherBlockLeader = { id: ob.userId, role: UserRole.CUSTOM, mamcosId: mamcosA, customRole: grants(full.slice(0, 3)) } as RequestUser;
    outsider = { id: await user(mamcosB), role: UserRole.CUSTOM, mamcosId: mamcosB, customRole: grants(full) } as RequestUser;
  });
  afterAll(async () => { await prisma.$disconnect(); await pool.end(); });
  beforeEach(() => { texts.length = 0; });

  it('guards the register and the payments with their own permissions', () => {
    const r = (m: string) => Reflect.getMetadata(PERMISSION_KEY, HarvestCollectionsController.prototype[m as 'create']);
    expect(r('create')).toMatchObject({ resource: 'harvest_collections', action: 'CREATE' });
    expect(r('collect')).toMatchObject({ resource: 'harvest_collections', action: 'EDIT' });
    expect(r('createCombine')).toMatchObject({ resource: 'combine_harvesters', action: 'CREATE' });
    expect(r('saveSettings')).toMatchObject({ resource: 'combine_harvesters', action: 'EDIT' });
    expect(r('pending')).toMatchObject({ resource: 'farm_administration', action: 'VIEW' });
  });

  it('registers a combine harvester once, whatever the spacing or case of its number, and finds it by its number', async () => {
    const c: any = await svc.createCombine(office, { registrationNumber: 't 123 abc', ownerName: 'Kilimo Hire Ltd', make: 'Kubota', operatorName: 'Musa' } as any);
    expect(c.registrationNumber).toBe('T123ABC');
    await expect(svc.createCombine(office, { registrationNumber: 'T-123-ABC', ownerName: 'Other' } as any)).rejects.toBeInstanceOf(ConflictException);
    expect(await svc.lookupCombine(blockLeader, 'T 123 ABC')).toMatchObject({ ownerName: 'Kilimo Hire Ltd', make: 'Kubota', operatorName: 'Musa' });
    await expect(svc.lookupCombine(blockLeader, 'NOPE 1')).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc.lookupCombine(outsider, 'T123ABC')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('converts baskets to bags at the AMCOS’s own rate', async () => {
    expect(await svc.settings(office)).toMatchObject({ basketsPerBag: 2, configured: false });
    await expect(svc.saveSettings(office, { basketsPerBag: 3, pricePerBag: 90_000 } as any)).resolves.toMatchObject({ basketsPerBag: 3, pricePerBag: 90_000, configured: true });
  });

  let firstId: string;
  it('shows who farms the Farm ID and who the leaders are, then records the payment with a receipt and texts all three', async () => {
    const riceName = `Super ${randomUUID().slice(0, 5)}`;
    const riceId = (await prisma.riceVariety.create({ data: { name: riceName } })).id;
    const ctx: any = await svc.context(blockLeader, '1:1R-1');
    expect(ctx.farmer.name).toContain('Asha');
    expect(ctx.leaders.map((l: any) => l.position).sort()).toEqual(['BLOCK_LEADER', 'CANAL_LEADER']);
    const r: any = await svc.create(blockLeader, { farmId: '1:1R-1', registrationNumber: 't123abc', bags: 10, baskets: 6, amount: 150_000, quantityKg: 1100, riceVarietyId: riceId } as any);
    firstId = r.id;
    expect(r).toMatchObject({ receiptNo: expect.stringMatching(/^HC-\d{4}-0001$/), farmId: '1:1R-1', totalBags: 12, income: 1_080_000, status: 'COLLECTED', collectedByName: expect.stringContaining('BlockLeader') });
    expect(r.combine.registrationNumber).toBe('T123ABC');
    expect(r.riceType).toBe(riceName);
    await expect(svc.create(blockLeader, { farmId: '1:1R-1', registrationNumber: 't123abc', bags: 1, amount: 1, riceVarietyId: randomUUID() } as any)).rejects.toThrow(/rice type/);
    expect(r.amcos).toContain('Madibira');
    const asha = sentTo((global as any).__asha)[0].text; const canal = sentTo((global as any).__cl)[0].text; const block = sentTo((global as any).__bl)[0].text;
    expect(asha).toMatch(/Asante\. Madibira.* imepokea malipo ya uvunaji.*Shamba 1:1R-1.*T123ABC/);
    expect(canal).toMatch(/combine T123ABC harvested Farm ID 1:1R-1 \(Asha Test\).*collected by BlockLeader/); // the canal leader reads English
    expect(block).toMatch(/kombaini T123ABC/);
  });

  it('keeps leaders to their own block, and requires a real collector', async () => {
    await expect(svc.create(otherBlockLeader, { farmId: '1:1R-1', registrationNumber: 'T123ABC', bags: 1, amount: 1 } as any)).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc.receipt(otherBlockLeader, firstId)).rejects.toBeInstanceOf(NotFoundException);
    // the office is not a leader, so it must say which leader received the money, and only this block's leaders will do
    await expect(svc.create(office, { farmId: '1:1R-1', registrationNumber: 'T123ABC', bags: 1, amount: 1 } as any)).rejects.toThrow(/Choose the canal or block leader/);
    await expect(svc.create(office, { farmId: '1:1R-1', registrationNumber: 'T123ABC', bags: 1, amount: 1, collectorFarmerId: farmerId } as any)).rejects.toThrow(/must be the canal leader or block leader/);
    await expect(svc.create(blockLeader, { farmId: '1:1R-1', registrationNumber: 'UNKNOWN', bags: 1, amount: 1 } as any)).rejects.toThrow(/No combine harvester/);
    await expect(svc.create(blockLeader, { farmId: '1:1R-1', registrationNumber: 'T123ABC', amount: 1 } as any)).rejects.toThrow(/how much was harvested/);
    await expect(svc.create(blockLeader, { farmId: '1:1R-1', registrationNumber: 'T123ABC', bags: 1, amount: 1, harvestedOn: ymd(3) } as any)).rejects.toBeInstanceOf(BadRequestException);
    await expect(svc.create(outsider, { farmId: '1:1R-1', registrationNumber: 'T123ABC', bags: 1, amount: 1 } as any)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('holds a payment not yet received as pending, shows it with the leaders who must record it, and collects it once', async () => {
    const p: any = await svc.create(office, { farmId: '1:2R-1', registrationNumber: 'T123ABC', baskets: 9, amount: 80_000, collected: false } as any);
    expect(p).toMatchObject({ status: 'PENDING', totalBags: 3, collectedByName: null });
    expect(texts).toHaveLength(0); // nothing was collected, so nobody is told it was
    const pend: any = await svc.pendingPayments(office);
    const row = pend.data.find((x: any) => x.id === p.id);
    expect(row).toMatchObject({ kind: 'HARVEST_PAYMENT', amount: 80_000, farmIds: ['1:2R-1'] });
    expect(row.detail).toMatch(/OtherBlockLeader|CanalLeader/);
    await expect(svc.collect(blockLeader, p.id, undefined)).rejects.toBeInstanceOf(NotFoundException); // not his block
    const done: any = await svc.collect(otherBlockLeader, p.id, undefined);
    expect(done).toMatchObject({ status: 'COLLECTED', collectedByPosition: 'BLOCK_LEADER' });
    expect(done.collectedAt).toBeTruthy();
    await expect(svc.collect(otherBlockLeader, p.id, undefined)).rejects.toBeInstanceOf(ConflictException);
    expect(((await svc.pendingPayments(office)) as any).data.some((x: any) => x.id === p.id)).toBe(false);
    expect(texts.length).toBeGreaterThanOrEqual(3);
  });

  it('lists other unpaid charges as pending, not as overdue debt, and leaves the levy out', async () => {
    const mk = (category: any, description: string) => prisma.farmerDue.create({ data: { mamcosId: mamcosA, farmerId, category, description, amount: 20_000, issuedOn: new Date(ymd(-20)), dueDate: new Date(ymd(-5)) } });
    await mk('HARVEST_FEE', 'Harvest fee Masika · 1.1R'); await mk('OTHER', 'Canal contribution'); await mk('LEVY', 'Farm levy 2026');
    const rows: any[] = ((await svc.pendingPayments(office)) as any).data.filter((x: any) => x.kind === 'CHARGE');
    expect(rows.map((r) => r.what).sort()).toEqual(['Canal contribution', 'Harvest fee Masika · 1.1R']);
    expect(rows[0].farmIds).toEqual(['1:1R-1']);
    expect(((await svc.pendingPayments(blockLeader)) as any).data.filter((x: any) => x.kind === 'CHARGE')).toHaveLength(0); // a leader sees harvest payments in their block only
  });

  it('reports payments by combine and the whole money and bag history of a hectare', async () => {
    const rep: any = await svc.byCombine(office, {} as any);
    expect(rep.data[0]).toMatchObject({ combine: { registrationNumber: 'T123ABC' }, hectares: 2, payments: 2, bags: 15, collected: 230_000, pending: 0 });
    const h: any = await svc.hectareHistory(blockLeader, hectareA);
    expect(h.totals).toMatchObject({ harvests: 1, bags: 12, income: 1_080_000, collected: 150_000, pending: 0, kg: 1100 });
    expect(h.data[0]).toMatchObject({ collectedByName: expect.any(String), receiptNo: expect.any(String) });
    await expect(svc.hectareHistory(otherBlockLeader, hectareA)).rejects.toBeInstanceOf(NotFoundException);
    expect(((await svc.byCombine(outsider, {} as any)) as any).data).toHaveLength(0);
  });

  it('voids a mistaken payment with a reason, and it drops out of the totals', async () => {
    await expect(svc.voidIt(blockLeader, firstId, '')).rejects.toBeInstanceOf(BadRequestException);
    expect(((await svc.voidIt(blockLeader, firstId, 'Entered against the wrong hectare')) as any).voidedAt).toBeTruthy();
    await expect(svc.voidIt(blockLeader, firstId, 'again')).rejects.toBeInstanceOf(ConflictException);
    expect(((await svc.hectareHistory(blockLeader, hectareA)) as any).totals.harvests).toBe(0);
  });

  it('texts the farmer and both leaders whenever a charge or contribution is paid', async () => {
    const due = await prisma.farmerDue.create({ data: { mamcosId: mamcosA, farmerId, category: 'LEVY', description: 'Farm levy', amount: 50_000, issuedOn: new Date(ymd(-5)) } });
    texts.length = 0;
    await dues.recordPayment(office as any, due.id, { amount: 20_000, method: 'CASH' } as any);
    await new Promise((r) => setTimeout(r, 300));
    expect(sentTo((global as any).__asha)[0].text).toMatch(/Asante\. Madibira HC .* imepokea malipo ya Shamba 1:1R-1: TZS 20,000/);
    expect(sentTo((global as any).__cl)[0].text).toMatch(/payment received from Asha Test \(Farm ID 1:1R-1\): TZS 20,000 for Farm levy/); // canal leader, English
    expect(sentTo((global as any).__bl)[0].text).toMatch(/malipo yamepokelewa kutoka kwa Asha Test/);
  });
});
