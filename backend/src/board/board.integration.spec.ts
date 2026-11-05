/**
 * Integration tests for the AMCOS board against the throw-away `irrigation_test` schema
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
import { BoardController } from './board.controller';
import { BoardService } from './board.service';

const BASE_URL = process.env.IRRIGATION_TEST_DATABASE_URL;
const SCHEMA = 'irrigation_test';
const describeDb = BASE_URL ? describe : describe.skip;

describeDb('AMCOS board (PostgreSQL)', () => {
  jest.setTimeout(60_000);
  let pool: Pool; let prisma: PrismaClient; let svc: BoardService;
  let adminA: RequestUser; let adminB: RequestUser; let mamcosA: string; let mamcosB: string;
  const f: Record<string, string> = {};

  const farmer = async (mamcosId: string, name: string) => {
    const u = await prisma.user.create({ data: { phone: `+2557${Math.floor(Math.random() * 1e8).toString().padStart(8, '0')}`, passwordHash: 'x', role: UserRole.FARMER } });
    const row = await prisma.farmer.create({ data: { userId: u.id, controlNumber: `BD-${randomUUID().slice(0, 6)}`, firstName: name, lastName: 'Mwakyusa', mamcosId } });
    f[name] = row.id;
  };

  beforeAll(async () => {
    const url = `${BASE_URL!.split('?')[0]}?options=${encodeURIComponent(`-c search_path=${SCHEMA}`)}`;
    pool = new Pool({ connectionString: url, max: 4 });
    prisma = new PrismaClient({ adapter: new PrismaPg(pool, { schema: SCHEMA }) });
    svc = new BoardService(prisma as any, new OwnershipService(prisma as any));
    const tag = randomUUID().slice(0, 5);
    mamcosA = (await prisma.mamcos.create({ data: { name: `Board A ${tag}` } })).id;
    mamcosB = (await prisma.mamcos.create({ data: { name: `Board B ${tag}` } })).id;
    for (const n of ['Amani', 'Bahati', 'Cosmas', 'Doreen']) await farmer(mamcosA, n);
    await farmer(mamcosB, 'Elia');
    adminA = { id: randomUUID(), role: UserRole.CUSTOM, mamcosId: mamcosA };
    adminB = { id: randomUUID(), role: UserRole.CUSTOM, mamcosId: mamcosB };
  });
  afterAll(async () => { await prisma.$disconnect(); await pool.end(); });

  it('adds registered farmers, defaulting to an ordinary seat, and lists officers first', async () => {
    await svc.add(adminA, { farmerId: f.Amani, termStart: '2026-01-01' });
    await svc.add(adminA, { farmerId: f.Bahati, position: 'CHAIRPERSON', termStart: '2026-01-01', termEnd: '2028-12-31' });
    const list: any = await svc.list(adminA, {});
    expect(list.data.map((m: any) => [m.farmer.name.split(' ')[0], m.position])).toEqual([['Bahati', 'CHAIRPERSON'], ['Amani', 'MEMBER']]);
    expect(list.totals.active).toBe(2);
    expect(list.totals.vacantPosts).toEqual(['Vice chairperson', 'Secretary', 'Treasurer']);
  });

  it('finds only farmers of this AMCOS who are not already seated', async () => {
    const all: any = await svc.candidates(adminA, {}); // no search text: the dropdown opens with the first farmers
    expect(all.data.length).toBeGreaterThan(0);
    expect(all.data.every((x: any) => !['Amani', 'Bahati'].includes(x.name.split(' ')[0]))).toBe(true);
    const found: any = await svc.candidates(adminA, { q: 'Mwakyusa' });
    expect(found.data.map((x: any) => x.name.split(' ')[0]).sort()).toEqual(['Cosmas', 'Doreen']);
  });

  it('refuses a second chair, a double seat, a farmer of another AMCOS and a backwards term', async () => {
    await expect(svc.add(adminA, { farmerId: f.Cosmas, position: 'CHAIRPERSON', termStart: '2026-01-01' })).rejects.toBeInstanceOf(ConflictException);
    await expect(svc.add(adminA, { farmerId: f.Amani, termStart: '2026-01-01' })).rejects.toThrow(/already on the board/);
    await expect(svc.add(adminA, { farmerId: f.Elia, termStart: '2026-01-01' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(svc.add(adminA, { farmerId: f.Cosmas, termStart: '2026-05-01', termEnd: '2026-01-01' })).rejects.toThrow(/cannot end before/);
    await expect(svc.list(adminA, { mamcosId: mamcosB })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('changes a post, but only to a free one', async () => {
    const seat = (await prisma.boardMember.findFirstOrThrow({ where: { farmerId: f.Amani } })).id;
    await expect(svc.update(adminA, seat, { position: 'CHAIRPERSON' })).rejects.toBeInstanceOf(ConflictException);
    const updated: any = await svc.update(adminA, seat, { position: 'TREASURER', notes: 'Elected at the AGM' });
    expect(updated).toMatchObject({ position: 'TREASURER', notes: 'Elected at the AGM' });
    await expect(svc.update(adminB, seat, { notes: 'x' })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('ending a term keeps the record, frees the post, and allows a later return', async () => {
    const seat = await prisma.boardMember.findFirstOrThrow({ where: { farmerId: f.Bahati } });
    await expect(svc.end(adminA, seat.id, { reason: '  ' })).rejects.toThrow(/why the term is ending/);
    await svc.end(adminA, seat.id, { reason: 'Resigned', endedOn: '2026-03-01' });
    const ended: any = await svc.list(adminA, { status: 'ENDED' });
    expect(ended.data).toHaveLength(1);
    expect(ended.data[0]).toMatchObject({ status: 'ENDED', endReason: 'Resigned' });
    await expect(svc.end(adminA, seat.id, { reason: 'again' })).rejects.toThrow(/already ended/);
    await expect(svc.update(adminA, seat.id, { notes: 'x' })).rejects.toBeInstanceOf(BadRequestException);
    await svc.add(adminA, { farmerId: f.Cosmas, position: 'CHAIRPERSON', termStart: '2026-03-02' }); // post is free again
    await svc.add(adminA, { farmerId: f.Bahati, termStart: '2026-03-02' }); // and the former chair can come back as a member
    expect(((await svc.list(adminA, { status: 'ALL' })) as any).data).toHaveLength(4);
  });

  it('each AMCOS sees only its own board', async () => {
    expect(((await svc.list(adminB, {})) as any).data).toHaveLength(0);
  });

  it('declares an explicit board_members permission on every route', () => {
    const proto = BoardController.prototype as any;
    const handlers = Object.getOwnPropertyNames(proto).filter((n) => n !== 'constructor' && typeof proto[n] === 'function');
    expect(handlers).toHaveLength(5);
    for (const h of handlers) expect(Reflect.getMetadata(PERMISSION_KEY, proto[h])?.resource).toBe('board_members');
    expect(Reflect.getMetadata(PERMISSION_KEY, proto.add).action).toBe('CREATE');
    expect(Reflect.getMetadata(PERMISSION_KEY, proto.end).action).toBe('EDIT');
  });
});
