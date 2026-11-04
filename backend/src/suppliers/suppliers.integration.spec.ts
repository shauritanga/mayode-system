/**
 * Integration tests for suppliers: each cooperative has its own, a supplier is an individual or a company, and older shared entries
 * stay readable but are not changeable by a cooperative, against the throw-away `irrigation_test` schema
 * (scripts/irrigation-test-schema.sh). Skipped unless IRRIGATION_TEST_DATABASE_URL is set.
 */
import 'reflect-metadata';
import { randomUUID } from 'crypto';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaClient, UserRole } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { OwnershipService } from '../common/ownership.service';
import { AccountingService } from '../accounting/accounting.service';
import { SuppliersService } from './suppliers.service';

const BASE_URL = process.env.IRRIGATION_TEST_DATABASE_URL;
const SCHEMA = 'irrigation_test';
const describeDb = BASE_URL ? describe : describe.skip;

describeDb('Suppliers (PostgreSQL)', () => {
  jest.setTimeout(120_000);
  let pool: Pool;
  let prisma: PrismaClient;
  let svc: SuppliersService;
  let accounting: AccountingService;
  const coop = async () => {
    const tag = randomUUID().slice(0, 6);
    const m = await prisma.mamcos.create({ data: { name: `Coop ${tag}`, code: `C-${tag.toUpperCase()}` } });
    return { id: m.id, actor: { id: randomUUID(), role: UserRole.CUSTOM, mamcosId: m.id } as any };
  };
  const superAdmin = { id: randomUUID(), role: UserRole.SUPER_ADMIN, mamcosId: null } as any;
  const uniq = (p: string) => `${p} ${randomUUID().slice(0, 6)}`;

  beforeAll(async () => {
    const url = `${BASE_URL!.split('?')[0]}?options=${encodeURIComponent(`-c search_path=${SCHEMA}`)}`;
    pool = new Pool({ connectionString: url, max: 6 });
    prisma = new PrismaClient({ adapter: new PrismaPg(pool, { schema: SCHEMA }) });
    svc = new SuppliersService(prisma as any);
    accounting = new AccountingService(prisma as any, new OwnershipService(prisma as any));
    await accounting.listAccounts();
  });
  afterAll(async () => { await prisma.$disconnect(); await pool.end(); });

  it('an individual keeps an ID number and a company keeps a registration number and a contact person, not the other way round', async () => {
    const c = await coop();
    const person: any = await svc.create({ kind: 'INDIVIDUAL', name: uniq('Juma Hassan'), contactPhone: '0712 000 111', idNumber: '1990-123', businessRegNo: 'IGNORED', vrn: 'IGNORED', contactPerson: 'IGNORED' } as any, c.actor);
    expect(person).toMatchObject({ kind: 'INDIVIDUAL', idNumber: '1990-123', businessRegNo: null, vrn: null, contactPerson: null, mamcosId: c.id });
    const firm: any = await svc.create({ kind: 'COMPANY', name: uniq('Agro Supplies Ltd'), contactPerson: 'Neema', businessRegNo: 'BRELA-1', vrn: '40-123456-A', idNumber: 'IGNORED', itemsSupplied: [' Seeds ', 'Seeds', 'Fertiliser'] } as any, c.actor);
    expect(firm).toMatchObject({ kind: 'COMPANY', businessRegNo: 'BRELA-1', vrn: '40-123456-A', contactPerson: 'Neema', idNumber: null });
    expect(firm.itemsSupplied).toEqual(['Seeds', 'Fertiliser']);
  });

  it('a supplier created without a kind is a company', async () => {
    const c = await coop();
    expect((await svc.create({ name: uniq('Old style') } as any, c.actor) as any).kind).toBe('COMPANY');
  });

  it('refuses a missing or one-letter name and a duplicate name in the same cooperative', async () => {
    const c = await coop();
    await expect(svc.create({ name: ' x ' } as any, c.actor)).rejects.toBeInstanceOf(BadRequestException);
    const name = uniq('Kilimo Traders');
    await svc.create({ name } as any, c.actor);
    await expect(svc.create({ name: name.toUpperCase() } as any, c.actor)).rejects.toBeInstanceOf(ConflictException);
    // Another cooperative may use the same name.
    const other = await coop();
    await expect(svc.create({ name } as any, other.actor)).resolves.toBeDefined();
  });

  it('each cooperative sees only its own suppliers, and a supplier of another cooperative is not found', async () => {
    const a = await coop();
    const b = await coop();
    const mine: any = await svc.create({ name: uniq('A only') } as any, a.actor);
    const theirs: any = await svc.create({ name: uniq('B only') } as any, b.actor);
    const seenByA = (await svc.findAll(a.actor)).map((s) => s.id);
    expect(seenByA).toContain(mine.id);
    expect(seenByA).not.toContain(theirs.id);
    await expect(svc.findOne(theirs.id, a.actor)).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc.update(theirs.id, { isActive: false }, a.actor)).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc.remove(theirs.id, a.actor)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('older shared suppliers are visible to every cooperative but only Super Admin can change them', async () => {
    const c = await coop();
    const shared = await prisma.supplier.create({ data: { name: uniq('Shared'), mamcosId: null, itemsSupplied: [] } });
    expect((await svc.findAll(c.actor)).map((s) => s.id)).toContain(shared.id);
    await expect(svc.update(shared.id, { notes: 'x' }, c.actor)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(svc.remove(shared.id, c.actor)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(svc.update(shared.id, { notes: 'platform note' }, superAdmin)).resolves.toMatchObject({ notes: 'platform note' });
  });

  it('switching a supplier off or on needs nothing but the switch, and a change of kind drops the other kind’s fields', async () => {
    const c = await coop();
    const s: any = await svc.create({ kind: 'COMPANY', name: uniq('Switch'), contactPerson: 'Neema', businessRegNo: 'BR-9', vrn: 'V-1' } as any, c.actor);
    expect((await svc.update(s.id, { isActive: false }, c.actor) as any).isActive).toBe(false);
    const person: any = await svc.update(s.id, { kind: 'INDIVIDUAL', idNumber: '123' }, c.actor);
    expect(person).toMatchObject({ kind: 'INDIVIDUAL', idNumber: '123', businessRegNo: null, vrn: null, contactPerson: null, isActive: false });
  });

  it('cannot delete a supplier that has a bill; deactivating is the way', async () => {
    const c = await coop();
    const s: any = await svc.create({ name: uniq('Billed') } as any, c.actor);
    await accounting.createBill({ amount: 1000, dueDate: new Date(Date.now() + 86_400_000).toISOString().slice(0, 10), supplier: 'x', supplierId: s.id } as any, { mamcosId: c.id }, 'u1');
    await expect(svc.remove(s.id, c.actor)).rejects.toBeInstanceOf(ConflictException);
    const plain: any = await svc.create({ name: uniq('Unused') } as any, c.actor);
    await expect(svc.remove(plain.id, c.actor)).resolves.toBeDefined();
  });

  it('a bill can use the cooperative’s own or a shared supplier, never another cooperative’s', async () => {
    const a = await coop();
    const b = await coop();
    const theirs: any = await svc.create({ name: uniq('B supplier') } as any, b.actor);
    const bill = { amount: 500, dueDate: new Date(Date.now() + 86_400_000).toISOString().slice(0, 10), supplier: 'x' };
    await expect(accounting.createBill({ ...bill, supplierId: theirs.id } as any, { mamcosId: a.id }, 'u1')).rejects.toThrow('your own suppliers');
    const shared = await prisma.supplier.create({ data: { name: uniq('Shared'), mamcosId: null, itemsSupplied: [] } });
    await expect(accounting.createBill({ ...bill, supplierId: shared.id } as any, { mamcosId: a.id }, 'u1')).resolves.toBeDefined();
  });
});
