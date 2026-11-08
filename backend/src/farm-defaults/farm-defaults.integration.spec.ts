/**
 * Integration tests for farms of farmers whose debt is past the grace period, against the throw-away `irrigation_test`
 * schema (scripts/irrigation-test-schema.sh). SMS and email senders are fakes. Skipped unless IRRIGATION_TEST_DATABASE_URL is set.
 */
import 'reflect-metadata';
import { randomUUID } from 'crypto';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaClient, UserRole } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { OwnershipService, RequestUser } from '../common/ownership.service';
import { AccountingService } from '../accounting/accounting.service';
import { ChargesService } from '../charges/charges.service';
import { DuesService } from '../dues/dues.service';
import { CommunicationsService } from '../communications/communications.service';
import { FarmingSeasonsService } from '../farming-seasons/farming-seasons.service';
import { PERMISSION_KEY } from '../auth/decorators/require-permission.decorator';
import { FarmDefaultsController } from './farm-defaults.controller';
import { FarmDefaultsService } from './farm-defaults.service';
import { assertFarmNotBlocked } from './farm-block';

const BASE_URL = process.env.IRRIGATION_TEST_DATABASE_URL;
const SCHEMA = 'irrigation_test';
const describeDb = BASE_URL ? describe : describe.skip;
const iso = (offsetDays = 0) => new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10);

