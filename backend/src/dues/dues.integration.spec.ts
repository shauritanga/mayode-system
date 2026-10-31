/**
 * Integration tests for farmer dues against the throw-away `irrigation_test` schema
 * (scripts/irrigation-test-schema.sh). Skipped unless IRRIGATION_TEST_DATABASE_URL is set.
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
import { DuesController } from './dues.controller';
import { DuesService } from './dues.service';

const BASE_URL = process.env.IRRIGATION_TEST_DATABASE_URL;
const SCHEMA = 'irrigation_test';
const describeDb = BASE_URL ? describe : describe.skip;
const iso = (offsetDays = 0) => new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10);

describeDb('Farmer dues (PostgreSQL)', () => {
  jest.setTimeout(120_000);
  let pool: Pool;
  let prisma: PrismaClient;
  let svc: DuesService;
  let ledger: AccountingService;
  let adminA: RequestUser;
  let adminB: RequestUser;
  let superAdmin: RequestUser;
  let mamcosA: string;
  let mamcosB: string;
  let asha: string; // holds 2 hectares
  let juma: string; // holds 1 hectare
  let neema: string; // holds none
  let outsider: string; // belongs to AMCOS B
  let levy: any;

  const farmer = async (mamcosId: string, name: string) => {
    const userId = randomUUID();
    await prisma.user.create({ data: { id: userId, phone: `+2557${Math.floor(Math.random() * 1e8).toString().padStart(8, '0')}`, passwordHash: 'x', role: UserRole.FARMER } });
    return (await prisma.farmer.create({ data: { userId, controlNumber: `D-${randomUUID().slice(0, 6)}`, firstName: name, lastName: 'Mbarali', mamcosId } })).id;
  };

  beforeAll(async () => {
    const url = `${BASE_URL!.split('?')[0]}?options=${encodeURIComponent(`-c search_path=${SCHEMA}`)}`;
    pool = new Pool({ connectionString: url, max: 6 });
    prisma = new PrismaClient({ adapter: new PrismaPg(pool, { schema: SCHEMA }) });
    const [{ current_schema }] = await prisma.$queryRawUnsafe<{ current_schema: string }[]>('select current_schema()');
    expect(current_schema).toBe(SCHEMA);
    const ownership = new OwnershipService(prisma as any);
    ledger = new AccountingService(prisma as any, ownership);
    svc = new DuesService(prisma as any, ownership, ledger);
    const tag = randomUUID().slice(0, 5);
    mamcosA = (await prisma.mamcos.create({ data: { name: `Madibira D ${tag}` } })).id;
    mamcosB = (await prisma.mamcos.create({ data: { name: `Ubaruku D ${tag}` } })).id;
    adminA = { id: randomUUID(), role: UserRole.CUSTOM, mamcosId: mamcosA };
    adminB = { id: randomUUID(), role: UserRole.CUSTOM, mamcosId: mamcosB };
    superAdmin = { id: randomUUID(), role: UserRole.SUPER_ADMIN, mamcosId: null };
    [asha, juma, neema] = [await farmer(mamcosA, 'Asha'), await farmer(mamcosA, 'Juma'), await farmer(mamcosA, 'Neema')];
    outsider = await farmer(mamcosB, 'Outsider');
    const scheme = await prisma.irrigationScheme.create({ data: { mamcosId: mamcosA, name: `Scheme ${tag}`, code: `D-${tag}` } });
    const canal = await prisma.irrigationCanal.create({ data: { schemeId: scheme.id, canalNumber: 1, code: 'C01', name: 'Canal 01' } });
    const block = await prisma.irrigationBlock.create({ data: { canalId: canal.id, blockNumber: 1, code: `D-C01-B01-${tag}`, areaHectares: 30, hectareCount: 30 } });
    let n = 0;
    for (const [farmerId, count] of [[asha, 2], [juma, 1]] as const) {
      for (let i = 0; i < count; i++) {
        const h = await prisma.irrigationHectare.create({ data: { blockId: block.id, hectareNumber: ++n, code: `H${n}` } });
        await prisma.irrigationHectareAllocation.create({ data: { hectareId: h.id, farmerId, status: 'ACTIVE', allocatedOn: new Date(iso(-30)) } });
      }
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await pool.end();
  });

  describe('charges', () => {
    it('defines a per-hectare levy and previews who would pay what', async () => {
      levy = await svc.createType(adminA, { name: 'Levy 2026', category: 'LEVY', basis: 'PER_HECTARE', rate: 10_000, season: '2026', dueDate: iso(30) });
      await expect(svc.createType(adminA, { name: 'Levy 2026', category: 'LEVY', basis: 'FLAT', rate: 1 })).rejects.toBeInstanceOf(ConflictException);
      await expect(svc.createType(adminA, { name: 'Mbolea', category: 'FERTILISER', basis: 'FLAT', rate: 1 })).rejects.toThrow(/issued to each farmer/);
      expect(await svc.previewCharge(adminA, levy.id, {})).toEqual({ farmers: 2, total: 30_000, alreadyCharged: 0, withoutHectares: 1 });
    });

    it('charges every farmer once, using the hectares they hold', async () => {
      expect(await svc.charge(adminA, levy.id, {})).toEqual({ charged: 2, total: 30_000, withoutHectares: 1 });
      const list: any = await svc.list(adminA, {});
      const amounts = Object.fromEntries(list.data.map((d: any) => [d.farmer.name, d.amount]));
      expect(amounts).toEqual({ 'Asha Mbarali': 20_000, 'Juma Mbarali': 10_000 });
      expect(list.totals).toMatchObject({ charged: 30_000, collected: 0, outstanding: 30_000 });
      await expect(svc.charge(adminA, levy.id, {})).rejects.toThrow(/already been charged/);
      // a rate change does not touch what was already charged
      await svc.updateType(adminA, levy.id, { rate: 99_000 });
      expect((await svc.list(adminA, {}) as any).totals.charged).toBe(30_000);
    });

    it('charges a flat membership fee to everyone, and rejects a past due date', async () => {
      const fee = await svc.createType(adminA, { name: 'Membership 2026', category: 'MEMBERSHIP_FEE', basis: 'FLAT', rate: 5_000 });
      expect((await svc.charge(adminA, fee.id, {}))).toMatchObject({ charged: 3, total: 15_000 });
      await expect(svc.charge(adminA, (await svc.createType(adminA, { name: 'Canal cleaning', category: 'CANAL_CLEANING', basis: 'PER_HECTARE', rate: 2_000 })).id, { dueDate: iso(-2) })).rejects.toThrow(/in the past/);
    });

    it('charges one farmer by hand but never twice for the same defined charge', async () => {
      const canal = await svc.createType(adminA, { name: 'Canal cleaning Oct', category: 'CANAL_CLEANING', basis: 'PER_HECTARE', rate: 2_000 });
      await svc.createDue(adminA, { farmerId: neema, category: 'CANAL_CLEANING', description: 'Canal cleaning Oct', amount: 3_000, typeId: canal.id });
      await expect(svc.createDue(adminA, { farmerId: neema, category: 'CANAL_CLEANING', description: 'again', amount: 3_000, typeId: canal.id })).rejects.toBeInstanceOf(ConflictException);
      await expect(svc.createDue(adminA, { farmerId: neema, category: 'FERTILISER', description: 'x', amount: 1 })).rejects.toThrow(/Issue fertiliser/);
      await expect(svc.createDue(adminA, { farmerId: outsider, category: 'OTHER', description: 'x', amount: 1 })).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('payments', () => {
    let ashaLevy: any;
    it('records part-payments with numbered receipts and keeps the balance', async () => {
      ashaLevy = ((await svc.list(adminA, { farmerId: asha, category: 'LEVY' }) as any).data[0]);
      const p1: any = await svc.recordPayment(adminA, ashaLevy.id, { amount: 5_000, method: 'CASH' });
      const p2: any = await svc.recordPayment(adminA, ashaLevy.id, { amount: 10_000, method: 'MOBILE_MONEY', reference: 'MP123' });
      expect([p1.receiptNo, p2.receiptNo]).toEqual(['RCT-000001', 'RCT-000002']);
      const d: any = await svc.detail(adminA, ashaLevy.id);
      expect(d).toMatchObject({ paid: 15_000, balance: 5_000, state: 'PARTIAL' });
      expect(d.payments).toHaveLength(2);
    });

    it('refuses overpayment, a future date and paying a settled due', async () => {
      await expect(svc.recordPayment(adminA, ashaLevy.id, { amount: 5_001, method: 'CASH' })).rejects.toThrow(/Only 5,000 is still owed/);
      await expect(svc.recordPayment(adminA, ashaLevy.id, { amount: 1, method: 'CASH', paidOn: iso(2) })).rejects.toThrow(/future/);
      await svc.recordPayment(adminA, ashaLevy.id, { amount: 5_000, method: 'CASH' });
      expect(((await svc.detail(adminA, ashaLevy.id)) as any).state).toBe('PAID');
      await expect(svc.recordPayment(adminA, ashaLevy.id, { amount: 1, method: 'CASH' })).rejects.toThrow(/already paid/);
    });

    it('two cashiers cannot overpay the same due at once', async () => {
      const due = ((await svc.list(adminA, { farmerId: juma, category: 'LEVY' }) as any).data[0]);
      const results = await Promise.allSettled([
        svc.recordPayment(adminA, due.id, { amount: 10_000, method: 'CASH' }),
        svc.recordPayment(adminA, due.id, { amount: 10_000, method: 'CASH' }),
      ]);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(((await svc.detail(adminA, due.id)) as any).paid).toBe(10_000);
    });

    it('books each payment as income on this AMCOS ledger only, and a void reverses it', async () => {
      const scope = ledger.scopeFor(adminA);
      const before = (await ledger.profitAndLoss(scope)).income;
      const due = ((await svc.list(adminA, { farmerId: neema, category: 'MEMBERSHIP_FEE' }) as any).data[0]);
      const pay: any = await svc.recordPayment(adminA, due.id, { amount: 5_000, method: 'CASH' });
      expect((await ledger.profitAndLoss(scope)).income).toBe(before + 5_000); // membership income, account 4200
      expect((await ledger.journalEntries(ledger.scopeFor(adminB))).some((j: any) => j.sourceType === 'DuePayment')).toBe(false);
      await svc.voidPayment(adminA, pay.id, 'Entered by mistake');
      expect((await ledger.profitAndLoss(scope)).income).toBe(before);
      expect(((await svc.detail(adminA, due.id)) as any)).toMatchObject({ paid: 0, balance: 5_000, state: 'OPEN' });
      await expect(svc.voidPayment(adminA, pay.id, 'again')).rejects.toBeInstanceOf(ConflictException);
      // the receipt stays on record, marked void
      expect(((await svc.detail(adminA, due.id)) as any).payments[0]).toMatchObject({ receiptNo: pay.receiptNo, voidReason: 'Entered by mistake' });
    });
  });

  describe('waive and cancel', () => {
    it('waives some or all of the balance with a reason, and cancels only an unpaid due', async () => {
      const d = ((await svc.list(adminA, { farmerId: neema, category: 'CANAL_CLEANING' }) as any).data[0]);
      await svc.waive(adminA, d.id, { reason: 'Elderly member', amount: 1_000 });
      expect(((await svc.detail(adminA, d.id)) as any)).toMatchObject({ waivedAmount: 1_000, balance: 2_000 });
      await expect(svc.waive(adminA, d.id, { reason: 'x', amount: 5_000 })).rejects.toThrow(/Only 2,000/);
      await svc.waive(adminA, d.id, { reason: 'Hardship' });
      expect(((await svc.detail(adminA, d.id)) as any)).toMatchObject({ balance: 0, state: 'PAID' });
      await expect(svc.waive(adminA, d.id, { reason: 'x' })).rejects.toThrow(/Nothing is left/);
      const ashaFee = ((await svc.list(adminA, { farmerId: asha, category: 'MEMBERSHIP_FEE' }) as any).data[0]);
      await svc.recordPayment(adminA, ashaFee.id, { amount: 1_000, method: 'CASH' });
      await expect(svc.cancel(adminA, ashaFee.id, 'Charged by mistake')).rejects.toThrow(/Void its payments/);
      const jumaFee = ((await svc.list(adminA, { farmerId: juma, category: 'MEMBERSHIP_FEE' }) as any).data[0]);
      await svc.cancel(adminA, jumaFee.id, 'Charged by mistake');
      expect(((await svc.detail(adminA, jumaFee.id)) as any)).toMatchObject({ state: 'CANCELLED', balance: 0 });
      await expect(svc.recordPayment(adminA, jumaFee.id, { amount: 1, method: 'CASH' })).rejects.toThrow(/cancelled/);
    });
  });

  describe('fertiliser on credit', () => {
    let due: any;
    it('records the issue as a debt and books it as a receivable', async () => {
      const scope = ledger.scopeFor(adminA);
      due = await svc.issueFertiliser(adminA, { farmerId: neema, itemName: 'Urea', quantity: 4, unit: 'bags', unitPrice: 62_500, issuedOn: iso(-3), dueDate: iso(60), postToLedger: true });
      expect(due).toMatchObject({ category: 'FERTILISER', amount: 250_000, balance: 250_000, postedIssue: true, quantity: 4, unitPrice: 62_500 });
      const entries: any[] = (await ledger.journalEntries(scope) as any).filter((j: any) => j.sourceType === 'FertiliserIssue');
      expect(entries).toHaveLength(1);
      expect(entries[0].lines.map((l: any) => l.account.code).sort()).toEqual(['1310', '4230']);
      await expect(svc.issueFertiliser(adminA, { farmerId: neema, itemName: 'x', quantity: 1, unitPrice: 1, issuedOn: iso(1) })).rejects.toThrow(/future/);
    });

    it('is repaid in cash or taken from the harvest payment, each booked against the right account', async () => {
      await svc.recordPayment(adminA, due.id, { amount: 50_000, method: 'CASH' });
      await svc.recordPayment(adminA, due.id, { amount: 100_000, method: 'HARVEST_DEDUCTION', note: 'Paddy sale 14' });
      const lines = (await ledger.journalEntries(ledger.scopeFor(adminA)) as any[]).filter((j) => j.sourceType === 'DuePayment' && j.description.includes('Urea'));
      const accounts = lines.map((j) => j.lines.map((l: any) => l.account.code).sort().join('/')).sort();
      expect(accounts).toEqual(['1000/1310', '1310/2200']); // cash in, or the farmer's settlement owed to them reduced
      expect(((await svc.detail(adminA, due.id)) as any)).toMatchObject({ paid: 150_000, balance: 100_000, state: 'PARTIAL' });
    });

    it('cancelling an unpaid issue reverses its entry', async () => {
      const scope = ledger.scopeFor(adminA);
      const other: any = await svc.issueFertiliser(adminA, { farmerId: juma, itemName: 'DAP', quantity: 1, unitPrice: 10_000, issuedOn: iso(-1), postToLedger: true });
      const before = (await ledger.journalEntries(scope) as any[]).filter((j) => j.sourceType === 'FertiliserIssueVoid').length;
      await svc.cancel(adminA, other.id, 'Wrong farmer');
      expect((await ledger.journalEntries(scope) as any[]).filter((j) => j.sourceType === 'FertiliserIssueVoid').length).toBe(before + 1);
    });
  });

  describe('reading', () => {
    it('lists arrears per farmer, most overdue first, and a full statement', async () => {
      const over = await svc.createType(adminA, { name: 'Old levy', category: 'OTHER', basis: 'FLAT', rate: 1_000 });
      await svc.createDue(adminA, { farmerId: asha, category: 'OTHER', description: 'Old levy', amount: 7_000, typeId: over.id, dueDate: iso(1) });
      await prisma.farmerDue.updateMany({ where: { description: 'Old levy' }, data: { dueDate: new Date(iso(-10)) } });
      const arrears: any = await svc.arrears(adminA, {});
      expect(arrears.items[0]).toMatchObject({ overdue: 7_000 });
      expect(arrears.items[0].farmer.name).toBe('Asha Mbarali');
      expect(arrears.outstanding).toBeGreaterThan(arrears.overdue);
      expect(((await svc.list(adminA, { state: 'OVERDUE' }) as any).data).every((d: any) => d.overdue)).toBe(true);
      const st: any = await svc.statement(adminA, asha);
      expect(st.farmer.name).toBe('Asha Mbarali');
      expect(st.totals.charged - st.totals.paid).toBe(st.totals.outstanding);
    });

    it('finds farmers of this AMCOS only, with the hectares they hold', async () => {
      const found: any[] = await svc.farmers(adminA, { q: 'asha' });
      expect(found).toHaveLength(1);
      expect(found[0].hectares).toBe(2);
      expect(await svc.farmers(adminA, { q: 'outsider' })).toEqual([]);
    });
  });

  describe('cooperative boundaries', () => {
    it('keeps each AMCOS to its own dues, payments and books', async () => {
      const due = ((await svc.list(adminA, {}) as any).data[0]);
      expect((await svc.list(adminB, {}) as any).meta.total).toBe(0);
      await expect(svc.detail(adminB, due.id)).rejects.toBeInstanceOf(NotFoundException);
      await expect(svc.recordPayment(adminB, due.id, { amount: 1, method: 'CASH' })).rejects.toBeInstanceOf(NotFoundException);
      await expect(svc.waive(adminB, due.id, { reason: 'x' })).rejects.toBeInstanceOf(NotFoundException);
      await expect(svc.cancel(adminB, due.id, 'x')).rejects.toBeInstanceOf(NotFoundException);
      await expect(svc.statement(adminB, asha)).rejects.toBeInstanceOf(NotFoundException);
      await expect(svc.charge(adminB, levy.id, {})).rejects.toBeInstanceOf(NotFoundException);
      await expect(svc.list(adminB, { mamcosId: mamcosA })).rejects.toBeInstanceOf(ForbiddenException);
      const payment = await prisma.duePayment.findFirstOrThrow({ where: { mamcosId: mamcosA, voidedAt: null } });
      await expect(svc.voidPayment(adminB, payment.id, 'x')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('platform accounts must say which cooperative', async () => {
      await expect(svc.list(superAdmin, {})).rejects.toBeInstanceOf(BadRequestException);
      expect((await svc.list(superAdmin, { mamcosId: mamcosA }) as any).meta.total).toBeGreaterThan(0);
    });
  });

  describe('the database backs the rules', () => {
    it('refuses a non-positive amount, a waiver above the amount and a void with no reason', async () => {
      const due = await prisma.farmerDue.findFirstOrThrow({ where: { mamcosId: mamcosA, status: 'ACTIVE' } });
      await expect(prisma.$executeRawUnsafe(`update farmer_dues set waived_amount = amount + 1 where id = '${due.id}'`)).rejects.toThrow(/waived_within_amount|check/);
      await expect(prisma.$executeRawUnsafe(`insert into due_payments (id, mamcos_id, due_id, farmer_id, receipt_no, amount, paid_on, method) values ('${randomUUID()}', '${mamcosA}', '${due.id}', '${due.farmerId}', 'RCT-X', 0, current_date, 'CASH')`)).rejects.toThrow(/amount_positive|check/);
      await expect(prisma.$executeRawUnsafe(`update due_payments set voided_at = now() where mamcos_id = '${mamcosA}' and voided_at is null`)).rejects.toThrow(/void_consistent|check/);
    });
  });

  it('declares an explicit dues permission on every route', () => {
    const proto = DuesController.prototype as any;
    const handlers = Object.getOwnPropertyNames(proto).filter((n) => n !== 'constructor' && typeof proto[n] === 'function');
    expect(handlers.length).toBe(16);
    for (const name of handlers) expect({ name, resource: Reflect.getMetadata(PERMISSION_KEY, proto[name])?.resource }).toEqual({ name, resource: 'dues' });
    for (const name of ['voidPayment', 'waive', 'cancel']) expect(Reflect.getMetadata(PERMISSION_KEY, proto[name]).action).toBe('DELETE');
  });
});
