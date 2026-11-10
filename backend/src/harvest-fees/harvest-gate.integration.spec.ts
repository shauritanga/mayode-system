/**
 * Integration tests for the harvest gate (passes, arrivals, incidents, daily reconciliation) against the throw-away
 * `irrigation_test` schema (scripts/irrigation-test-schema.sh). SMS and notification senders are fakes.
 * Skipped unless IRRIGATION_TEST_DATABASE_URL is set.
 */
import 'reflect-metadata';
import { randomUUID } from 'crypto';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaClient, UserRole } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { OwnershipService, RequestUser } from '../common/ownership.service';
import { AccountingService } from '../accounting/accounting.service';
import { DuesService } from '../dues/dues.service';
import { IrrigationScopeService } from '../irrigation/irrigation-scope.service';
import { PERMISSION_KEY } from '../auth/decorators/require-permission.decorator';
import { HarvestFeesService } from './harvest-fees.service';
import { HarvestGateService } from './harvest-gate.service';
import { HarvestFeesController } from './harvest-fees.controller';

const BASE_URL = process.env.IRRIGATION_TEST_DATABASE_URL;
const SCHEMA = 'irrigation_test';
const describeDb = BASE_URL ? describe : describe.skip;
const grants = (list: [string, string][]) => ({ isActive: true, isSystem: false, permissions: list.map(([resource, action]) => ({ action, resource: { key: resource } })) });