describeDb('Farms of farmers with overdue debts (PostgreSQL)', () => {
  jest.setTimeout(120_000);
  let pool: Pool; let prisma: PrismaClient; let fd: FarmDefaultsService; let dues: DuesService;
  let adminA: RequestUser; let adminB: RequestUser; let mamcosA: string; let mamcosB: string;
  let owner: string; let payer: string; let other: string; let outsider: string; let late: string;
  let f1: string; let f2: string; let f3: string; let f4: string;
  const smsSent: { to: string; text: string }[] = [];
  const phoneOf: Record<string, string> = {};

  const farmer = async (mamcosId: string, name: string) => {
    const userId = randomUUID();
    const phone = `+2557${Math.floor(Math.random() * 1e8).toString().padStart(8, '0')}`;
    await prisma.user.create({ data: { id: userId, phone, passwordHash: 'x', role: UserRole.FARMER } });
    const row = await prisma.farmer.create({ data: { userId, controlNumber: `FD-${randomUUID().slice(0, 6)}`, firstName: name, lastName: 'Mwakasege', mamcosId } });
    phoneOf[row.id] = phone;
    return row.id;
  };
  const farm = async (farmerId: string, mamcosId: string, label: string) =>
    (await prisma.farm.create({ data: { farmCode: `FD-${label}-${randomUUID().slice(0, 5)}`, name: `Shamba ${label}`, farmerId, mamcosId, socialHectares: 2, isVerified: true } })).id;
  const due = (farmerId: string, mamcosId: string, amount: number, dueInDays: number, description = 'Levy') =>
    prisma.farmerDue.create({ data: { mamcosId, farmerId, category: 'LEVY', description, amount, issuedOn: new Date(iso(dueInDays - 30)), dueDate: new Date(iso(dueInDays)) } });
  const payAll = async (farmerId: string) => {
    const open = await prisma.farmerDue.findMany({ where: { farmerId, status: 'ACTIVE' }, include: { payments: { where: { voidedAt: null } } } });
    for (const d of open) {
      const bal = Number(d.amount) - Number(d.waivedAmount) - d.payments.reduce((t, p) => t + Number(p.amount), 0);
      if (bal > 0) await dues.recordPayment(adminA, d.id, { amount: bal, method: 'CASH' } as any);
    }
  };
  const until = async (check: () => Promise<boolean>) => { for (let i = 0; i < 40; i++) { if (await check()) return; await new Promise((r) => setTimeout(r, 50)); } throw new Error('condition not met in time'); };
  const farmsOf = (id: string) => prisma.farm.findMany({ where: { farmerId: id }, select: { id: true, adminStatus: true, isLeased: true, adminCaseId: true } });
  const openCase = (farmerId: string) => prisma.farmDefaultCase.findFirstOrThrow({ where: { farmerId }, orderBy: { createdAt: 'desc' } });

  beforeAll(async () => {
    const url = `${BASE_URL!.split('?')[0]}?options=${encodeURIComponent(`-c search_path=${SCHEMA}`)}`;
    pool = new Pool({ connectionString: url, max: 6 });
    prisma = new PrismaClient({ adapter: new PrismaPg(pool, { schema: SCHEMA }) });
    const ownership = new OwnershipService(prisma as any);
    const sms: any = { isConfigured: () => true, send: async (to: string, text: string) => { smsSent.push({ to, text }); }, sendTransactional: async (to: string, text: string) => { smsSent.push({ to, text }); return true; } };
    const email: any = { isConfigured: () => false, send: async () => undefined };
    const notifications: any = { create: async () => ({}) };
    const ledger = new AccountingService(prisma as any, ownership);
    dues = new DuesService(prisma as any, ownership, ledger, { get: () => fd } as any);
    const charges = new ChargesService(prisma as any, ownership);
    fd = new FarmDefaultsService(prisma as any, ownership, sms, notifications, charges, dues, new CommunicationsService(prisma as any, ownership, sms, email), new FarmingSeasonsService(prisma as any));
    (global as any).__charges = charges;

    const tag = randomUUID().slice(0, 5);
    mamcosA = (await prisma.mamcos.create({ data: { name: `Madibira FD ${tag}` } })).id;
    mamcosB = (await prisma.mamcos.create({ data: { name: `Ubaruku FD ${tag}` } })).id;
    adminA = { id: randomUUID(), role: UserRole.CUSTOM, mamcosId: mamcosA };
    adminB = { id: randomUUID(), role: UserRole.CUSTOM, mamcosId: mamcosB };
    [owner, payer, other] = [await farmer(mamcosA, 'Owner'), await farmer(mamcosA, 'Payer'), await farmer(mamcosA, 'Other')];
    outsider = await farmer(mamcosB, 'Outsider');
    f1 = await farm(owner, mamcosA, 'F1'); f2 = await farm(owner, mamcosA, 'F2'); f3 = await farm(other, mamcosA, 'F3'); f4 = await farm(other, mamcosA, 'F4');
    await prisma.farmingSeason.create({ data: { name: `Masika ${tag}`, mamcosId: mamcosA, startDate: new Date(iso(-10)), endDate: new Date(iso(120)), status: 'ACTIVE' } });
    await due(owner, mamcosA, 100_000, -3);    // three days past its due date
    await due(other, mamcosA, 40_000, 5);      // not due yet
  });
  beforeEach(() => { smsSent.length = 0; });
  afterAll(async () => { await prisma.$disconnect(); await pool.end(); });

  it('does nothing until the AMCOS switches the penalty on in Settings', async () => {
    expect(await fd.runCheck(mamcosA)).toMatchObject({ enabled: false, opened: 0 });
    await expect(fd.checkNow(adminA)).rejects.toBeInstanceOf(ConflictException);
    expect((await farmsOf(owner)).every((f) => f.adminStatus === 'NORMAL')).toBe(true);
  });

  it('blocks every farm the day a debt passes its due date and gives the farmer the grace period', async () => {
    const charges: ChargesService = (global as any).__charges;
    expect(await charges.update(adminA, 'DEFAULT_PENALTY', { isActive: true })).toMatchObject({ amount: 50_000, graceDays: 30 });
    await expect(charges.update(adminA, 'DEFAULT_PENALTY', { graceDays: 45 })).rejects.toThrow(/1 to 30/);
    await expect(charges.update(adminA, 'DEFAULT_PENALTY', { graceDays: 0 })).rejects.toThrow(/1 to 30/);

    expect(await fd.checkNow(adminA)).toMatchObject({ enabled: true, opened: 1 });
    expect((await farmsOf(owner)).map((f) => f.adminStatus)).toEqual(['UNDER_AMCOS', 'UNDER_AMCOS']);
    expect((await farmsOf(other)).map((f) => f.adminStatus)).toEqual(['NORMAL', 'NORMAL']); // nothing overdue yet
    const c = await openCase(owner);
    expect(c).toMatchObject({ status: 'UNDER_AMCOS', graceDays: 30 });
    expect(Number(c.debtAtOpen)).toBe(100_000);
    const days = (c.noticeDeadline!.getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(29.9); expect(days).toBeLessThanOrEqual(30);
    expect(await prisma.farmerDue.count({ where: { farmerId: owner, description: { startsWith: 'Overdue-debt penalty' } } })).toBe(0); // no penalty yet
    expect(smsSent).toHaveLength(1);
    expect(smsSent[0].to).toBe(phoneOf[owner]);
    expect(smsSent[0].text).toMatch(/Deni lako.*siku 30/);

    expect(await fd.runCheck(mamcosA)).toMatchObject({ opened: 0 }); // running again changes nothing
    expect(await prisma.farmDefaultCase.count({ where: { farmerId: owner } })).toBe(1);
  });

  it('refuses to lease, list or self-operate a blocked farm', () => {
    expect(() => assertFarmNotBlocked({ farmCode: 'X-1', adminStatus: 'UNDER_AMCOS' })).toThrow(/blocked from leasing/);
    expect(() => assertFarmNotBlocked({ adminStatus: 'AT_MLAX' })).toThrow(ConflictException);
    expect(() => assertFarmNotBlocked({ adminStatus: 'NORMAL' })).not.toThrow();
  });

  it('shows the case with the debt, farms and the day the grace ends', async () => {
    const list: any = await fd.list(adminA, {});
    expect(list).toMatchObject({ enabled: true, counts: { open: 1, notice: 0, mlax: 0, resolved: 0 } });
    expect(list.data[0]).toMatchObject({ status: 'UNDER_AMCOS', debt: 100_000, farmer: { name: 'Owner Mwakasege' } });
    expect(list.data[0].farms).toHaveLength(2);
    expect(list.data[0].graceEndsAt).toBeTruthy();
    expect(((await fd.forFarmer(adminA, owner)) as any).case.id).toBe(list.data[0].id);
    expect(((await fd.forFarmer(adminA, other)) as any).case).toBeNull();
  });

  it('gives the farms back as soon as the debt is paid during the grace period', async () => {
    smsSent.length = 0;
    await payAll(owner);
    await until(async () => (await openCase(owner)).status === 'RECLAIMED');
    expect((await farmsOf(owner)).every((f) => f.adminStatus === 'NORMAL' && f.adminCaseId === null)).toBe(true);
    await until(async () => smsSent.some((m) => /limerudi kama kawaida/.test(m.text)));
  });

  it('warns two days before the grace ends, then gives the farms to M-LAX with the penalty', async () => {
    await due(owner, mamcosA, 80_000, -40);
    expect(((await fd.checkNow(adminA)) as any).opened).toBe(1);
    const c = await openCase(owner);
    expect(await fd.advance()).toBe(0); // 30 days left: nothing happens
    expect((await openCase(owner)).status).toBe('UNDER_AMCOS');

    await prisma.farmDefaultCase.update({ where: { id: c.id }, data: { noticeDeadline: new Date(Date.now() + 24 * 3_600_000) } });
    smsSent.length = 0;
    expect(await fd.advance()).toBe(0);
    expect((await openCase(owner)).status).toBe('MLAX_NOTICE');
    expect((await farmsOf(owner)).map((f) => f.adminStatus)).toEqual(['MLAX_NOTICE', 'MLAX_NOTICE']);
    expect(smsSent).toHaveLength(1);
    expect(smsSent[0].text).toMatch(/Siku mbili|Muda wako wa nyongeza unaisha/);
    expect(await fd.advance()).toBe(0); // the warning is sent only once
    expect(smsSent).toHaveLength(1);
    expect(await prisma.landListing.count({ where: { defaultCaseId: c.id } })).toBe(0);

    await prisma.farmDefaultCase.update({ where: { id: c.id }, data: { noticeDeadline: new Date(Date.now() - 1000) } });
    smsSent.length = 0;
    expect(await fd.advance()).toBe(1);
    expect((await openCase(owner)).status).toBe('AT_MLAX');
    expect((await farmsOf(owner)).map((f) => f.adminStatus)).toEqual(['AT_MLAX', 'AT_MLAX']);
    expect(await prisma.farmerDue.count({ where: { farmerId: owner, description: { startsWith: 'Overdue-debt penalty' } } })).toBe(1);
    const listings = await prisma.landListing.findMany({ where: { defaultCaseId: c.id } });
    expect(listings).toHaveLength(2);
    expect(listings.every((l) => l.minimumPrice === 130_000 && l.leaseStatus === 'DRAFT' && l.ownerId === owner)).toBe(true); // 80,000 debt + 50,000 penalty
    await until(async () => new Set(smsSent.map((m) => m.to)).size >= 3);
    expect(smsSent.find((m) => m.to === phoneOf[owner] && /Hutapata chochote/.test(m.text))).toBeTruthy();
    expect(smsSent.filter((m) => /M-LAX/.test(m.text) && m.to === phoneOf[payer])).toHaveLength(1);
    expect(smsSent.some((m) => m.to === phoneOf[outsider])).toBe(false);
  });

  it('does not give the farms back once they are on M-LAX, even if the debt is then paid', async () => {
    await payAll(owner);
    await new Promise((r) => setTimeout(r, 400));
    await fd.sweep();
    expect((await openCase(owner)).status).toBe('AT_MLAX');
    expect((await farmsOf(owner)).every((f) => f.adminStatus === 'AT_MLAX')).toBe(true);
    const c = await openCase(owner);
    expect((await prisma.landListing.findMany({ where: { defaultCaseId: c.id } })).every((l) => l.leaseStatus === 'DRAFT')).toBe(true);
    await expect(fd.takeOver(adminA, c.id, { payerFarmerId: payer, farmIds: [f1], method: 'CASH' })).rejects.toBeInstanceOf(ConflictException);
  });

  it('lets the AMCOS release a case by hand, withdrawing its M-LAX listings, with a reason; the same debt does not block again', async () => {
    const c = await openCase(owner);
    await expect(fd.release(adminA, c.id, { reason: '  ' })).rejects.toThrow(/why the farms are being released/);
    await fd.release(adminA, c.id, { reason: 'Agreed a payment plan at the meeting' });
    expect(await openCase(owner)).toMatchObject({ status: 'CLOSED', resolvedNote: 'Agreed a payment plan at the meeting' });
    expect((await prisma.landListing.findMany({ where: { defaultCaseId: c.id } })).every((l) => l.leaseStatus === 'TERMINATED')).toBe(true);
    expect((await farmsOf(owner)).every((f) => f.adminStatus === 'NORMAL')).toBe(true);
    await expect(fd.release(adminA, c.id, { reason: 'again' })).rejects.toThrow(/already closed/);
    await due(owner, mamcosA, 10_000, -20); // overdue, but after the release
    expect(await fd.runCheck(mamcosA)).toMatchObject({ opened: 0 });
  });

  it('lets another farmer pay the debt and farm this season; the owner’s other farm comes back', async () => {
    await due(other, mamcosA, 60_000, -50);
    await fd.checkNow(adminA);
    const c = await openCase(other);
    await expect(fd.takeOver(adminA, c.id, { payerFarmerId: other, farmIds: [f3], method: 'CASH' })).rejects.toThrow(/reclaims the farm by paying/);
    await expect(fd.takeOver(adminA, c.id, { payerFarmerId: outsider, farmIds: [f3], method: 'CASH' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(fd.takeOver(adminA, c.id, { payerFarmerId: payer, farmIds: [f1], method: 'CASH' })).rejects.toThrow(/not part of this case/);

    const res: any = await fd.takeOver(adminA, c.id, { payerFarmerId: payer, farmIds: [f3], method: 'CASH', reference: 'RCPT-9' });
    expect(res).toMatchObject({ status: 'TAKEN_OVER', paid: 60_000 });
    expect(await openCase(other)).toMatchObject({ status: 'TAKEN_OVER', takenByFarmerId: payer, takenFarmIds: [f3] });
    expect(await prisma.seasonalFarmAssignment.findFirstOrThrow({ where: { farmId: f3 } })).toMatchObject({ activeFarmerId: payer, assignmentType: 'RENTED', status: 'VERIFIED' });
    const farms = Object.fromEntries((await farmsOf(other)).map((f) => [f.id, f]));
    expect(farms[f3]).toMatchObject({ adminStatus: 'NORMAL', isLeased: true });
    expect(farms[f4]).toMatchObject({ adminStatus: 'NORMAL', isLeased: false });
    await expect(fd.takeOver(adminA, c.id, { payerFarmerId: payer, farmIds: [f4], method: 'CASH' })).rejects.toBeInstanceOf(ConflictException);
  });

  it('shows a farmer their own case and the farms others could take, without the owner’s details', async () => {
    late = await farmer(mamcosA, 'Late');
    await farm(late, mamcosA, 'F5');
    await due(late, mamcosA, 20_000, -2);
    await fd.checkNow(adminA);
    const mine: any = await fd.forMe((await prisma.farmer.findUniqueOrThrow({ where: { id: late } })).userId);
    expect(mine.mine.status).toBe('UNDER_AMCOS');
    const theirs: any = await fd.forMe((await prisma.farmer.findUniqueOrThrow({ where: { id: payer } })).userId);
    expect(theirs.mine).toBeNull();
    expect(theirs.available).toHaveLength(1);
    expect(JSON.stringify(theirs.available)).not.toMatch(/Late|Mwakasege|phone/);
    expect(theirs.available[0].debt).toBe(20_000);
  });

  it('keeps each AMCOS to its own cases and the payer list to its own farmers', async () => {
    expect(((await fd.list(adminB, {})) as any).data).toHaveLength(0);
    await expect(fd.list(adminA, { mamcosId: mamcosB })).rejects.toBeInstanceOf(ForbiddenException);
    const payers: any = await fd.payers(adminA, { q: 'Mwakasege' });
    expect(payers.data.map((p: any) => p.name.split(' ')[0]).sort()).toEqual(['Late', 'Other', 'Owner', 'Payer']);
  });

  it('declares an explicit permission on every staff route', () => {
    const proto = FarmDefaultsController.prototype as any;
    const handlers = Object.getOwnPropertyNames(proto).filter((n) => n !== 'constructor' && typeof proto[n] === 'function');
    expect(handlers).toHaveLength(7);
    for (const h of handlers.filter((n) => n !== 'me')) expect(Reflect.getMetadata(PERMISSION_KEY, proto[h])).toBeTruthy();
    expect(Reflect.getMetadata(PERMISSION_KEY, proto.takeOver)).toMatchObject({ resource: 'farm_administration', action: 'EDIT' });
    expect(Reflect.getMetadata(PERMISSION_KEY, proto.check)).toMatchObject({ resource: 'farm_administration', action: 'CREATE' });
  });
});
