/**
 * Integration tests for what the cooperative owes farmers for paddy it bought, paying them, and their statements, against the
 * throw-away `irrigation_test` schema (scripts/irrigation-test-schema.sh). Skipped unless IRRIGATION_TEST_DATABASE_URL is set.
 */
import 'reflect-metadata';
import { randomUUID } from 'crypto';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaClient, UserRole } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { OwnershipService } from '../common/ownership.service';
import { AccountingService } from './accounting.service';
import { CashAccountsService } from './cash-accounts.service';
import { FarmerAccountsService } from './farmer-accounts.service';
import { StockAccountingService } from '../ops/stock-accounting.service';
import { ReceivingService } from '../ops/receiving.service';
import { localDate } from './tax';

const BASE_URL = process.env.IRRIGATION_TEST_DATABASE_URL;
const SCHEMA = 'irrigation_test';
const describeDb = BASE_URL ? describe : describe.skip;
const today = () => localDate(new Date());

describeDb('Farmer accounts and payouts (PostgreSQL)', () => {
  jest.setTimeout(120_000);
  let pool: Pool;
  let prisma: PrismaClient;
  let accounting: AccountingService;
  let accounts: CashAccountsService;
  let farmers: FarmerAccountsService;
  let receiving: ReceivingService;
  const notify: any = { tellPermission: async () => undefined, tell: async () => undefined };

  async function coop() {
    const tag = randomUUID().slice(0, 6);
    const m = await prisma.mamcos.create({ data: { name: `Coop ${tag}`, code: `C-${tag.toUpperCase()}` } });
    const warehouse = await prisma.warehouse.create({ data: { mamcosId: m.id, name: `Store ${tag}` } });
    const paddy = await prisma.product.create({ data: { mamcosId: m.id, code: `PADDY-${tag}`, name: 'Paddy', category: 'PADDY' } });
    const user = await prisma.user.create({ data: { phone: `+2557${Math.floor(Math.random() * 1e8)}`, passwordHash: 'x', role: UserRole.FARMER } });
    const farmer = await prisma.farmer.create({ data: { userId: user.id, controlNumber: `FA-${randomUUID().slice(0, 6)}`, firstName: 'Asha', lastName: 'Mwanga', mamcosId: m.id } });
    const actor = { id: randomUUID(), role: UserRole.CUSTOM, mamcosId: m.id } as any;
    return { id: m.id, scope: { mamcosId: m.id }, warehouse, paddy, farmer, actor };
  }
  type Coop = Awaited<ReturnType<typeof coop>>;
  const buy = (c: Coop, kg: number, price: number | undefined, who: object) =>
    receiving.create({ warehouseId: c.warehouse.id, productId: c.paddy.id, sourceType: 'EXTERNAL_FARMER', grossKg: kg, pricePerKg: price, confirmNow: true, ...who } as any, c.actor);
  const glBalance = async (c: Coop, code: string) => {
    const a = (await prisma.account.findUnique({ where: { code } }))!;
    const r = await prisma.ledgerEntry.aggregate({ where: { mamcosId: c.id, accountId: a.id }, _sum: { debit: true, credit: true } });
    return Math.round(((r._sum.debit ?? 0) - (r._sum.credit ?? 0)) * 100) / 100;
  };

  beforeAll(async () => {
    const url = `${BASE_URL!.split('?')[0]}?options=${encodeURIComponent(`-c search_path=${SCHEMA}`)}`;
    pool = new Pool({ connectionString: url, max: 8 });
    prisma = new PrismaClient({ adapter: new PrismaPg(pool, { schema: SCHEMA }) });
    accounting = new AccountingService(prisma as any, new OwnershipService(prisma as any));
    accounts = new CashAccountsService(prisma as any, accounting);
    farmers = new FarmerAccountsService(prisma as any, accounting);
    receiving = new ReceivingService(prisma as any, notify, new StockAccountingService(prisma as any, accounting));
    await accounting.listAccounts();
  });
  afterAll(async () => { await prisma.$disconnect(); await pool.end(); });

  it('lists what is owed to each farmer and to walk-in sellers, from paddy bought at a price', async () => {
    const c = await coop();
    await buy(c, 1000, 900, { farmerId: c.farmer.id });
    await buy(c, 200, 1000, { sellerName: 'Juma Hassan' });
    await buy(c, 300, undefined, { farmerId: c.farmer.id }); // only stored for the farmer: not bought, not owed
    const list = await farmers.owed(c.scope);
    expect(list.items).toHaveLength(2);
    expect(list.items[0]).toMatchObject({ name: 'Asha Mwanga', bought: 900_000, paid: 0, owed: 900_000 });
    expect(list.items[1]).toMatchObject({ sellerName: 'Juma Hassan', owed: 200_000 });
    expect(list.totalOwed).toBe(1_100_000);
    expect(list.totalOwed).toBe(await glBalance(c, '2200') * -1);
  });

  it('paying reduces what is owed, takes the money from the chosen account, and numbers the payout', async () => {
    const c = await coop();
    const bank = await accounts.create({ name: 'CRDB', kind: 'BANK', openingBalance: 2_000_000 } as any, c.scope, 'u1');
    await buy(c, 1000, 900, { farmerId: c.farmer.id });
    const p = await farmers.pay({ farmerId: c.farmer.id, amount: 400_000, paidOn: today(), cashAccountId: bank.id, reference: 'TX1' }, c.scope, 'u1');
    expect(p.number).toMatch(/^PAY-\d{4}-000001$/);
    expect((await farmers.owed(c.scope)).items[0]).toMatchObject({ bought: 900_000, paid: 400_000, owed: 500_000 });
    expect((await accounts.list(c.scope)).items[0].balance).toBe(1_600_000);
    expect(await glBalance(c, '2200')).toBe(-500_000);
  });

  it('refuses to pay more than is owed, anyone who is owed nothing, a future date, or a stranger', async () => {
    const a = await coop();
    const b = await coop();
    await buy(a, 100, 1000, { farmerId: a.farmer.id });
    await expect(farmers.pay({ farmerId: a.farmer.id, amount: 100_001, paidOn: today() }, a.scope)).rejects.toBeInstanceOf(ConflictException);
    await expect(farmers.pay({ farmerId: a.farmer.id, amount: 100_000, paidOn: '2999-01-01' }, a.scope)).rejects.toBeInstanceOf(BadRequestException);
    await expect(farmers.pay({ farmerId: a.farmer.id, amount: 0, paidOn: today() }, a.scope)).rejects.toThrow('greater than zero');
    await expect(farmers.pay({ amount: 5, paidOn: today() }, a.scope)).rejects.toThrow('Choose who');
    await expect(farmers.pay({ farmerId: a.farmer.id, sellerName: 'X', amount: 5, paidOn: today() }, a.scope)).rejects.toThrow('Choose who');
    await expect(farmers.pay({ farmerId: b.farmer.id, amount: 5, paidOn: today() }, a.scope)).rejects.toBeInstanceOf(NotFoundException);
    await expect(farmers.pay({ farmerId: b.farmer.id, amount: 5, paidOn: today() }, b.scope)).rejects.toThrow('Nothing is owed');
  });

  it('paying twice cannot take more than is owed', async () => {
    const c = await coop();
    await buy(c, 100, 1000, { farmerId: c.farmer.id });
    const results = await Promise.allSettled([
      farmers.pay({ farmerId: c.farmer.id, amount: 80_000, paidOn: today() }, c.scope),
      farmers.pay({ farmerId: c.farmer.id, amount: 80_000, paidOn: today() }, c.scope),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect((await farmers.owed(c.scope)).items[0].owed).toBe(20_000);
  });

  it('pays a walk-in seller by name', async () => {
    const c = await coop();
    await buy(c, 100, 1000, { sellerName: 'Juma Hassan' });
    await farmers.pay({ sellerName: '  juma   hassan ', amount: 60_000, paidOn: today() }, c.scope);
    expect((await farmers.owed(c.scope)).items[0]).toMatchObject({ paid: 60_000, owed: 40_000 });
  });

  it('cancelling a payout puts the debt and the money back, once, with a reason', async () => {
    const c = await coop();
    const bank = await accounts.create({ name: 'CRDB', kind: 'BANK', openingBalance: 500_000 } as any, c.scope, 'u1');
    await buy(c, 100, 1000, { farmerId: c.farmer.id });
    const p = await farmers.pay({ farmerId: c.farmer.id, amount: 100_000, paidOn: today(), cashAccountId: bank.id }, c.scope);
    await expect(farmers.void(p.id, 'no', c.scope)).rejects.toThrow('at least a few words');
    await farmers.void(p.id, 'Paid the wrong farmer', c.scope);
    expect((await farmers.owed(c.scope)).items[0].owed).toBe(100_000);
    expect((await accounts.list(c.scope)).items[0].balance).toBe(500_000);
    await expect(farmers.void(p.id, 'Again, please', c.scope)).rejects.toBeInstanceOf(ConflictException);
    expect((await farmers.payouts(c.scope))[0]).toMatchObject({ voided: true, voidReason: 'Paid the wrong farmer' });
  });

  it('shows what a farmer owes the cooperative in dues next to what it owes them, and a full statement', async () => {
    const c = await coop();
    await buy(c, 100, 1000, { farmerId: c.farmer.id });
    await farmers.pay({ farmerId: c.farmer.id, amount: 30_000, paidOn: today(), note: 'Part payment' }, c.scope);
    await prisma.farmerDue.create({ data: { mamcosId: c.id, farmerId: c.farmer.id, category: 'LEVY', description: 'Levy 2026', amount: 25_000, issuedOn: new Date(`${today()}T00:00:00Z`) } });
    expect((await farmers.owed(c.scope)).items[0]).toMatchObject({ owed: 70_000, debts: 25_000 });
    const s = await farmers.statement(c.scope, { farmerId: c.farmer.id });
    expect(s).toMatchObject({ bought: 100_000, paid: 30_000, owed: 70_000, debts: 25_000, net: 45_000 });
    expect(s.purchases).toHaveLength(1);
    expect(s.payouts[0]).toMatchObject({ amount: 30_000, note: 'Part payment' });
    expect(s.dues[0]).toMatchObject({ description: 'Levy 2026', balance: 25_000 });
  });

  it('keeps each cooperative to its own farmers', async () => {
    const a = await coop();
    const b = await coop();
    await buy(a, 100, 1000, { farmerId: a.farmer.id });
    expect((await farmers.owed(b.scope)).items).toEqual([]);
    await expect(farmers.statement(b.scope, { farmerId: a.farmer.id })).rejects.toBeInstanceOf(NotFoundException);
  });
});
