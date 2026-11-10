/**
 * Integration tests for board / general meetings against the throw-away `irrigation_test` schema
 * (scripts/irrigation-test-schema.sh). SMS and notification senders are fakes. Skipped unless IRRIGATION_TEST_DATABASE_URL is set.
 */
import 'reflect-metadata';
import { randomUUID } from 'crypto';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaClient, UserRole } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { OwnershipService, RequestUser } from '../common/ownership.service';
import { PERMISSION_KEY } from '../auth/decorators/require-permission.decorator';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import { MeetingsController } from './meetings.controller';
import { MeetingsService, quorumNeeded } from './meetings.service';

const BASE_URL = process.env.IRRIGATION_TEST_DATABASE_URL;
const SCHEMA = 'irrigation_test';
const describeDb = BASE_URL ? describe : describe.skip;
const inHours = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();

describe('quorum', () => {
  it('needs at least one person and rounds up', () => {
    expect(quorumNeeded(5, 51)).toBe(3);
    expect(quorumNeeded(6, 51)).toBe(4);
    expect(quorumNeeded(3, 51)).toBe(2);
    expect(quorumNeeded(5, 25)).toBe(2);
    expect(quorumNeeded(1, 1)).toBe(1);
  });
});

describeDb('Governance meetings (PostgreSQL)', () => {
  jest.setTimeout(120_000);
  let pool: Pool; let prisma: PrismaClient; let meetings: MeetingsService;
  let adminA: RequestUser; let adminB: RequestUser; let mamcosA: string; let mamcosB: string;
  const people: Record<string, { farmerId: string; userId: string; phone: string }> = {};
  const texts: { to: string; text: string }[] = [];
  const me = (name: string) => ({ id: people[name].userId, role: UserRole.FARMER, mamcosId: mamcosA } as RequestUser);
  const sentTo = (name: string) => texts.filter((t) => t.to === people[name].phone);
  let boardMeetingId: string;

  const farmer = async (mamcosId: string, name: string, language = 'sw') => {
    const userId = randomUUID();
    const phone = `+2557${Math.floor(Math.random() * 1e8).toString().padStart(8, '0')}`;
    await prisma.user.create({ data: { id: userId, phone, passwordHash: 'x', role: UserRole.FARMER, language } as any });
    const row = await prisma.farmer.create({ data: { userId, controlNumber: `MT-${randomUUID().slice(0, 6)}`, firstName: name, lastName: 'Mwita', mamcosId } });
    people[name] = { farmerId: row.id, userId, phone };
    return row.id;
  };

  beforeAll(async () => {
    const url = `${BASE_URL!.split('?')[0]}?options=${encodeURIComponent(`-c search_path=${SCHEMA}`)}`;
    pool = new Pool({ connectionString: url, max: 6 });
    prisma = new PrismaClient({ adapter: new PrismaPg(pool, { schema: SCHEMA }) });
    const sms: any = { send: async (to: string, text: string) => { texts.push({ to, text }); } };
    const notifications: any = { create: async () => ({}) };
    meetings = new MeetingsService(prisma as any, new OwnershipService(prisma as any), sms, notifications);
    const tag = randomUUID().slice(0, 5);
    mamcosA = (await prisma.mamcos.create({ data: { name: `Madibira MT ${tag}` } })).id;
    mamcosB = (await prisma.mamcos.create({ data: { name: `Ubaruku MT ${tag}` } })).id;
    adminA = { id: randomUUID(), role: UserRole.CUSTOM, mamcosId: mamcosA };
    adminB = { id: randomUUID(), role: UserRole.CUSTOM, mamcosId: mamcosB };
    for (const [name, lang] of [['Chair', 'sw'], ['Secretary', 'en'], ['Treasurer', 'sw'], ['Member1', 'sw'], ['Member2', 'sw']] as const) await farmer(mamcosA, name, lang);
    await farmer(mamcosB, 'Outsider');
    for (const [name, position] of [['Chair', 'CHAIRPERSON'], ['Secretary', 'SECRETARY'], ['Treasurer', 'TREASURER']] as const)
      await prisma.boardMember.create({ data: { mamcosId: mamcosA, farmerId: people[name].farmerId, position, termStart: new Date('2026-01-01') } });
  });
  beforeEach(() => { texts.length = 0; });
  afterAll(async () => { await prisma.$disconnect(); await pool.end(); });

  it('texts every board member, and only them, when a board meeting is scheduled', async () => {
    const m: any = await meetings.create(adminA, { kind: 'BOARD', title: 'Budget review', agenda: 'Approve the season budget and the fertilizer order', venue: 'AMCOS office, Madibira', scheduledAt: inHours(72) });
    boardMeetingId = m.id;
    expect(m).toMatchObject({ status: 'SCHEDULED', invited: 3, quorumPercent: 51, quorumNeeded: 2 });
    expect(texts.map((t) => t.to).sort()).toEqual(['Chair', 'Secretary', 'Treasurer'].map((n) => people[n].phone).sort());
    expect(sentTo('Chair')[0].text).toMatch(/Mkutano wa Bodi.*Budget review.*AMCOS office, Madibira.*Ajenda: Approve the season budget/);
    expect(sentTo('Secretary')[0].text).toMatch(/Board meeting "Budget review".*at AMCOS office, Madibira.*Agenda: Approve/); // in English for the English-speaking member
    expect(texts.some((t) => t.to === people.Member1.phone || t.to === people.Outsider.phone)).toBe(false);
  });

  it('refuses a past time, an empty board, and another AMCOS’s meeting', async () => {
    await expect(meetings.create(adminA, { kind: 'BOARD', title: 'Old', agenda: 'Something', venue: 'Here', scheduledAt: inHours(-5) })).rejects.toBeInstanceOf(BadRequestException);
    await expect(meetings.create(adminB, { kind: 'BOARD', title: 'No board', agenda: 'Something', venue: 'Here', scheduledAt: inHours(5) })).rejects.toThrow(/Add board members first/);
    await expect(meetings.detail(adminB, boardMeetingId)).rejects.toBeInstanceOf(NotFoundException);
    await expect(meetings.list(adminA, { mamcosId: mamcosB })).rejects.toBeInstanceOf(ForbiddenException);
    expect(((await meetings.list(adminB, {})) as any).data).toHaveLength(0);
  });

  it('tells the invited about a change and lets the office reschedule only before check-in opens', async () => {
    texts.length = 0;
    const m: any = await meetings.update(adminA, boardMeetingId, { venue: 'Community hall', scheduledAt: inHours(96) });
    expect(m.venue).toBe('Community hall');
    expect(texts).toHaveLength(3);
    expect(sentTo('Chair')[0].text).toMatch(/limebadilishwa.*Community hall/);
  });

  it('opens check-in, counts people, and will not start without a quorum', async () => {
    await expect(meetings.selfCheckIn(me('Chair'), boardMeetingId)).rejects.toThrow(/not open yet/);
    await meetings.openCheckIn(adminA, boardMeetingId);
    await expect(meetings.openCheckIn(adminA, boardMeetingId)).rejects.toBeInstanceOf(ConflictException);
    await expect(meetings.update(adminA, boardMeetingId, { venue: 'Elsewhere' })).rejects.toBeInstanceOf(ConflictException);
    await expect(meetings.selfCheckIn(me('Member1'), boardMeetingId)).rejects.toBeInstanceOf(NotFoundException); // not a board member
    const first: any = await meetings.selfCheckIn(me('Chair'), boardMeetingId);
    expect(first).toMatchObject({ checkedIn: true, present: 1, needed: 2, met: false });
    expect(((await meetings.selfCheckIn(me('Chair'), boardMeetingId)) as any).present).toBe(1); // checking in twice changes nothing
    await expect(meetings.start(adminA, boardMeetingId)).rejects.toThrow(/no quorum yet: 1 of 2/);
    await expect(meetings.markPresent(adminA, boardMeetingId, { farmerId: people.Member1.farmerId })).rejects.toThrow(/Only board members/);
    expect(((await meetings.markPresent(adminA, boardMeetingId, { farmerId: people.Secretary.farmerId })) as any)).toMatchObject({ present: 2, met: true });
    const d: any = await meetings.detail(adminA, boardMeetingId);
    expect(d.attendance.map((a: any) => [a.name.split(' ')[0], a.method])).toEqual([['Chair', 'SELF'], ['Secretary', 'OFFICE']]);
    expect(d.expected.filter((e: any) => !e.present).map((e: any) => e.name.split(' ')[0])).toEqual(['Treasurer']);
  });

  it('starts with a quorum, logs resolutions that can never be changed, and locks the minutes on close', async () => {
    expect(((await meetings.start(adminA, boardMeetingId)) as any).status).toBe('IN_SESSION');
    const r1: any = await meetings.addResolution(adminA, boardMeetingId, { title: 'Fertilizer order', text: 'Order 40 tonnes of urea before planting', votesFor: 3, votesAgainst: 0 });
    const r2: any = await meetings.addResolution(adminA, boardMeetingId, { title: 'Late fee', text: 'No late fee in the first month', outcome: 'REJECTED' });
    expect([r1.number, r2.number]).toEqual([1, 2]);
    await expect(prisma.$executeRawUnsafe(`update meeting_resolutions set text = 'changed' where id = '${r1.id}'`)).rejects.toThrow(/append-only/);
    await expect(prisma.$executeRawUnsafe(`delete from meeting_resolutions where id = '${r1.id}'`)).rejects.toThrow(/append-only/);
    await expect(meetings.close(adminA, boardMeetingId, { minutes: 'short' })).rejects.toThrow(); // minutes must say something
    const closed: any = await meetings.close(adminA, boardMeetingId, { minutes: 'Meeting opened at 10:00 with 2 of 3 members. Two resolutions were taken.' });
    expect(closed).toMatchObject({ status: 'CLOSED', minutesLocked: true });
    await expect(meetings.close(adminA, boardMeetingId, { minutes: 'Rewritten minutes after the fact' })).rejects.toBeInstanceOf(ConflictException);
    expect(((await meetings.resolutions(adminA, {})) as any).data.map((r: any) => r.title)).toEqual(expect.arrayContaining(['Fertilizer order', 'Late fee']));
    expect(((await meetings.resolutions(adminB, {})) as any).data).toHaveLength(0);
  });

  it('a general meeting invites every member; each member checks in; its resolutions go to the archive', async () => {
    texts.length = 0;
    const agm: any = await meetings.create(adminA, { kind: 'AGM', title: 'Annual General Meeting', agenda: 'Fees for the season and the bylaws', venue: 'Madibira grounds', scheduledAt: inHours(30 * 24) });
    expect(agm).toMatchObject({ invited: 5, quorumPercent: 25, quorumNeeded: 2 });
    expect(new Set(texts.map((t) => t.to))).toEqual(new Set(['Chair', 'Secretary', 'Treasurer', 'Member1', 'Member2'].map((n) => people[n].phone)));
    expect(sentTo('Member1')[0].text).toMatch(/Mkutano Mkuu/);
    // a board member sees both kinds, an ordinary member only the general meeting
    expect(((await meetings.forMe(me('Chair'))) as any).data.map((m: any) => m.kind).sort()).toEqual(['AGM']); // the board meeting is closed
    expect(((await meetings.forMe(me('Member1'))) as any).data.map((m: any) => m.title)).toEqual(['Annual General Meeting']);
    expect(((await meetings.forMe({ id: people.Outsider.userId, role: UserRole.FARMER } as RequestUser)) as any).data).toHaveLength(0);
    await meetings.openCheckIn(adminA, agm.id);
    expect(((await meetings.selfCheckIn(me('Member1'), agm.id)) as any).present).toBe(1);
    expect(((await meetings.forMe(me('Member1'))) as any).data[0]).toMatchObject({ checkInOpen: true, checkedIn: true });
    await meetings.selfCheckIn(me('Member2'), agm.id);
    await meetings.start(adminA, agm.id);
    await meetings.addResolution(adminA, agm.id, { title: 'Water fee', text: 'The water fee for the season is TZS 30,000 per hectare', votesFor: 180, votesAgainst: 12 });
    expect(((await meetings.resolutions(adminA, { kind: 'AGM' })) as any).data).toHaveLength(1);
    expect(((await meetings.resolutions(adminA, { kind: 'BOARD' })) as any).data).toHaveLength(2);
    await expect(meetings.addResolution(adminA, (await prisma.amcosMeeting.findFirstOrThrow({ where: { status: 'SCHEDULED' } }).catch(() => ({ id: randomUUID() }))).id, { title: 'Not started', text: 'This meeting has not started' })).rejects.toThrow();
  });

  it('reminds everyone once, within a day of the meeting; a cancelled meeting is announced', async () => {
    const soon: any = await meetings.create(adminA, { kind: 'BOARD', title: 'Urgent matter', agenda: 'Pump repair', venue: 'Office', scheduledAt: inHours(10) });
    const far: any = await meetings.create(adminA, { kind: 'BOARD', title: 'Later', agenda: 'Routine', venue: 'Office', scheduledAt: inHours(200) });
    texts.length = 0;
    expect(await meetings.sendReminders()).toBe(1);
    expect(texts).toHaveLength(3);
    expect(sentTo('Chair')[0].text).toMatch(/kumbusho.*Urgent matter/);
    texts.length = 0;
    expect(await meetings.sendReminders()).toBe(0); // only once
    expect(texts).toHaveLength(0);
    await expect(meetings.cancel(adminA, far.id, { reason: 'x' })).rejects.toThrow(); // reason too short
    const cancelled: any = await meetings.cancel(adminA, far.id, { reason: 'Chairman is travelling' });
    expect(cancelled.status).toBe('CANCELLED');
    expect(sentTo('Secretary').some((t) => /cancelled.*Chairman is travelling/.test(t.text))).toBe(true);
    await expect(meetings.openCheckIn(adminA, far.id)).rejects.toBeInstanceOf(ConflictException);
    await expect(meetings.cancel(adminA, soon.id, { reason: 'Held elsewhere' })).resolves.toBeTruthy();
  });

  it('declares explicit permissions on every office route and keeps the member routes to members', () => {
    const proto = MeetingsController.prototype as any;
    const handlers = Object.getOwnPropertyNames(proto).filter((n) => n !== 'constructor' && typeof proto[n] === 'function');
    for (const h of handlers.filter((n) => !['mine', 'checkIn'].includes(n))) expect(Reflect.getMetadata(PERMISSION_KEY, proto[h])).toMatchObject({ resource: 'board_meetings' });
    expect(Reflect.getMetadata(PERMISSION_KEY, proto.create)).toMatchObject({ action: 'CREATE' });
    expect(Reflect.getMetadata(PERMISSION_KEY, proto.start)).toMatchObject({ action: 'EDIT' });
    for (const h of ['mine', 'checkIn']) expect(Reflect.getMetadata(ROLES_KEY, proto[h])).toEqual([UserRole.FARMER]);
  });
});
