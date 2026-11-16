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

const BASE_URL = process.env.IRRIGATION_TEST_DATABASE_URL;
const SCHEMA = 'irrigation_test';
const describeDb = BASE_URL ? describe : describe.skip;

describeDb('Input applications from the app (PostgreSQL)', () => {
  jest.setTimeout(120_000);
  let pool: Pool; let prisma: PrismaClient; let svc: InputApplicationsService; let dist: InputDistributionService;
  let mamcosA: string; let mamcosB: string; let tag: string; let itemId: string; let farmerId: string;
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
    svc = new InputApplicationsService(prisma as any, ownership, sms, dist);
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

  it('approving gives the inputs out through Input Distribution: stock down, a charge, a code texted, marked as app', async () => {
    const r: any = await svc.approve(office, appId, undefined);
    expect(r.status).toBe('APPROVED');
    const issues = await prisma.inputIssue.findMany({ where: { applicationId: appId } });
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ channel: 'APP', quantity: 50, farmerId });
    expect(Number(issues[0].amount)).toBe(100_000);
    expect(texts.some((t) => /you received 50 kg/.test(t.text))).toBe(true);
    expect((await prisma.farmInputMovement.aggregate({ where: { itemId }, _sum: { quantity: true } }))._sum.quantity).toBe(50);
    expect(((await dist.list(office, {})) as any).data.find((x: any) => x.applicationId === appId).channel).toBe('APP');
    await expect(svc.approve(office, appId, undefined)).rejects.toBeInstanceOf(ConflictException);
    await expect(svc.withdraw(farmer, appId)).rejects.toBeInstanceOf(ConflictException);
  });

  it('holds an application when stock is short, then finishes it once stock is added', async () => {
    const a: any = await svc.apply(farmer, form({ lines: [{ itemId, quantity: 50 }] }) as any);
    await prisma.farmInputMovement.create({ data: { itemId, type: 'OUT', quantity: -30, note: 'used', createdByUserId: office.id } });
    await expect(svc.approve(office, a.id, undefined)).rejects.toThrow(/Nothing was given/);
    expect((await prisma.inputApplication.findUniqueOrThrow({ where: { id: a.id } })).status).toBe('SUBMITTED');
    await prisma.farmInputMovement.create({ data: { itemId, type: 'IN', quantity: 60, note: 'new stock', createdByUserId: office.id } });
    expect(((await svc.approve(office, a.id, undefined)) as any).status).toBe('APPROVED');
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
});
