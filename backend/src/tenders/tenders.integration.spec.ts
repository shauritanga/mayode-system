/**
 * Integration tests for infrastructure tenders against the throw-away `irrigation_test` schema (scripts/irrigation-test-schema.sh).
 * SMS and notification senders are fakes. Skipped unless IRRIGATION_TEST_DATABASE_URL is set.
 */
import 'reflect-metadata';
import { randomUUID } from 'crypto';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaClient, UserRole } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { OwnershipService, RequestUser } from '../common/ownership.service';
import { AccountingService } from '../accounting/accounting.service';
import { PERMISSION_KEY } from '../auth/decorators/require-permission.decorator';
import { ContractorsService } from './contractors.service';
import { TendersService } from './tenders.service';
import { TenderMilestonesService } from './tender-milestones.service';
import { ContractorPortalController, TendersController } from './tenders.controller';

const BASE_URL = process.env.IRRIGATION_TEST_DATABASE_URL;
const SCHEMA = 'irrigation_test';
const describeDb = BASE_URL ? describe : describe.skip;
const inHours = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();

describeDb('Infrastructure tenders (PostgreSQL)', () => {
  jest.setTimeout(120_000);
  let pool: Pool; let prisma: PrismaClient; let contractors: ContractorsService; let tenders: TendersService; let milestones: TenderMilestonesService; let accounting: AccountingService;
  let mamcosId: string; let canalId: string; let blockId: string;
  let procurement: RequestUser; let manager: RequestUser; let accountant: RequestUser; let chairman: RequestUser; let admin: RequestUser;
  const texts: { to: string; text: string }[] = [];
  const phones: Record<string, string> = {};
  const who: Record<string, RequestUser> = {};
  const sentTo = (n: string) => texts.filter((t) => t.to === phones[n]);
  let tenderId: string;
  const detail = (id = tenderId) => tenders.detail(procurement, id) as Promise<any>;

  const staff = async (mid: string | null = mamcosId): Promise<RequestUser> => {
    const id = randomUUID();
    await prisma.user.create({ data: { id, phone: `+2556${Math.floor(Math.random() * 1e8).toString().padStart(8, '0')}`, passwordHash: 'x', role: UserRole.CUSTOM, mamcosId: mid, firstName: 'Staff', lastName: 'Member' } as any });
    return { id, role: UserRole.CUSTOM, mamcosId: mid } as RequestUser;
  };
  const register = async (key: string, over: Record<string, unknown> = {}) => {
    const phone = `+2557${Math.floor(Math.random() * 1e8).toString().padStart(8, '0')}`;
    const r: any = await contractors.register({ kind: 'COMPANY', name: `${key} Works Ltd`, phone, password: 'Secret123!', tin: `TIN-${key}`, equipmentCount: 3, yearsExperience: 6, payoutMethod: 'MOBILE_MONEY', payoutAccount: phone, payoutName: key, ...over } as any);
    phones[key] = phone.startsWith('+') ? phone.replace('+', '') : phone; // phones are stored in international form without '+'
    const c = await prisma.contractor.findUniqueOrThrow({ where: { id: r.id } });
    phones[key] = c.phone; who[key] = { id: c.userId, role: UserRole.CUSTOM, mamcosId: null } as RequestUser;
    return c;
  };
  const bidFor = (key: string, price: number, equipment = 2, days = 30) => tenders.submitBid(who[key], tenderId, { price, technicalProposal: 'We will clear the canal with two excavators and a tipper, working six days a week.', equipmentOffered: equipment, completionDays: days });

  beforeAll(async () => {
    const url = `${BASE_URL!.split('?')[0]}?options=${encodeURIComponent(`-c search_path=${SCHEMA}`)}`;
    pool = new Pool({ connectionString: url, max: 6 });
    prisma = new PrismaClient({ adapter: new PrismaPg(pool, { schema: SCHEMA }) });
    const ownership = new OwnershipService(prisma as any);
    const sms: any = { send: async (to: string, text: string) => { texts.push({ to, text }); } };
    const notifications: any = { create: async () => ({}) };
    accounting = new AccountingService(prisma as any, ownership);
    contractors = new ContractorsService(prisma as any, sms);
    tenders = new TendersService(prisma as any, ownership, sms, notifications, contractors);
    milestones = new TenderMilestonesService(prisma as any, ownership, accounting, sms, notifications, contractors, tenders);

    const tag = randomUUID().slice(0, 5);
    mamcosId = (await prisma.mamcos.create({ data: { name: `Madibira TD ${tag}` } })).id;
    const scheme = await prisma.irrigationScheme.create({ data: { mamcosId, name: `Scheme ${tag}` } });
    canalId = (await prisma.irrigationCanal.create({ data: { schemeId: scheme.id, canalNumber: 3, code: `C3-${tag}`, name: 'Canal 3' } })).id;
    blockId = (await prisma.irrigationBlock.create({ data: { canalId, blockNumber: 4, code: '3.4R', side: 'RIGHT', areaHectares: 30, hectareCount: 30 } })).id;
    [procurement, manager, accountant, admin] = [await staff(), await staff(), await staff(), await staff()];
    // the chairman is a member whose login holds the block leader office
    const userId = randomUUID(); const phone = `+2556${Math.floor(Math.random() * 1e8).toString().padStart(8, '0')}`;
    await prisma.user.create({ data: { id: userId, phone, passwordHash: 'x', role: UserRole.CUSTOM, mamcosId, language: 'en' } as any });
    const farmer = await prisma.farmer.create({ data: { userId, controlNumber: `TD-${tag}`, firstName: 'Block', lastName: 'Chairman', mamcosId } });
    chairman = { id: userId, role: UserRole.CUSTOM, mamcosId } as RequestUser; phones.chair = phone;
    (global as any).__td = { farmerId: farmer.id, controlNumber: farmer.controlNumber, canalId, blockId };
  });
  beforeEach(() => { texts.length = 0; });
  afterAll(async () => { await prisma.$disconnect(); await pool.end(); });

  const tenderBody = (over: Record<string, unknown> = {}) => ({
    title: 'Desilting of Canal 3, blocks 4 to 8', scope: 'Remove silt from the main canal for 4 km and re-profile the banks so water flows to blocks 4 to 8.', category: 'DESILTING',
    canalId, blockIds: [blockId], budgetCeiling: 10_000_001, opensAt: inHours(-1), closesAt: inHours(48),
    milestones: [{ title: 'Mobilisation and first 2 km', percent: 30 }, { title: 'Second 2 km', percent: 40 }, { title: 'Final profiling and handover', percent: 30 }], ...over,
  });

  it('a contractor registers, but cannot bid until vetted', async () => {
    await expect(contractors.register({ kind: 'COMPANY', name: 'No Papers Ltd', phone: '+255755000001', password: 'Secret123!' } as any)).rejects.toThrow(/TIN or business registration/);
    await expect(contractors.register({ kind: 'MEMBER_GROUP', name: 'Vijana Group', phone: '+255755000002', password: 'Secret123!', memberNumber: 'NOPE-1' } as any)).rejects.toThrow(/not registered/);
    const a = await register('A');
    await register('B', { kind: 'INDIVIDUAL', name: 'Baraka Mwenda', tin: undefined, equipmentCount: 2, yearsExperience: 12 });
    await register('C', { kind: 'MEMBER_GROUP', name: 'Madibira Youth Group', tin: undefined, memberNumber: (global as any).__td.controlNumber, equipmentCount: 1, yearsExperience: 2 });
    expect(a.status).toBe('PENDING');
    await expect(contractors.register({ kind: 'COMPANY', name: 'Dup', phone: a.phone, password: 'Secret123!', tin: 'x' } as any)).rejects.toBeInstanceOf(ConflictException);
    const login = await prisma.user.findUniqueOrThrow({ where: { id: a.userId }, include: { customRole: { include: { permissions: { include: { resource: true } } } } } });
    expect(login.role).toBe('CUSTOM'); expect(login.mamcosId).toBeNull();
    expect(login.customRole!.permissions.map((p) => `${p.resource.key}:${p.action}`).sort()).toEqual(['tender_bidding:CREATE', 'tender_bidding:VIEW']);
    expect((await contractors.me(who.A)).status).toBe('PENDING');
  });

  it('the office vets contractors with a reason when it says no', async () => {
    const list: any = await contractors.list({ status: 'PENDING' });
    expect(list.data).toHaveLength(3);
    const idOf = async (k: string) => (await prisma.contractor.findFirstOrThrow({ where: { userId: who[k].id } })).id;
    await expect(contractors.vet(procurement, await idOf('A'), { status: 'REJECTED' } as any)).rejects.toThrow(/Say why/);
    for (const k of ['A', 'B', 'C']) await contractors.vet(procurement, await idOf(k), { status: 'VETTED' } as any);
    expect(sentTo('A')[0].text).toMatch(/Usajili wako wa mkandarasi umekubaliwa/);
    expect((await contractors.list({ status: 'VETTED' }) as any).data).toHaveLength(3);
  });

  it('refuses a badly formed tender', async () => {
    await expect(tenders.create(procurement, tenderBody({ wPrice: 50, wEquipment: 20, wExperience: 10, wPerformance: 10 }) as any)).rejects.toThrow(/add up to 100/);
    await expect(tenders.create(procurement, tenderBody({ wPrice: 50 }) as any)).rejects.toThrow(/all four evaluation weights/);
    await expect(tenders.create(procurement, tenderBody({ milestones: [{ title: 'Everything', percent: 90 }] }) as any)).rejects.toThrow(/add up to 100%/);
    await expect(tenders.create(procurement, tenderBody({ canalId: undefined, blockIds: [] }) as any)).rejects.toThrow(/canal or the blocks/);
    await expect(tenders.create(procurement, tenderBody({ closesAt: inHours(0.2) }) as any)).rejects.toThrow(/at least an hour/);
    await expect(tenders.create(procurement, tenderBody({ closesAt: inHours(-2) }) as any)).rejects.toThrow();
    await expect(tenders.create(procurement, tenderBody({ blockIds: [randomUUID()] }) as any)).rejects.toThrow(/do not belong/);
  });

  it('will not publish until a chairman is appointed to inspect the work; then texts every vetted contractor', async () => {
    const t: any = await tenders.create(procurement, tenderBody() as any);
    tenderId = t.id;
    expect(t.reference).toMatch(/^TND-\d{4}-001$/);
    await expect(tenders.publish(procurement, tenderId)).rejects.toThrow(/Appoint a canal or block leader/);
    const td = (global as any).__td;
    await prisma.irrigationLeadership.create({ data: { position: 'BLOCK_LEADER', canalId, blockId, farmerId: td.farmerId, appointedOn: new Date('2026-01-01'), termStart: new Date('2026-01-01') } });
    await tenders.publish(procurement, tenderId);
    await expect(tenders.publish(procurement, tenderId)).rejects.toBeInstanceOf(ConflictException);
    for (const k of ['A', 'B', 'C']) expect(sentTo(k).some((m) => /Zabuni ya MAYODE TND-/.test(m.text) && /Desilting/.test(m.text))).toBe(true);
  });

  it('keeps bids sealed: the office sees only a count, the log shows codes and no names', async () => {
    await expect(bidFor('A', 10_000_002)).rejects.toThrow(/above the budget ceiling/);
    await bidFor('A', 9_000_000, 3, 40);
    const b: any = await bidFor('B', 7_500_000, 1, 60);
    await bidFor('C', 8_200_000, 2, 45);
    expect(b.code).toMatch(/^B-[A-Z2-9]{4}$/);
    const again: any = await bidFor('B', 7_400_000, 2, 55); // a bid may be changed while open
    expect(again.code).toBe(b.code);
    expect(sentTo('B').some((m) => /Zabuni yako ya TND-.* imepokelewa/.test(m.text))).toBe(true);
    const d = await detail();
    expect(d).toMatchObject({ sealed: true, bidCount: 3, bids: null, contractor: null });
    const log = JSON.stringify(d.events);
    expect(log).toMatch(/BID_RECEIVED/); expect(log).not.toMatch(/Works Ltd|Baraka|Youth/);
    await expect(tenders.openBids(procurement, tenderId)).rejects.toThrow(/stay sealed until/);
    expect(((await tenders.list(procurement, {})) as any).data[0]).toMatchObject({ bids: 3, sealed: true });
    await expect(tenders.detail(admin, tenderId, randomUUID())).rejects.toBeInstanceOf(ForbiddenException); // another AMCOS's tender
    // a contractor not yet vetted cannot bid
    const late = await register('D');
    await expect(tenders.submitBid(who.D, tenderId, { price: 5_000_000, technicalProposal: 'x'.repeat(30), equipmentOffered: 1, completionDays: 10 })).rejects.toThrow(/still being checked/);
    expect(late.status).toBe('PENDING');
  });

  it('after the closing time the bids open once, ranked and still anonymous; late bids are refused', async () => {
    await prisma.tender.update({ where: { id: tenderId }, data: { opensAt: new Date(Date.now() - 7_200_000), closesAt: new Date(Date.now() - 60_000) } });
    await expect(bidFor('A', 8_000_000)).rejects.toThrow(/Bids have closed/);
    await expect(tenders.withdrawBid(who.A, tenderId)).rejects.toBeInstanceOf(ConflictException);
    const d: any = await tenders.openBids(procurement, tenderId);
    expect(d).toMatchObject({ status: 'EVALUATION', sealed: false, bidCount: 3 });
    expect(d.bids.map((b: any) => b.rank)).toEqual([1, 2, 3]);
    expect(d.bids.every((b: any) => b.contractor === null && /^B-/.test(b.code))).toBe(true);
    expect(d.bids.every((b: any) => b.total <= 100 && b.parts.price >= 0)).toBe(true);
    expect(d.bids[0].total).toBeGreaterThanOrEqual(d.bids[1].total);
    expect(JSON.stringify(d)).not.toMatch(/Works Ltd|Baraka Mwenda|Madibira Youth/); // no name anywhere
    await expect(tenders.openBids(procurement, tenderId)).rejects.toBeInstanceOf(ConflictException);
  });

  it('awarding takes two people: a reason to pick anyone but the top bid, and a different Manager to sign off', async () => {
    const d = await detail();
    const [top, second] = d.bids;
    await expect(tenders.recommend(procurement, tenderId, { bidId: second.id } as any)).rejects.toThrow(/not the top-ranked bid/);
    await expect(tenders.recommend(procurement, tenderId, { bidId: second.id, note: 'too short' } as any)).rejects.toThrow(/at least 20/);
    await expect(tenders.approve(manager, tenderId)).rejects.toThrow(/no recommended bid/);
    await tenders.recommend(procurement, tenderId, { bidId: top.id } as any);
    await expect(tenders.recommend(procurement, tenderId, { bidId: second.id, note: 'x'.repeat(30) } as any)).rejects.toThrow(/already recommended/);
    await expect(tenders.approve(procurement, tenderId)).rejects.toThrow(/someone other than the person who recommended/);
    // the Manager sends it back; the officer picks the second bid and must explain
    await expect(tenders.returnRecommendation(manager, tenderId, 'no', undefined)).rejects.toBeInstanceOf(BadRequestException);
    await tenders.returnRecommendation(manager, tenderId, 'I want the justification for the first choice');
    await tenders.recommend(procurement, tenderId, { bidId: second.id, note: 'Has two excavators already on site at Block 6, saving mobilisation time.' } as any);
    texts.length = 0;
    const awarded: any = await tenders.approve(manager, tenderId);
    expect(awarded.status).toBe('AWARDED');
    const winner = await prisma.tenderBid.findUniqueOrThrow({ where: { id: second.id }, include: { contractor: true } });
    expect(awarded.contractor.id).toBe(winner.contractorId); // the name is revealed only now
    expect(Number(awarded.contractPrice)).toBe(Number(winner.price));
    const sum = awarded.milestones.reduce((n: number, m: any) => n + m.amount, 0);
    expect(Math.round(sum * 100) / 100).toBe(Number(winner.price)); // the milestones add up exactly
    expect(awarded.milestones.map((m: any) => m.percent)).toEqual([30, 40, 30]);
    const keyOf = Object.keys(who).find((k) => who[k].id === winner.contractor.userId)!;
    expect(sentTo(keyOf)[0].text).toMatch(/Umepewa zabuni|awarded to you|Hongera/);
    const losers = ['A', 'B', 'C'].filter((k) => k !== keyOf);
    for (const k of losers) expect(sentTo(k)[0].text).toMatch(/imepewa mzabuni mwingine/);
    const kinds = awarded.events.map((e: any) => e.kind);
    expect(kinds).toEqual(expect.arrayContaining(['CREATED', 'PUBLISHED', 'BID_RECEIVED', 'BIDS_OPENED', 'RECOMMENDED', 'RECOMMENDATION_RETURNED', 'AWARDED']));
    expect(awarded.events.find((e: any) => e.kind === 'RECOMMENDED' && /Has two excavators/.test(e.detail))).toBeTruthy();
    (global as any).__winner = keyOf;
    await expect(tenders.cancel(procurement, tenderId, 'changed my mind')).rejects.toThrow(/already in force/);
  });

  it('the record of a tender can never be rewritten', async () => {
    await expect(prisma.$executeRawUnsafe(`update tender_events set detail = 'edited' where tender_id = '${tenderId}'`)).rejects.toThrow(/append-only/);
    await expect(prisma.$executeRawUnsafe(`delete from tender_events where tender_id = '${tenderId}'`)).rejects.toThrow(/append-only/);
  });

  it('milestones: contractor submits, only the chairman signs off, the Manager approves, someone else pays', async () => {
    const key = (global as any).__winner as string;
    const mine = who[key];
    const outsider = who[['A', 'B', 'C'].find((k) => k !== key)!];
    const [m1, m2, m3] = (await detail()).milestones;
    await expect(milestones.submit(mine, m2.id, { note: 'I started the second part already' })).rejects.toThrow(/earlier milestone/);
    await expect(milestones.submit(outsider, m1.id, { note: 'Not my contract at all' })).rejects.toBeInstanceOf(NotFoundException);
    texts.length = 0;
    await milestones.submit(mine, m1.id, { note: 'First 2 km desilted and banks re-profiled', evidenceUrls: ['/uploads/photo1.jpg'] });
    expect(sentTo('chair')[0].text).toMatch(/says milestone "Mobilisation and first 2 km".*inspect on site and sign off/); // the chairman is told, in English
    expect(((await milestones.forChairman(chairman)) as any).data).toHaveLength(1);
    expect(((await milestones.forChairman(manager)) as any).data).toHaveLength(0);
    await expect(milestones.signOff(manager, m1.id, 'Looks fine from the office')).rejects.toThrow(/Only the canal or block chairman/);
    await expect(milestones.approvePayment(manager, m1.id)).rejects.toThrow(/signed off/);
    await expect(milestones.requestRework(chairman, m1.id, 'bad')).rejects.toBeInstanceOf(BadRequestException);
    texts.length = 0;
    await milestones.requestRework(chairman, m1.id, 'The left bank is still too steep near the gate');
    expect(sentTo(key)[0].text).toMatch(/haikuidhinishwa: The left bank is still too steep/);
    await milestones.submit(mine, m1.id, { note: 'Left bank re-profiled' });
    await milestones.signOff(chairman, m1.id, 'Inspected on site with the gate opener; banks are right');
    await expect(milestones.pay(accountant, m1.id, { method: 'MOBILE_MONEY', reference: 'MP123' } as any)).rejects.toThrow(/Manager approved/);
    await milestones.approvePayment(manager, m1.id);
    await expect(milestones.pay(manager, m1.id, { method: 'MOBILE_MONEY', reference: 'MP123' } as any)).rejects.toThrow(/someone other than the Manager/);
    texts.length = 0;
    expect(await milestones.pay(accountant, m1.id, { method: 'MOBILE_MONEY', reference: 'MP123' } as any)).toMatchObject({ status: 'PAID', completed: false });
    expect(sentTo(key)[0].text).toMatch(/Malipo ya TZS .* yametumwa/);
    const lines = await prisma.ledgerEntry.findMany({ where: { sourceType: 'TenderMilestone', sourceId: m1.id }, include: { account: true } });
    expect(lines.every((l) => l.mamcosId === mamcosId)).toBe(true);
    expect(lines.map((l) => `${l.account.code}:${Number(l.debit) > 0 ? 'D' : 'C'}`).sort()).toEqual(['1000:C', '5420:D']);
    expect(Number(lines.find((l) => l.account.code === '5420')!.debit)).toBe((await detail()).milestones[0].amount);
    await expect(milestones.pay(accountant, m1.id, { method: 'BANK', reference: 'again' } as any)).rejects.toBeInstanceOf(ConflictException);

    // the rest of the contract
    for (const m of [m2, m3]) {
      await milestones.submit(mine, m.id, { note: `Milestone ${m.number} finished and ready` });
      await milestones.signOff(chairman, m.id, 'Inspected and accepted on site');
      await milestones.approvePayment(manager, m.id);
      const done = await milestones.pay(accountant, m.id, { method: 'BANK', reference: `BK-${m.number}` } as any);
      expect(done.completed).toBe(m.number === 3);
    }
    const final = await detail();
    expect(final).toMatchObject({ status: 'COMPLETED' });
    expect(Math.round((await prisma.ledgerEntry.findMany({ where: { sourceType: 'TenderMilestone', mamcosId }, include: { account: true } })).filter((l) => l.account.code === '5420').reduce((n, l) => n + Number(l.debit), 0) * 100) / 100).toBe(Number(final.contractPrice));
    await tenders.rate(manager, tenderId, 4);
    await expect(tenders.rate(manager, tenderId, 5)).rejects.toThrow(/already been rated/);
    expect((await contractors.me(mine)).averageRating).toBe(4);
  });

  it('a maintenance contract cannot be paid outside a tender: the account is closed to manual journals', async () => {
    const accounts = await accounting.listAccounts();
    const expense = accounts.find((a) => a.code === '5420')!; const cash = accounts.find((a) => a.code === '1000')!;
    await expect(accounting.createJournalEntry({ entryDate: new Date().toISOString().slice(0, 10), description: 'Pay my cousin to clear the canal', lines: [{ accountId: expense.id, debit: 1000 }, { accountId: cash.id, credit: 1000 }] } as any, { mamcosId }, manager.id)).rejects.toThrow(/only through a tender/);
  });

  it('the public portal lists what is open or awarded, with no bids and no drafts', async () => {
    const draft: any = await tenders.create(procurement, tenderBody({ title: 'Grading of the Block 4 to 8 access road' }) as any);
    const list: any = await tenders.publicList();
    expect(list.data.map((t: any) => t.id)).toContain(tenderId);
    expect(list.data.map((t: any) => t.id)).not.toContain(draft.id);
    expect(JSON.stringify(list)).not.toMatch(/contractPrice|technicalProposal|contractor|\"bids\"/i);
    expect(list.data[0]).toMatchObject({ amcos: expect.stringContaining('Madibira TD'), criteria: { price: 60, equipment: 15, experience: 10, performance: 15 } });
    await expect(tenders.publicOne(draft.id)).rejects.toBeInstanceOf(NotFoundException);
    // a tender can be cancelled before it is awarded, and the people who bid are told
    await tenders.publish(procurement, draft.id);
    await bidFor2(draft.id);
    texts.length = 0;
    await expect(tenders.cancel(procurement, draft.id, 'x')).rejects.toThrow(/Say why/);
    await tenders.cancel(procurement, draft.id, 'Funding for this road was moved to the canal repairs');
    expect(texts.some((m) => /imeghairiwa.*Funding for this road/.test(m.text))).toBe(true);
    async function bidFor2(id: string) { await tenders.submitBid(who.A, id, { price: 9_000_000, technicalProposal: 'Grader and roller, two weeks of work.', equipmentOffered: 2, completionDays: 14 }); }
  });

  it('declares explicit permissions on every route', () => {
    const office = TendersController.prototype as any;
    for (const h of Object.getOwnPropertyNames(office).filter((n) => n !== 'constructor' && typeof office[n] === 'function')) expect(Reflect.getMetadata(PERMISSION_KEY, office[h])).toBeTruthy();
    const portal = ContractorPortalController.prototype as any;
    for (const h of Object.getOwnPropertyNames(portal).filter((n) => n !== 'constructor' && typeof portal[n] === 'function')) expect(Reflect.getMetadata(PERMISSION_KEY, portal[h])).toMatchObject({ resource: 'tender_bidding' });
    expect(Reflect.getMetadata(PERMISSION_KEY, office.approve)).toEqual({ resource: 'tender_approval', action: 'EDIT' });
    expect(Reflect.getMetadata(PERMISSION_KEY, office.pay)).toEqual({ resource: 'tender_payments', action: 'EDIT' });
    expect(Reflect.getMetadata(PERMISSION_KEY, office.signOff)).toEqual({ resource: 'tender_milestones', action: 'EDIT' });
    expect(Reflect.getMetadata(PERMISSION_KEY, office.recommend)).toEqual({ resource: 'tenders', action: 'EDIT' });
  });
});