describeDb('Harvest gate (PostgreSQL)', () => {
  jest.setTimeout(120_000);
  let pool: Pool; let prisma: PrismaClient; let fees: HarvestFeesService; let gate: HarvestGateService; let dues: DuesService;
  let mamcosId: string; let blockId: string; let canalId: string;
  let manager: RequestUser; let approver: RequestUser; let operator: RequestUser; let chairman: RequestUser; let canalChair: RequestUser;
  const hectare: Record<string, string> = {};
  const people: Record<string, { farmerId: string; userId: string; phone: string }> = {};
  const texts: { to: string; text: string }[] = [];
  const sentTo = (n: string) => texts.filter((t) => t.to === people[n].phone);
  const until = async (check: () => Promise<boolean>) => { for (let i = 0; i < 60; i++) { if (await check()) return; await new Promise((r) => setTimeout(r, 50)); } throw new Error('condition not met in time'); };
  const makeUser = async () => { const id = randomUUID(); await prisma.user.create({ data: { id, phone: `+2556${Math.floor(Math.random() * 1e8).toString().padStart(8, '0')}`, passwordHash: 'x', role: UserRole.CUSTOM, mamcosId, firstName: 'Staff', lastName: 'Member' } as any }); return id; };
  const staff = (id: string, list: [string, string][]): RequestUser => ({ id, role: UserRole.CUSTOM, mamcosId, customRole: grants(list) } as RequestUser);
  let typeId: string;
  const dueOf = (name: string) => prisma.farmerDue.findFirstOrThrow({ where: { farmerId: people[name].farmerId, typeId } });
  const pay = async (name: string) => { const d = await dueOf(name); await dues.recordPayment(manager, d.id, { amount: Number(d.amount), method: 'CASH' } as any); };
  const passOf = (hectareName: string) => prisma.harvestPass.findFirst({ where: { hectareId: hectare[hectareName] } });

  const farmer = async (name: string, language = 'sw') => {
    const userId = randomUUID();
    const phone = `+2557${Math.floor(Math.random() * 1e8).toString().padStart(8, '0')}`;
    await prisma.user.create({ data: { id: userId, phone, passwordHash: 'x', role: UserRole.FARMER, language } as any });
    const row = await prisma.farmer.create({ data: { userId, controlNumber: `HG-${randomUUID().slice(0, 6)}`, firstName: name, lastName: 'Kimaro', mamcosId } });
    people[name] = { farmerId: row.id, userId, phone };
  };

  beforeAll(async () => {
    const url = `${BASE_URL!.split('?')[0]}?options=${encodeURIComponent(`-c search_path=${SCHEMA}`)}`;
    pool = new Pool({ connectionString: url, max: 6 });
    prisma = new PrismaClient({ adapter: new PrismaPg(pool, { schema: SCHEMA }) });
    const ownership = new OwnershipService(prisma as any);
    const scope = new IrrigationScopeService(prisma as any);
    const sms: any = { send: async (to: string, text: string) => { texts.push({ to, text }); } };
    const notifications: any = { create: async () => ({}) };
    fees = new HarvestFeesService(prisma as any, ownership, scope);
    gate = new HarvestGateService(prisma as any, ownership, scope, fees, sms, notifications);
    dues = new DuesService(prisma as any, ownership, new AccountingService(prisma as any, ownership), { get: (c: any) => (c?.name === 'HarvestGateService' ? gate : { afterDuesChange: async () => undefined }) } as any);

    const tag = randomUUID().slice(0, 5);
    mamcosId = (await prisma.mamcos.create({ data: { name: `Madibira HG ${tag}` } })).id;
    for (const n of ['Asha', 'Baraka', 'Chausiku', 'Block', 'Canal']) await farmer(n, n === 'Block' ? 'en' : 'sw');
    const scheme = await prisma.irrigationScheme.create({ data: { mamcosId, name: `Scheme ${tag}` } });
    const canal = await prisma.irrigationCanal.create({ data: { schemeId: scheme.id, canalNumber: 1, code: `C1-${tag}`, name: 'Canal 1' } });
    canalId = canal.id;
    const block = await prisma.irrigationBlock.create({ data: { canalId: canal.id, blockNumber: 1, code: `1.1R`, side: 'RIGHT', areaHectares: 4, hectareCount: 4 } });
    blockId = block.id;
    // Asha holds two hectares, Baraka one, Chausiku one that nobody will pay for.
    const plan: [string, string][] = [['h1', 'Asha'], ['h2', 'Asha'], ['h3', 'Baraka'], ['h4', 'Chausiku']];
    for (const [i, [name, owner]] of plan.entries()) {
      hectare[name] = (await prisma.irrigationHectare.create({ data: { blockId: block.id, hectareNumber: i + 1, code: `1.1R${i + 1}`, areaHectares: 1 } })).id;
      await prisma.irrigationHectareAllocation.create({ data: { hectareId: hectare[name], farmerId: people[owner].farmerId, status: 'ACTIVE', allocatedOn: new Date('2026-01-01') } });
    }
    const lead = (position: 'BLOCK_LEADER' | 'CANAL_LEADER', who: string) => prisma.irrigationLeadership.create({ data: { position, canalId: canal.id, blockId: position === 'BLOCK_LEADER' ? block.id : null, farmerId: people[who].farmerId, appointedOn: new Date('2026-01-01'), termStart: new Date('2026-01-01') } });
    await lead('BLOCK_LEADER', 'Block'); await lead('CANAL_LEADER', 'Canal');

    const open = (id: string) => ({ id, mamcosId, role: UserRole.CUSTOM });
    void open;
    manager = staff(await makeUser(), [['harvest_fees', 'VIEW'], ['harvest_fees', 'CREATE'], ['harvest_fees', 'EDIT'], ['harvest_passes', 'VIEW'], ['harvest_passes', 'EDIT'], ['harvest_passes', 'CREATE'], ['irrigation_allocations', 'VIEW']]);
    approver = staff(await makeUser(), [['harvest_fee_approval', 'EDIT']]);
    operator = staff(await makeUser(), [['harvest_clearance', 'VIEW'], ['harvest_fees', 'VIEW'], ['harvest_passes', 'VIEW'], ['harvest_passes', 'CREATE'], ['harvest_passes', 'EDIT']]);
    // the block and canal leaders are members: their login is the member's, with the leader role
    chairman = staff(people.Block.userId, [['harvest_passes', 'VIEW'], ['harvest_passes', 'CREATE'], ['harvest_passes', 'EDIT'], ['irrigation_allocations', 'VIEW'], ['harvest_clearance', 'VIEW']]);
    canalChair = staff(people.Canal.userId, [['harvest_passes', 'VIEW'], ['harvest_passes', 'CREATE'], ['harvest_passes', 'EDIT'], ['irrigation_allocations', 'VIEW'], ['harvest_clearance', 'VIEW']]);

    const season = await prisma.farmingSeason.create({ data: { name: `Masika ${tag}`, mamcosId, startDate: new Date(Date.now() - 86_400_000), endDate: new Date(Date.now() + 90 * 86_400_000), status: 'ACTIVE' } });
    const rate: any = await fees.proposeRate({ scope: 'AMCOS', ratePerHectare: 30_000 } as any, manager);
    await fees.decideRate(rate.id, { approve: true } as any, approver);
    await fees.openHarvest({ blockId, seasonId: season.id } as any, manager);
    typeId = (await prisma.farmerDueType.findFirstOrThrow({ where: { mamcosId, category: 'HARVEST_FEE' } })).id;
  });
  beforeEach(() => { texts.length = 0; });
  afterAll(async () => { await prisma.$disconnect(); await pool.end(); });

  it('gives no pass until the fee is paid, and shows every plot locked', async () => {
    expect(await prisma.harvestPass.count({ where: { mamcosId } })).toBe(0);
    const c: any = await fees.clearanceOfBlock((await prisma.irrigationBlock.findUniqueOrThrow({ where: { id: blockId }, include: { canal: { include: { scheme: true } } } })) as any);
    expect(c.summary).toMatchObject({ total: 4, green: 0, red: 4 });
    expect(c.hectares.every((h: any) => h.pass === null && h.status === 'RED')).toBe(true);
  });

  it('paying the fee gives each of the farmer’s plots a pass and texts the farmer and the block leader the codes', async () => {
    await pay('Asha');
    await until(async () => (await prisma.harvestPass.count({ where: { mamcosId } })) === 2);
    const passes = await prisma.harvestPass.findMany({ where: { farmerId: people.Asha.farmerId } });
    expect(passes.map((p) => p.status)).toEqual(['ISSUED', 'ISSUED']);
    expect(passes.every((p) => /^[A-HJ-NP-Z2-9]{6}$/.test(p.code))).toBe(true);
    await until(async () => sentTo('Block').length >= 1);
    expect(sentTo('Asha')).toHaveLength(2);
    expect(sentTo('Asha')[0].text).toMatch(/Namba ya kibali cha kuvuna: [A-Z2-9]{6}/);
    expect(sentTo('Asha').some((t) => t.text.includes('1:1R-1'))).toBe(true);
    expect(sentTo('Block')).toHaveLength(1); // one digest for both plots, in English
    expect(sentTo('Block')[0].text).toMatch(/2 plot\(s\) cleared to harvest in block 1:1R: 1:1R-1=.*1:1R-2=/);
    expect(sentTo('Canal')).toHaveLength(0); // the canal leader hears about arrivals and incidents, not every pass
    expect(sentTo('Baraka')).toHaveLength(0);
    // paying again changes nothing
    await gate.afterDuesChange(mamcosId, people.Asha.farmerId);
    expect(await prisma.harvestPass.count({ where: { mamcosId } })).toBe(2);
  });

  it('a farmer who has paid but owes a loan gets no pass, and the plot shows yellow until the loan is cleared', async () => {
    const loan = await prisma.loanRecord.create({ data: { farmerId: people.Baraka.farmerId, lenderName: 'Bank', originalAmount: 100_000, amountOwed: 100_000 } });
    await pay('Baraka');
    await new Promise((r) => setTimeout(r, 300));
    expect(await passOf('h3')).toBeNull();
    const block: any = await prisma.irrigationBlock.findUniqueOrThrow({ where: { id: blockId }, include: { canal: { include: { scheme: true } } } });
    expect(((await fees.clearanceOfBlock(block)) as any).hectares.find((h: any) => h.code === '1.1R3').status).toBe('YELLOW');
    await prisma.loanRecord.update({ where: { id: loan.id }, data: { amountOwed: 0, isActive: false } });
    texts.length = 0;
    expect(await gate.sweep()).toBe(1); // the timer notices the loan is repaid
    expect((await passOf('h3'))?.status).toBe('ISSUED');
    expect(sentTo('Baraka')).toHaveLength(1);
  });

  it('logs a harvester’s arrival: the leader and the operator are told the rate and how many plots are cleared', async () => {
    const arrival: any = await gate.logArrival(chairman, { blockId, operatorName: 'Juma Combine', operatorPhone: '+255700111222', machine: 'Kubota DC' });
    expect(arrival.departedAt).toBeNull();
    expect(sentTo('Block')[0].text).toMatch(/Juma Combine \(Kubota DC\) has arrived in block 1:1R\. 3 plot\(s\) are cleared, 1 are locked/);
    const op = texts.find((t) => t.to === '+255700111222')!;
    expect(op.text).toMatch(/30,000 kwa hekta.*Mashamba 3 yameruhusiwa, 1 yamefungwa/);
    await expect(gate.logArrival(chairman, { blockId, operatorName: 'Juma Combine' })).rejects.toThrow(/already logged in/);
    expect(((await gate.listArrivals(chairman, { onSite: 'true' })) as any).data).toHaveLength(1);
  });

  it('an operator checks a code, then harvests: the pass is used once and cannot be used again', async () => {
    const asha = (await passOf('h1'))!;
    expect(((await gate.lookup(operator, asha.code.toLowerCase())) as any)).toMatchObject({ cleared: true, plot: '1:1R-1', farmer: { name: 'Asha Kimaro' }, status: 'ISSUED' });
    await expect(gate.lookup(operator, 'ZZZZZZ')).rejects.toBeInstanceOf(NotFoundException);
    const arrival = (await prisma.harvestArrival.findFirstOrThrow({ where: { blockId } })).id;
    const used: any = await gate.usePass(operator, { code: asha.code, arrivalId: arrival });
    expect(used).toMatchObject({ status: 'USED', usedVia: 'CODE' });
    await expect(gate.usePass(operator, { code: asha.code })).rejects.toThrow(/already used/);
    expect(await prisma.harvestIncident.count({ where: { mamcosId, kind: 'BLOCKED', description: { contains: 'already used' } } })).toBe(1);
  });

  it('refuses an uncleared plot, tells the canal leader once, and keeps the operator from signing plots off', async () => {
    await expect(gate.usePass(operator, { hectareId: hectare.h4 })).rejects.toThrow(/Only a block leader or the office/);
    texts.length = 0;
    await expect(gate.usePass(chairman, { hectareId: hectare.h4 })).rejects.toThrow(/not cleared: the harvest fee is not fully paid/);
    await expect(gate.usePass(chairman, { hectareId: hectare.h4 })).rejects.toBeInstanceOf(ConflictException);
    const open = await prisma.harvestIncident.findMany({ where: { mamcosId, hectareId: hectare.h4 } });
    expect(open).toHaveLength(1); // the second attempt within the hour is not logged again
    expect(sentTo('Canal')).toHaveLength(1);
    expect(sentTo('Canal')[0].text).toMatch(/Uvunaji umezuiwa 1:1R-4/);
    // a cleared plot the chairman signs off by its hectare
    const signed: any = await gate.usePass(chairman, { hectareId: hectare.h2 });
    expect(signed).toMatchObject({ status: 'USED', usedVia: 'CHAIRMAN' });
    await expect(gate.usePass(chairman, {})).rejects.toBeInstanceOf(BadRequestException);
  });

  it('the office can put a plot on hold and release it; a held plot is locked', async () => {
    const baraka = (await passOf('h3'))!;
    await expect(gate.hold(manager, baraka.id, '  ')).rejects.toThrow(/Say why/);
    expect(((await gate.hold(manager, baraka.id, 'Unpaid canal cleaning')) as any)).toMatchObject({ status: 'VOID', cleared: false, reason: 'HELD' });
    const block: any = await prisma.irrigationBlock.findUniqueOrThrow({ where: { id: blockId }, include: { canal: { include: { scheme: true } } } });
    const c: any = await fees.clearanceOfBlock(block);
    expect(c.hectares.find((h: any) => h.code === '1.1R3')).toMatchObject({ status: 'HELD', cleared: false, pass: { status: 'VOID' } });
    expect(c.summary).toMatchObject({ held: 1, harvested: 2 });
    await expect(gate.usePass(chairman, { code: baraka.code })).rejects.toThrow(/on hold/);
    expect(((await gate.release(manager, baraka.id)) as any).status).toBe('ISSUED');
    await expect(gate.release(manager, baraka.id)).rejects.toBeInstanceOf(ConflictException);
  });

  it('a voided payment locks a plot again even though its pass was issued', async () => {
    const baraka = (await passOf('h3'))!;
    const payment = await prisma.duePayment.findFirstOrThrow({ where: { farmerId: people.Baraka.farmerId, voidedAt: null } });
    await dues.voidPayment(manager, payment.id, 'Cheque bounced');
    expect(((await gate.lookup(operator, baraka.code)) as any)).toMatchObject({ cleared: false, reason: 'UNPAID' });
    await expect(gate.usePass(operator, { code: baraka.code })).rejects.toThrow(/not cleared/);
  });

  it('incidents: a block leader reports and sees them, only the canal leader or the office resolves', async () => {
    const reported: any = await gate.reportIncident(chairman, { blockId, hectareId: hectare.h4, description: 'The owner says he paid at the office' });
    expect(reported.kind).toBe('DISPUTE');
    const list: any = await gate.listIncidents(chairman, {});
    expect(list.data.length).toBeGreaterThanOrEqual(3);
    expect(list.data.find((i: any) => i.id === reported.id)).toMatchObject({ plot: '1:1R-4', block: { code: '1:1R' } });
    await expect(gate.resolveIncident(chairman, reported.id, 'Checked the receipts')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(gate.resolveIncident(canalChair, reported.id, '  ')).rejects.toBeInstanceOf(BadRequestException);
    expect(((await gate.resolveIncident(canalChair, reported.id, 'Receipt found; the cashier must record it')) as any).status).toBe('RESOLVED');
    await expect(gate.resolveIncident(canalChair, reported.id, 'again')).rejects.toBeInstanceOf(ConflictException);
    expect(((await gate.listIncidents(canalChair, { status: 'RESOLVED' })) as any).data).toHaveLength(1);
  });

  it('the harvester leaves the block and the plots harvested during the visit are counted', async () => {
    const arrival = await prisma.harvestArrival.findFirstOrThrow({ where: { blockId } });
    const out: any = await gate.depart(chairman, arrival.id);
    expect(out).toMatchObject({ departed: true, plotsHarvested: 1 });
    await expect(gate.depart(chairman, arrival.id)).rejects.toBeInstanceOf(ConflictException);
    expect(((await gate.listArrivals(chairman, { onSite: 'true' })) as any).data).toHaveLength(0);
  });

  it('ring-fencing: the Manager sets the split; the Accountant reconciles each day once', async () => {
    expect(await gate.getSplit(manager)).toEqual({ maintenancePercent: null, operatingPercent: null });
    const today = new Date().toISOString().slice(0, 10);
    await expect(gate.reconcile(manager, today)).rejects.toThrow(/set how harvest fees are divided/);
    await expect(gate.setSplit(manager, 20)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(gate.setSplit(approver, 120)).rejects.toBeInstanceOf(BadRequestException);
    expect(await gate.setSplit(approver, 20)).toEqual({ maintenancePercent: 20, operatingPercent: 80 });
    const view: any = await gate.reconciliation(manager, today);
    expect(view.payments).toBe(1); // Asha paid once for her two hectares; Baraka's payment was voided
    expect(view.collected).toBe(60_000);
    expect(view).toMatchObject({ maintenance: 12_000, operating: 48_000, maintenancePercent: 20, reconciled: null });
    expect(view.byMethod).toEqual({ CASH: 60_000 });
    expect(view.waiting).toContain(today);
    await expect(gate.reconcile(manager, '2999-01-01')).rejects.toBeInstanceOf(BadRequestException);
    const done: any = await gate.reconcile(manager, today, 'Cash counted and banked');
    expect(done.reconciled).toMatchObject({ collected: 60_000, operating: 48_000, maintenance: 12_000, note: 'Cash counted and banked' });
    expect(done.waiting).not.toContain(today);
    await expect(gate.reconcile(manager, today)).rejects.toBeInstanceOf(ConflictException);
    await setSplitAgain();
    async function setSplitAgain() { await gate.setSplit(approver, 30); expect(((await gate.reconciliation(manager, today)) as any).reconciled.maintenance).toBe(12_000); } // a signed day keeps what was signed
  });

  it('declares explicit permissions on every harvest route', () => {
    const proto = HarvestFeesController.prototype as any;
    const handlers = Object.getOwnPropertyNames(proto).filter((n) => n !== 'constructor' && typeof proto[n] === 'function');
    for (const h of handlers) expect(Reflect.getMetadata(PERMISSION_KEY, proto[h])).toBeTruthy();
    expect(Reflect.getMetadata(PERMISSION_KEY, proto.use)).toEqual({ resource: 'harvest_passes', action: 'EDIT' });
    expect(Reflect.getMetadata(PERMISSION_KEY, proto.setSplit)).toEqual({ resource: 'harvest_fee_approval', action: 'EDIT' });
    expect(Reflect.getMetadata(PERMISSION_KEY, proto.hold)).toEqual({ resource: 'harvest_fees', action: 'EDIT' });
  });
});
