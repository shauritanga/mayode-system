/**
 * Integration tests for AMCOS-to-farmer communication against the throw-away `irrigation_test` schema
 * (scripts/irrigation-test-schema.sh). SMS and email senders are fakes; nothing is sent. Skipped unless
 * IRRIGATION_TEST_DATABASE_URL is set.
 */
import 'reflect-metadata';
import { randomUUID } from 'crypto';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaClient, UserRole } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { OwnershipService, RequestUser } from '../common/ownership.service';
import { PERMISSION_KEY } from '../auth/decorators/require-permission.decorator';
import { CommunicationsController } from './communications.controller';
import { CommunicationsService, personalise } from './communications.service';
import { EmailService } from './email.service';

const BASE_URL = process.env.IRRIGATION_TEST_DATABASE_URL;
const SCHEMA = 'irrigation_test';
const describeDb = BASE_URL ? describe : describe.skip;

describeDb('Communication with farmers (PostgreSQL)', () => {
  jest.setTimeout(120_000);
  let pool: Pool;
  let prisma: PrismaClient;
  let svc: CommunicationsService;
  let adminA: RequestUser;
  let adminB: RequestUser;
  let mamcosA: string;
  let mamcosB: string;
  const smsSent: { to: string; text: string }[] = [];
  const emailSent: { to: string; subject: string; text: string }[] = [];
  const state = { smsOn: true, emailOn: true, smsFailFor: new Set<string>(), emailFailFor: new Set<string>() };
  const farmers: Record<string, string> = {};

  const makeFarmer = async (mamcosId: string, key: string, opts: { phone?: string | null; email?: string | null; active?: boolean } = {}) => {
    const userId = randomUUID();
    const phone = opts.phone === undefined ? `+2557${Math.floor(Math.random() * 1e8).toString().padStart(8, '0')}` : opts.phone;
    await prisma.user.create({ data: { id: userId, phone: phone ?? `+2556${Math.floor(Math.random() * 1e8).toString().padStart(8, '0')}`, passwordHash: 'x', role: UserRole.FARMER, isActive: opts.active ?? true } });
    const f = await prisma.farmer.create({ data: { userId, controlNumber: `CM-${randomUUID().slice(0, 6)}`, firstName: key, lastName: 'Mbarali', mamcosId, email: opts.email ?? null } });
    farmers[key] = f.id;
    return f;
  };

  beforeAll(async () => {
    const url = `${BASE_URL!.split('?')[0]}?options=${encodeURIComponent(`-c search_path=${SCHEMA}`)}`;
    pool = new Pool({ connectionString: url, max: 6 });
    prisma = new PrismaClient({ adapter: new PrismaPg(pool, { schema: SCHEMA }) });
    const [{ current_schema }] = await prisma.$queryRawUnsafe<{ current_schema: string }[]>('select current_schema()');
    expect(current_schema).toBe(SCHEMA);

    const sms: any = {
      isConfigured: () => state.smsOn,
      sendTransactional: async (to: string, text: string) => { if (state.smsFailFor.has(to)) return false; smsSent.push({ to, text }); return true; },
    };
    const email = { isConfigured: () => state.emailOn, send: async (to: string, subject: string, text: string) => { if (state.emailFailFor.has(to)) throw new Error('mailbox full'); emailSent.push({ to, subject, text }); } } as unknown as EmailService;
    svc = new CommunicationsService(prisma as any, new OwnershipService(prisma as any), sms, email);

    const tag = randomUUID().slice(0, 5);
    mamcosA = (await prisma.mamcos.create({ data: { name: `Madibira C ${tag}` } })).id;
    mamcosB = (await prisma.mamcos.create({ data: { name: `Ubaruku C ${tag}` } })).id;
    await makeFarmer(mamcosA, 'Asha', { email: 'asha@example.com' });
    await makeFarmer(mamcosA, 'Baraka', { email: 'Baraka@Example.com' });
    await makeFarmer(mamcosA, 'Chausiku'); // phone only
    await makeFarmer(mamcosA, 'Dotto', { active: false, email: 'dotto@example.com' }); // switched off
    await makeFarmer(mamcosB, 'Ester', { email: 'ester@example.com' });
    const admin = (mamcosId: string): RequestUser => ({ id: randomUUID(), role: UserRole.CUSTOM, mamcosId });
    adminA = admin(mamcosA);
    adminB = admin(mamcosB);
    await prisma.user.createMany({ data: [adminA, adminB].map((a, i) => ({ id: a.id, phone: `+25570000${i}${randomUUID().slice(0, 4).replace(/\D/g, '1')}`, passwordHash: 'x', role: UserRole.CUSTOM })) });
  });

  beforeEach(() => { smsSent.length = 0; emailSent.length = 0; state.smsOn = true; state.emailOn = true; state.smsFailFor.clear(); state.emailFailFor.clear(); });
  afterAll(async () => { await prisma.$disconnect(); await pool.end(); });

  it('personalises {name} and leaves other braces alone', () => {
    expect(personalise('Habari {name}, ratiba {date}', 'Asha')).toBe('Habari Asha, ratiba {date}');
  });

  describe('audience', () => {
    it('previews who can be reached and why others cannot', async () => {
      const p: any = await svc.preview(adminA, { audience: 'ALL', channel: 'BOTH' });
      expect(p).toMatchObject({ farmers: 4, sms: 3, email: 2 });
      expect(p.reasons).toEqual(expect.arrayContaining([
        { reason: 'Email: No email address on file', count: 1 }, { reason: 'SMS: Account is switched off', count: 1 }, { reason: 'Email: Account is switched off', count: 1 },
      ]));
      expect(p.channels).toEqual({ sms: { configured: true }, email: { configured: true } });
    });

    it('only ever reaches farmers of the sender’s own AMCOS', async () => {
      const ids = [farmers.Asha, farmers.Ester];
      await expect(svc.send(adminA, { audience: 'SELECTED', farmerIds: ids, channel: 'SMS', body: 'Hi' }, undefined, { inline: true })).rejects.toThrow(/not members of your AMCOS/);
      await expect(svc.preview(adminA, { audience: 'SELECTED', farmerIds: [farmers.Ester], channel: 'SMS' })).rejects.toBeInstanceOf(BadRequestException);
      await expect(svc.send(adminA, { audience: 'ALL', channel: 'SMS', body: 'Hi' }, mamcosB, { inline: true })).rejects.toBeInstanceOf(ForbiddenException);
      expect(smsSent).toHaveLength(0);
      const list: any = await svc.farmers(adminB, {});
      expect(list.data.map((f: any) => f.name)).toEqual(['Ester Mbarali']);
    });

    it('needs at least one farmer when choosing', async () => {
      await expect(svc.send(adminA, { audience: 'SELECTED', farmerIds: [], channel: 'SMS', body: 'Hi' }, undefined, { inline: true })).rejects.toThrow(/at least one farmer/);
    });
  });

  describe('targeting: canal, block, board and staff', () => {
    let canal1: string; let canal2: string; let block1: string; let block2: string; let canalB: string;
    const names = (rows: any[]) => rows.map((r) => r.farmer.name.split(' ')[0]).sort();

    beforeAll(async () => {
      const tag = randomUUID().slice(0, 5);
      const scheme = await prisma.irrigationScheme.create({ data: { mamcosId: mamcosA, code: `T-${tag}`, name: `Scheme ${tag}`, region: 'Mbeya', district: 'Mbarali', waterSource: 'River' } as any });
      const c1 = await prisma.irrigationCanal.create({ data: { schemeId: scheme.id, canalNumber: 1, code: 'C1', name: 'Canal 1' } as any });
      const c2 = await prisma.irrigationCanal.create({ data: { schemeId: scheme.id, canalNumber: 2, code: 'C2', name: 'Canal 2' } as any });
      const b1 = await prisma.irrigationBlock.create({ data: { canalId: c1.id, blockNumber: 1, side: 'RIGHT', code: `${tag}.1`, areaHectares: 30, hectareCount: 30 } as any });
      const b2 = await prisma.irrigationBlock.create({ data: { canalId: c1.id, blockNumber: 2, side: 'LEFT', code: `${tag}.2`, areaHectares: 30, hectareCount: 30 } as any });
      const b3 = await prisma.irrigationBlock.create({ data: { canalId: c2.id, blockNumber: 1, side: 'RIGHT', code: `${tag}.3`, areaHectares: 30, hectareCount: 30 } as any });
      canal1 = c1.id; canal2 = c2.id; block1 = b1.id; block2 = b2.id;
      const hect = (blockId: string, n: number) => prisma.irrigationHectare.create({ data: { blockId, hectareNumber: n, code: `${tag}-${blockId.slice(0, 4)}-${n}`, areaHectares: 1 } });
      const hold = async (farmerKey: string, blockId: string, n: number, status: 'ACTIVE' | 'ENDED' = 'ACTIVE') => {
        const h = await hect(blockId, n);
        return prisma.irrigationHectareAllocation.create({ data: { hectareId: h.id, farmerId: farmers[farmerKey], status, allocatedOn: new Date('2026-01-01'), ...(status === 'ENDED' ? { endedOn: new Date('2026-06-01') } : {}) } });
      };
      await hold('Asha', b1.id, 1);                 // Canal 1 · Block 1
      const baraka = await hold('Baraka', b2.id, 1); // Canal 1 · Block 2, registered to Baraka…
      await hold('Chausiku', b3.id, 1);              // Canal 2
      await hold('Dotto', b1.id, 2, 'ENDED');       // no longer holds anything
      await prisma.irrigationHectareGuardian.create({ data: { allocationId: baraka.id, guardianId: farmers.Asha, startedOn: new Date('2026-02-01') } }); // …guarded by Asha
      await prisma.irrigationLeadership.create({ data: { position: 'CANAL_LEADER', canalId: c1.id, farmerId: farmers.Chausiku, appointedOn: new Date('2026-01-01'), termStart: new Date('2026-01-01'), status: 'ACTIVE' } });
      await prisma.irrigationLeadership.create({ data: { position: 'BLOCK_LEADER', canalId: c1.id, blockId: b1.id, farmerId: farmers.Dotto, appointedOn: new Date('2025-01-01'), termStart: new Date('2025-01-01'), status: 'ENDED', endedOn: new Date('2025-12-01') } });
      // A canal of the other AMCOS.
      const schemeB = await prisma.irrigationScheme.create({ data: { mamcosId: mamcosB, code: `U-${tag}`, name: `Scheme B ${tag}`, region: 'Mbeya', district: 'Mbarali', waterSource: 'River' } as any });
      canalB = (await prisma.irrigationCanal.create({ data: { schemeId: schemeB.id, canalNumber: 1, code: 'C1', name: 'Canal 1' } as any })).id;
      // Staff: one active officer, one switched off, one of the other AMCOS.
      await prisma.user.create({ data: { phone: `+2557${Math.floor(Math.random() * 1e8).toString().padStart(8, '0')}`, passwordHash: 'x', firstName: 'Neema', lastName: 'Officer', role: UserRole.CUSTOM, mamcosId: mamcosA, email: `neema-${tag}@example.com` } });
      await prisma.user.create({ data: { phone: `+2557${Math.floor(Math.random() * 1e8).toString().padStart(8, '0')}`, passwordHash: 'x', firstName: 'Old', lastName: 'Clerk', role: UserRole.CUSTOM, mamcosId: mamcosA, isActive: false } });
      await prisma.user.create({ data: { phone: `+2557${Math.floor(Math.random() * 1e8).toString().padStart(8, '0')}`, passwordHash: 'x', firstName: 'Other', lastName: 'Staff', role: UserRole.CUSTOM, mamcosId: mamcosB } });
    });

    it('a canal reaches the farmers who hold or guard its land, and nobody else', async () => {
      const p: any = await svc.preview(adminA, { audience: 'CANAL', canalId: canal1, channel: 'SMS' });
      expect(p).toMatchObject({ people: 2, sms: 2, label: 'Farmers of Canal 1' }); // Asha (holder + guardian) and Baraka
      const sent: any = await svc.send(adminA, { audience: 'CANAL', canalId: canal2, channel: 'SMS', body: 'Habari {name}' }, undefined, { inline: true });
      expect(smsSent.map((m) => m.text)).toEqual(['Habari Chausiku']);
      expect(sent).toMatchObject({ audience: 'CANAL', canalId: canal2, audienceLabel: 'Farmers of Canal 2' });
    });

    it('a block narrows it further, counting guardians and ignoring ended allocations', async () => {
      const b1: any = await svc.send(adminA, { audience: 'BLOCK', blockId: block1, channel: 'SMS', body: 'Hi' }, undefined, { inline: true });
      expect(smsSent).toHaveLength(1); // Asha only; Dotto's allocation ended
      expect(b1.audienceLabel).toMatch(/^Farmers of Canal 1 · /);
      const detail: any = await svc.get(adminA, b1.id, {});
      expect(names(detail.recipients)).toEqual(['Asha']);
      smsSent.length = 0;
      await svc.send(adminA, { audience: 'BLOCK', blockId: block2, channel: 'SMS', body: 'Hi' }, undefined, { inline: true });
      expect(smsSent).toHaveLength(2); // Baraka (holder) and Asha (guardian)
    });

    it('refuses a canal or block that is not the sender’s, or missing', async () => {
      await expect(svc.preview(adminA, { audience: 'CANAL', canalId: canalB, channel: 'SMS' })).rejects.toThrow(/does not belong to your AMCOS/);
      await expect(svc.preview(adminA, { audience: 'CANAL', channel: 'SMS' })).rejects.toThrow(/Choose a canal/);
      await expect(svc.preview(adminA, { audience: 'BLOCK', channel: 'SMS' })).rejects.toThrow(/Choose a block/);
      await expect(svc.preview(adminA, { audience: 'BLOCK', blockId: block1, canalId: canal2, channel: 'SMS' })).rejects.toThrow(/does not belong to your AMCOS/);
    });

    it('board members are the farmers who currently hold a leadership post', async () => {
      const sent: any = await svc.send(adminA, { audience: 'BOARD', channel: 'SMS', body: 'Mkutano wa bodi, {name}' }, undefined, { inline: true });
      expect(smsSent.map((m) => m.text)).toEqual(['Mkutano wa bodi, Chausiku']); // Dotto's post ended
      const detail: any = await svc.get(adminA, sent.id, {});
      expect(detail.recipients[0]).toMatchObject({ kind: 'BOARD' });
    });

    it('staff are the active non-farmer users of the AMCOS, personalised by name', async () => {
      const p: any = await svc.preview(adminA, { audience: 'STAFF', channel: 'SMS' });
      expect(p.people).toBe(2); // Neema and the switched-off clerk; the other AMCOS's staff are not listed
      expect(p.sms).toBe(1);
      const sent: any = await svc.send(adminA, { audience: 'STAFF', channel: 'BOTH', subject: 'Notice', body: 'Hi {name}' }, undefined, { inline: true });
      expect(smsSent.map((m) => m.text)).toContain('Hi Neema');
      expect(emailSent.map((m) => m.to)).toEqual([expect.stringMatching(/^neema-.*@example\.com$/)]);
      const detail: any = await svc.get(adminA, sent.id, {});
      expect(detail.recipients.every((r: any) => r.kind === 'STAFF')).toBe(true);
      expect(detail.recipients.map((r: any) => r.farmer.name)).toContain('Neema Officer');
      const row = await prisma.communicationRecipient.findFirstOrThrow({ where: { communicationId: sent.id, recipientName: 'Neema Officer', channel: 'SMS' } });
      expect(row).toMatchObject({ farmerId: null, recipientKind: 'STAFF' });
      expect(row.userId).toBeTruthy();
    });

    it('lists canals, blocks, and head counts for the picker, per AMCOS', async () => {
      const t: any = await svc.targets(adminA);
      const c1 = t.canals.find((c: any) => c.id === canal1);
      expect(c1.farmers).toBe(2);
      expect(c1.blocks.map((b: any) => b.farmers)).toEqual([1, 2]);
      expect(t.canals.some((c: any) => c.id === canalB)).toBe(false);
      expect(t).toMatchObject({ board: 1, staff: 2 });
    });

    it('is protected by the communication permission', () => {
      const perm = Reflect.getMetadata(PERMISSION_KEY, CommunicationsController.prototype.targets);
      expect(perm).toMatchObject({ resource: 'communication', action: 'VIEW' });
    });
  });

  describe('sending', () => {
    it('texts every reachable farmer in the AMCOS, personalised, and records each outcome', async () => {
      const sent: any = await svc.send(adminA, { audience: 'ALL', channel: 'SMS', body: 'Habari {name}, mkutano kesho saa 4.' }, undefined, { inline: true });
      expect(smsSent.map((m) => m.text).sort()).toEqual(['Habari Asha, mkutano kesho saa 4.', 'Habari Baraka, mkutano kesho saa 4.', 'Habari Chausiku, mkutano kesho saa 4.']);
      const done = await prisma.communication.findUniqueOrThrow({ where: { id: sent.id } });
      expect(done).toMatchObject({ status: 'COMPLETED', sentCount: 3, failedCount: 0, skippedCount: 1, simulatedCount: 0, totalRecipients: 4, channel: 'SMS', subject: null });
      const dotto = await prisma.communicationRecipient.findFirstOrThrow({ where: { communicationId: sent.id, farmerId: farmers.Dotto } });
      expect(dotto).toMatchObject({ status: 'SKIPPED', error: 'Account is switched off' });
    });

    it('sends one individual or a chosen few, by email, with the subject personalised', async () => {
      await svc.send(adminA, { audience: 'SELECTED', farmerIds: [farmers.Baraka], channel: 'EMAIL', subject: 'Karibu {name}', body: 'Ujumbe.\n\nAsante.' }, undefined, { inline: true });
      expect(emailSent).toEqual([{ to: 'baraka@example.com', subject: 'Karibu Baraka', text: 'Ujumbe.\n\nAsante.' }]);
      expect(smsSent).toHaveLength(0);
    });

    it('can use both channels at once and counts each farmer on each', async () => {
      const sent: any = await svc.send(adminA, { audience: 'SELECTED', farmerIds: [farmers.Asha, farmers.Chausiku], channel: 'BOTH', subject: 'Taarifa', body: 'Ujumbe' }, undefined, { inline: true });
      expect(smsSent).toHaveLength(2);
      expect(emailSent.map((e) => e.to)).toEqual(['asha@example.com']);
      expect(await prisma.communication.findUniqueOrThrow({ where: { id: sent.id } })).toMatchObject({ sentCount: 3, skippedCount: 1, totalRecipients: 4 });
    });

    it('records failures per farmer without stopping the rest', async () => {
      const chausiku = (await prisma.user.findUniqueOrThrow({ where: { id: (await prisma.farmer.findUniqueOrThrow({ where: { id: farmers.Chausiku } })).userId } })).phone;
      state.smsFailFor.add(chausiku);
      state.emailFailFor.add('asha@example.com');
      const sent: any = await svc.send(adminA, { audience: 'ALL', channel: 'BOTH', subject: 'Taarifa', body: 'Ujumbe' }, undefined, { inline: true });
      const done = await prisma.communication.findUniqueOrThrow({ where: { id: sent.id } });
      expect(done).toMatchObject({ status: 'COMPLETED', failedCount: 2 });
      const failed = await prisma.communicationRecipient.findMany({ where: { communicationId: sent.id, status: 'FAILED' } });
      expect(failed.map((f) => f.error).sort()).toEqual(['The SMS provider did not accept the message', 'mailbox full']);
      expect(smsSent).toHaveLength(2); // Asha and Baraka still got theirs
      expect(emailSent.map((e) => e.to)).toEqual(['baraka@example.com']);
    });

    it('never reports a message as delivered when the provider is not configured', async () => {
      state.smsOn = false; state.emailOn = false;
      const sent: any = await svc.send(adminA, { audience: 'ALL', channel: 'BOTH', subject: 'Taarifa', body: 'Ujumbe' }, undefined, { inline: true });
      expect(smsSent).toHaveLength(0);
      expect(emailSent).toHaveLength(0);
      expect(await prisma.communication.findUniqueOrThrow({ where: { id: sent.id } })).toMatchObject({ sentCount: 0, simulatedCount: 5, failedCount: 0 });
    });

    it('rejects empty, over-long and incomplete messages and unreachable audiences', async () => {
      await expect(svc.send(adminA, { audience: 'ALL', channel: 'SMS', body: '   ' }, undefined, { inline: true })).rejects.toThrow(/Write the message/);
      await expect(svc.send(adminA, { audience: 'ALL', channel: 'SMS', body: 'x'.repeat(481) }, undefined, { inline: true })).rejects.toThrow(/at most 480/);
      await expect(svc.send(adminA, { audience: 'ALL', channel: 'EMAIL', body: 'Ujumbe' }, undefined, { inline: true })).rejects.toThrow(/needs a subject/);
      await expect(svc.send(adminA, { audience: 'SELECTED', farmerIds: [farmers.Chausiku], channel: 'EMAIL', subject: 'S', body: 'B' }, undefined, { inline: true })).rejects.toThrow(/None of the chosen recipients can be reached/);
      expect(await prisma.communication.count({ where: { mamcosId: mamcosA, body: '   ' } })).toBe(0);
    });

    it('does not email the same address twice when two farmers share one', async () => {
      const first = await makeFarmer(mamcosA, 'Pacha', { email: 'family@example.com' });
      const second = await makeFarmer(mamcosA, 'Pacha2', { email: 'Family@Example.com' });
      const p: any = await svc.preview(adminA, { audience: 'SELECTED', farmerIds: [first.id, second.id], channel: 'EMAIL' });
      expect(p).toMatchObject({ farmers: 2, email: 1, skipped: 1 });
      expect(p.reasons).toEqual([{ reason: 'Email: Same address as another recipient', count: 1 }]);
      await svc.send(adminA, { audience: 'SELECTED', farmerIds: [first.id, second.id], channel: 'EMAIL', subject: 'S', body: 'B' }, undefined, { inline: true });
      expect(emailSent).toHaveLength(1);
    });
  });

  describe('history', () => {
    it('lists only this AMCOS’s messages, newest first, with the sender and per-farmer results', async () => {
      const mine: any = await svc.list(adminA, {});
      expect(mine.meta.total).toBeGreaterThanOrEqual(5);
      expect(mine.data[0].createdAt >= mine.data[1].createdAt).toBe(true);
      expect((await svc.list(adminB, {}) as any).meta.total).toBe(0);
      const one = mine.data[mine.data.length - 1];
      const detail: any = await svc.get(adminA, one.id, {});
      expect(detail.communication.id).toBe(one.id);
      expect(detail.recipients.length).toBeGreaterThan(0);
      expect(detail.recipients[0]).toMatchObject({ farmer: { name: expect.any(String) } });
      expect((await svc.get(adminA, one.id, { status: 'SKIPPED' }) as any).recipients.every((r: any) => r.status === 'SKIPPED')).toBe(true);
      await expect(svc.get(adminB, one.id, {})).rejects.toBeInstanceOf(NotFoundException);
    });

    it('marks a send that was cut off by a restart as interrupted', async () => {
      const stuck = await prisma.communication.create({ data: { mamcosId: mamcosA, channel: 'SMS', audience: 'ALL', body: 'x', status: 'SENDING' } });
      await svc.onModuleInit();
      expect((await prisma.communication.findUniqueOrThrow({ where: { id: stuck.id } })).status).toBe('INTERRUPTED');
    });
  });

  it('declares an explicit permission on every route, and sending needs CREATE', () => {
    const proto = CommunicationsController.prototype as any;
    const handlers = Object.getOwnPropertyNames(proto).filter((n) => n !== 'constructor' && typeof proto[n] === 'function');
    expect(handlers.length).toBe(7);
    for (const name of handlers) expect(Reflect.getMetadata(PERMISSION_KEY, proto[name])?.resource).toBe('communication');
    expect(Reflect.getMetadata(PERMISSION_KEY, proto.send).action).toBe('CREATE');
  });
});
