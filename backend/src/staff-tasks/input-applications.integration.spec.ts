/** Farmers apply for inputs in the app; the office approves and the inputs go out through Input Distribution. Needs IRRIGATION_TEST_DATABASE_URL. */
import 'reflect-metadata';
import { randomUUID } from 'crypto';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaClient, UserRole } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { OwnershipService, RequestUser } from '../common/ownership.service';
import { AccountingService } from '../accounting/accounting.service';
import { InputStockService } from '../input-stock/input-stock.service';
import { InputDistributionService } from './input-distribution.service';
import { InputApplicationsService, TERMS_VERSION } from './input-applications.service';
import { InputWarehouseService } from './input-warehouse.service';

const BASE_URL = process.env.IRRIGATION_TEST_DATABASE_URL;
const SCHEMA = 'irrigation_test';
const describeDb = BASE_URL ? describe : describe.skip;

describeDb('Input applications from the app (PostgreSQL)', () => {
  jest.setTimeout(120_000);
  let pool: Pool; let prisma: PrismaClient; let svc: InputApplicationsService; let dist: InputDistributionService;
  let mamcosA: string; let mamcosB: string; let tag: string; let itemId: string; let farmerId: string;
  let wh1: string; let wh2: string; let keeper: RequestUser; let otherKeeper: RequestUser; const alerts: any[] = [];
  let farmer: RequestUser; let office: RequestUser; let outsider: RequestUser; let other: RequestUser;
  const texts: { to: string; text: string }[] = [];
  const grants = (list: [string, string][]) => ({ isActive: true, isSystem: false, permissions: list.map(([resource, action]) => ({ action, resource: { key: resource } })) });
  const mkUser = async (mamcosId: string, role: UserRole, phone: string) => (await prisma.user.create({ data: { phone, passwordHash: 'x', role, mamcosId, firstName: 'U', lastName: 'Test', language: 'en' } as any })).id;
  const phone = () => `+2557${Math.floor(Math.random() * 1e8).toString().padStart(8, '0')}`;
  const form = (over: any = {}) => ({ farmIds: ['9:1R-1'], lines: [{ itemId, quantity: 50 }], acceptTerms: true, termsVersion: TERMS_VERSION, ...over });

  beforeAll(async () => {
    const url = `${BASE_URL!.split('?')[0]}?options=${encodeURIComponent(`-c search_path=${SCHEMA}`)}`;
    pool = new Pool({ connectionString: url, max: 6 });
    prisma = new PrismaClient({ adapter: new PrismaPg(pool, { schema: SCHEMA }) });
    const ownership = new OwnershipService(prisma as any);
    const sms: any = { send: async (to: string, text: string) => { texts.push({ to, text }); } };
    dist = new InputDistributionService(prisma as any, ownership, new AccountingService(prisma as any, ownership), sms, new InputStockService(prisma as any, ownership));
    const stock = new InputStockService(prisma as any, ownership);
    const whs = new InputWarehouseService(prisma as any, ownership, stock, { create: async (n: any) => { alerts.push(n); } } as any);
    svc = new InputApplicationsService(prisma as any, ownership, sms, dist, { describe: async () => ({ enabled: false, text: '' }) } as any, stock, whs);
    (global as any).__whs = whs;
    tag = randomUUID().slice(0, 5);
    mamcosA = (await prisma.mamcos.create({ data: { name: `Apps A ${tag}` } })).id;
    mamcosB = (await prisma.mamcos.create({ data: { name: `Apps B ${tag}` } })).id;
    const scheme = await prisma.irrigationScheme.create({ data: { mamcosId: mamcosA, name: `Apps Scheme ${tag}` } });
    const canal = await prisma.irrigationCanal.create({ data: { schemeId: scheme.id, canalNumber: 9, code: `AP9-${tag}`, name: 'Canal 9' } });
    const block = await prisma.irrigationBlock.create({ data: { canalId: canal.id, blockNumber: 1, code: '9.1R', side: 'RIGHT', areaHectares: 2, hectareCount: 2 } });
    const h1 = await prisma.irrigationHectare.create({ data: { blockId: block.id, hectareNumber: 1, code: '9.1R1', areaHectares: 1 } });
    await prisma.irrigationHectare.create({ data: { blockId: block.id, hectareNumber: 2, code: '9.1R2', areaHectares: 1 } });
    const fu = await mkUser(mamcosA, UserRole.FARMER, phone());
    farmerId = (await prisma.farmer.create({ data: { userId: fu, controlNumber: `AP-${tag}`, firstName: 'Elisha', lastName: 'Test', mamcosId: mamcosA } })).id;
    await prisma.irrigationHectareAllocation.create({ data: { hectareId: h1.id, farmerId, status: 'ACTIVE', allocatedOn: new Date('2026-01-01') } });
    farmer = { id: fu, role: UserRole.FARMER, mamcosId: mamcosA } as RequestUser;
    const ou = await mkUser(mamcosA, UserRole.CUSTOM, phone());
    office = { id: ou, role: UserRole.CUSTOM, mamcosId: mamcosA, customRole: grants([['input_distribution', 'VIEW'], ['input_distribution', 'CREATE'], ['input_distribution', 'EDIT']]) } as RequestUser;
    outsider = { id: await mkUser(mamcosB, UserRole.CUSTOM, phone()), role: UserRole.CUSTOM, mamcosId: mamcosB, customRole: grants([['input_distribution', 'VIEW'], ['input_distribution', 'CREATE'], ['input_distribution', 'EDIT']]) } as RequestUser;
    const ou2 = await mkUser(mamcosA, UserRole.FARMER, phone());
    await prisma.farmer.create({ data: { userId: ou2, controlNumber: `AQ-${tag}`, firstName: 'Other', lastName: 'Farmer', mamcosId: mamcosA } });
    other = { id: ou2, role: UserRole.FARMER, mamcosId: mamcosA } as RequestUser;
    wh1 = (await prisma.warehouse.create({ data: { mamcosId: mamcosA, name: 'Warehouse 01', location: 'Madibira', isDefaultForInputs: true } })).id;
    wh2 = (await prisma.warehouse.create({ data: { mamcosId: mamcosA, name: 'Warehouse 02' } })).id;
    const ku = await mkUser(mamcosA, UserRole.CUSTOM, phone()); const ku2 = await mkUser(mamcosA, UserRole.CUSTOM, phone());
    await prisma.warehouseKeeper.create({ data: { warehouseId: wh1, userId: ku } }); await prisma.warehouseKeeper.create({ data: { warehouseId: wh2, userId: ku2 } });
    const kg = grants([['input_distribution', 'VIEW'], ['input_distribution', 'CREATE']]);
    keeper = { id: ku, role: UserRole.CUSTOM, mamcosId: mamcosA, customRole: kg } as RequestUser; otherKeeper = { id: ku2, role: UserRole.CUSTOM, mamcosId: mamcosA, customRole: kg } as RequestUser;
    itemId = (await prisma.farmInputItem.create({ data: { mamcosId: mamcosA, name: `Urea ${tag}`, type: 'FERTILIZER' as any, unit: 'kg', unitCost: 2_000 } })).id;
    await prisma.farmInputMovement.create({ data: { itemId, type: 'IN', quantity: 100, note: 'opening', createdByUserId: ou } });
  });
  afterAll(async () => { await prisma.$disconnect(); await pool.end(); });

  let appId: string;
  it('gives the farmer their hectares, the inputs in stock and the terms to accept', async () => {
    const o: any = await svc.options(farmer);
    expect(o.hectares.map((h: any) => h.farmId)).toEqual(['9:1R-1']);
    expect(o.items.find((i: any) => i.id === itemId)).toMatchObject({ unit: 'kg', unitPrice: 2000, inStock: 100 });
    expect(o.terms.version).toBe(TERMS_VERSION);
    expect(o.terms.lines.length).toBeGreaterThan(2);
    await expect(svc.options(office)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('refuses an application without consent, for hectares the farmer does not farm, or for unavailable inputs', async () => {
    await expect(svc.apply(farmer, form({ acceptTerms: false }) as any)).rejects.toThrow(/accept the terms/);
    await expect(svc.apply(farmer, form({ termsVersion: 'old' }) as any)).rejects.toThrow(/terms have changed/);
    await expect(svc.apply(farmer, form({ farmIds: ['9:1R-2'] }) as any)).rejects.toThrow(/hectares that you farm/);
    await expect(svc.apply(farmer, form({ lines: [{ itemId: randomUUID(), quantity: 1 }] }) as any)).rejects.toThrow(/not available/);
    await expect(svc.apply(office, form() as any)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('records the application with the accepted terms, and the farmer sees it', async () => {
    const a: any = await svc.apply(farmer, form({ note: 'For my rice' }) as any);
    appId = a.id;
    expect(a).toMatchObject({ status: 'SUBMITTED', farmIds: ['9:1R-1'], estimatedTotal: 100_000 });
    expect(a.reference).toMatch(/^APP-\d{4}-0001$/);
    const row = await prisma.inputApplication.findUniqueOrThrow({ where: { id: appId } });
    expect(row.termsText).toContain('1.'); expect(row.consentAt).toBeTruthy();
    expect(((await svc.mine(farmer)) as any).data.map((x: any) => x.id)).toEqual([appId]);
    expect(((await svc.mine(other)) as any).data).toHaveLength(0);
  });

  it('shows the office the farmer, hectares and quantities, and keeps other cooperatives out', async () => {
    const l: any = await svc.list(office, { status: 'OPEN' });
    expect(l.data[0]).toMatchObject({ id: appId, farmer: { name: 'Elisha Test' }, farmIds: ['9:1R-1'], lines: [{ quantity: 50, unit: 'kg' }] });
    expect(((await svc.list(outsider, {})) as any).data).toHaveLength(0);
    expect((await svc.openCount(office)).open).toBe(1);
    await expect(svc.approve(outsider, appId, undefined)).rejects.toBeInstanceOf(NotFoundException);
  });

  let code = '';
  it('approving names the warehouse and texts an authorization code, without touching stock', async () => {
    const r: any = await svc.approve(office, appId, wh1);
    expect(r).toMatchObject({ status: 'READY', warehouse: 'Warehouse 01', codeSent: true });
    const sms = texts.filter((t) => /Collection code/.test(t.text)).pop()!.text;
    expect(sms).toMatch(/Urea .* 50 kg/); expect(sms).toMatch(/Collect at: Warehouse 01 \(Madibira\)/);
    code = /Collection code: (\d{6})/.exec(sms)![1];
    expect((await prisma.farmInputMovement.aggregate({ where: { itemId }, _sum: { quantity: true } }))._sum.quantity).toBe(100); // nothing deducted yet
    expect(await prisma.inputIssue.count({ where: { applicationId: appId } })).toBe(0);
    await expect(svc.approve(office, appId, wh1)).rejects.toBeInstanceOf(ConflictException);
  });

  it('only the keeper of that warehouse can use the code; a wrong code is refused', async () => {
    await expect(svc.lookup(otherKeeper, code)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(svc.lookup(keeper, '000000')).rejects.toBeInstanceOf(NotFoundException);
    const l: any = await svc.lookup(keeper, code);
    expect(l).toMatchObject({ reference: expect.stringMatching(/^APP-/), farmer: { name: 'Elisha Test' }, warehouse: { name: 'Warehouse 01' }, farmIds: ['9:1R-1'] });
    expect(l.lines[0]).toMatchObject({ quantity: 50, inStock: 100 });
  });

  it('the keeper hands over: stock comes out of that warehouse, everything is recorded, and the code cannot be used again', async () => {
    const lookup: any = await svc.lookup(keeper, code);
    const r: any = await svc.collect(keeper, code, [{ lineId: lookup.lines[0].id, quantity: 40 }]); // the farmer takes 40 of the 50
    expect(r.given).toEqual([expect.objectContaining({ name: expect.stringContaining('Urea'), qty: 40 })]);
    const issue = await prisma.inputIssue.findFirstOrThrow({ where: { applicationId: appId } });
    expect(issue).toMatchObject({ channel: 'APP', quantity: 40, farmerId, warehouseId: wh1, issuedById: keeper.id, ackStatus: 'ACKNOWLEDGED' });
    expect(issue.farmIds).toEqual(['9:1R-1']);
    expect(Number(issue.amount)).toBe(80_000);
    expect((await prisma.farmInputMovement.aggregate({ where: { itemId }, _sum: { quantity: true } }))._sum.quantity).toBe(60);
    expect(await prisma.farmInputMovement.count({ where: { refType: 'DISTRIBUTION', refId: issue.id, warehouseId: wh1 } })).toBeGreaterThan(0);
    expect((await prisma.inputApplication.findUniqueOrThrow({ where: { id: appId } }))).toMatchObject({ status: 'COLLECTED', collectCodeHash: null, collectedById: keeper.id });
    await expect(svc.lookup(keeper, code)).rejects.toBeInstanceOf(NotFoundException); // spent
    await expect(svc.collect(keeper, code, undefined)).rejects.toBeInstanceOf(NotFoundException);
    const h: any = await (global as any).__whs.collections(office, { warehouseId: wh1 });
    expect(h.data[0]).toMatchObject({ warehouse: 'Warehouse 01', keeper: 'U Test', farmer: { name: 'Elisha Test' }, previous: 100, issued: 40, remaining: 60, applicationRef: expect.stringMatching(/^APP-/) });
    const b: any = await (global as any).__whs.books(office, { warehouseId: wh1 });
    expect(b.data[0].lines[0]).toMatchObject({ received: 100, issued: 40, remaining: 60 });
  });

  it('will not promise the same stock twice, and a short warehouse is refused', async () => {
    const a: any = await svc.apply(farmer, form({ lines: [{ itemId, quantity: 40 }] }) as any);
    const b: any = await svc.apply(farmer, form({ lines: [{ itemId, quantity: 40 }] }) as any);
    await svc.approve(office, a.id, wh1); // 60 in stock, 40 now promised
    await expect(svc.approve(office, b.id, wh1)).rejects.toThrow(/already promised/);
    await expect(svc.approve(office, b.id, wh2)).rejects.toThrow(/does not have enough/); // warehouse 02 holds nothing
    await svc.reject(office, b.id, 'Not enough stock'); await svc.reject(office, a.id, 'Changed my mind');
  });

  it('warns management once when a warehouse reaches its minimum, and again only after it is topped up', async () => {
    const whs = (global as any).__whs as InputWarehouseService;
    await whs.setMinimum(office, { warehouseId: wh1, itemId, minQuantity: 50 });
    alerts.length = 0;
    const a: any = await svc.apply(farmer, form({ lines: [{ itemId, quantity: 20 }] }) as any);
    await svc.approve(office, a.id, wh1);
    const code2 = /Collection code: (\d{6})/.exec(texts.filter((t) => /Collection code/.test(t.text)).pop()!.text)![1];
    await svc.collect(keeper, code2, undefined); // 60 -> 40, below the minimum of 50
    await new Promise((r) => setTimeout(r, 300));
    expect((await whs.minimums(office) as any).data.find((x: any) => x.warehouseId === wh1 && x.itemId === itemId)).toMatchObject({ balance: 40, minQuantity: 50, low: true });
    expect(await whs.checkLow(mamcosA, wh1)).toBe(0); // already told
    const row = await prisma.inputStockThreshold.findFirstOrThrow({ where: { warehouseId: wh1, itemId } });
    expect(row.lowSince).toBeTruthy();
    await prisma.farmInputMovement.create({ data: { itemId, warehouseId: wh1, type: 'IN', quantity: 100, note: 'delivery', createdByUserId: office.id } });
    await whs.checkLow(mamcosA, wh1);
    expect((await prisma.inputStockThreshold.findFirstOrThrow({ where: { warehouseId: wh1, itemId } })).lowSince).toBeNull();
  });

  it('lets the farmer withdraw an unhandled application, and the office reject one with a reason', async () => {
    const a: any = await svc.apply(farmer, form({ lines: [{ itemId, quantity: 1 }] }) as any);
    expect(((await svc.withdraw(farmer, a.id)) as any).status).toBe('WITHDRAWN');
    await expect(svc.withdraw(other, a.id)).rejects.toBeInstanceOf(NotFoundException);
    const b: any = await svc.apply(farmer, form({ lines: [{ itemId, quantity: 1 }] }) as any);
    texts.length = 0;
    expect(((await svc.reject(office, b.id, 'Not enough stock this season')) as any).status).toBe('REJECTED');
    expect(texts.some((t) => /not approved.*Not enough stock/.test(t.text))).toBe(true);
    await expect(svc.reject(office, b.id, 'again')).rejects.toBeInstanceOf(ConflictException);
  });

  it('a lost code is replaced: the old one stops working', async () => {
    const a: any = await svc.apply(farmer, form({ lines: [{ itemId, quantity: 5 }] }) as any);
    await svc.approve(office, a.id, wh1);
    const first = /Collection code: (\d{6})/.exec(texts.filter((t) => /Collection code/.test(t.text)).pop()!.text)![1];
    await svc.resend(office, a.id, undefined);
    const second = /Collection code: (\d{6})/.exec(texts.filter((t) => /Collection code/.test(t.text)).pop()!.text)![1];
    expect(second).not.toBe(first);
    await expect(svc.lookup(keeper, first)).rejects.toBeInstanceOf(NotFoundException);
    expect(((await svc.lookup(keeper, second)) as any).reference).toBe(a.reference);
  });
});
