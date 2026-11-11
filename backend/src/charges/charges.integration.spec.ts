/**
 * Integration tests for the AMCOS Settings charges (milling, storage, delivery, late penalty) and the places that take them,
 * against the throw-away `irrigation_test` schema (scripts/irrigation-test-schema.sh). Skipped unless IRRIGATION_TEST_DATABASE_URL is set.
 */
import 'reflect-metadata';
import { randomUUID } from 'crypto';
import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { PrismaClient, UserRole } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { OwnershipService } from '../common/ownership.service';
import { AccountingService } from '../accounting/accounting.service';
import { StockAccountingService } from '../ops/stock-accounting.service';
import { ReceivingService } from '../ops/receiving.service';
import { ProcessingService } from '../ops/processing.service';
import { SalesOpsService } from '../ops/sales-ops.service';
import { BillingService } from '../ops/billing.service';
import { CatalogService } from '../ops/catalog.service';
import { ChargesService } from './charges.service';

const BASE_URL = process.env.IRRIGATION_TEST_DATABASE_URL;
const SCHEMA = 'irrigation_test';
const describeDb = BASE_URL ? describe : describe.skip;
const ymd = (offsetDays: number) => new Date(Date.now() + 3 * 3_600_000 + offsetDays * 86_400_000).toISOString().slice(0, 10);

describeDb('AMCOS charges (PostgreSQL)', () => {
  jest.setTimeout(120_000);
  let pool: Pool;
  let prisma: PrismaClient;
  let charges: ChargesService;
  let processing: ProcessingService;
  let receiving: ReceivingService;
  let sales: SalesOpsService;
  let billing: BillingService;
  const notify: any = { tellPermission: async () => undefined, tell: async () => undefined };

  async function coop() {
    const tag = randomUUID().slice(0, 6);
    const mamcos = await prisma.mamcos.create({ data: { name: `Coop ${tag}`, code: `C-${tag.toUpperCase()}` } });
    const warehouse = await prisma.warehouse.create({ data: { mamcosId: mamcos.id, name: `Store ${tag}` } });
    const product = (code: string, category: any, unitPrice?: number) => prisma.product.create({ data: { mamcosId: mamcos.id, code: `${code}-${tag}`, name: code, category, unitPrice } });
    const paddy = await product('PADDY', 'PADDY');
    const rice = await product('RICE', 'PROCESSED', 2000);
    const actor = { id: randomUUID(), role: UserRole.CUSTOM, mamcosId: mamcos.id } as any;
    const user = await prisma.user.create({ data: { phone: `+2557${Math.floor(Math.random() * 1e8)}`, passwordHash: 'x', role: UserRole.FARMER } });
    const farmer = await prisma.farmer.create({ data: { userId: user.id, controlNumber: `CH-${randomUUID().slice(0, 6)}`, firstName: 'Asha', lastName: 'Mwanga', mamcosId: mamcos.id } });
    return { mamcos, warehouse, paddy, rice, actor, farmer };
  }
  type Coop = Awaited<ReturnType<typeof coop>>;
  const set = (c: Coop, code: string, amount: number, extra: object = {}) => charges.update(c.actor, code, { amount, isActive: true, ...extra });
  /** Paddy that belongs to the farmer (stored for them), already received. */
  const farmerPaddy = async (c: Coop, kg: number) => {
    const r: any = await receiving.create({ warehouseId: c.warehouse.id, productId: c.paddy.id, sourceType: 'EXTERNAL_FARMER', farmerId: c.farmer.id, grossKg: kg, confirmNow: true } as any, c.actor);
    return (await prisma.stockBatch.findFirst({ where: { receiptId: r.id } }))!;
  };
  const mill = (c: Coop, batchId: string, kg: number) =>
    processing.create({ kind: 'MILLING', warehouseId: c.warehouse.id, inputs: [{ batchId, quantityKg: kg }], outputs: [{ kind: 'PRODUCT', productId: c.rice.id, quantityKg: kg * 0.65 }] } as any, c.actor) as Promise<any>;

  beforeAll(async () => {
    const url = `${BASE_URL!.split('?')[0]}?options=${encodeURIComponent(`-c search_path=${SCHEMA}`)}`;
    pool = new Pool({ connectionString: url, max: 8 });
    prisma = new PrismaClient({ adapter: new PrismaPg(pool, { schema: SCHEMA }) });
    const ownership = new OwnershipService(prisma as any);
    const accounting = new AccountingService(prisma as any, ownership);
    charges = new ChargesService(prisma as any, ownership);
    const books = new StockAccountingService(prisma as any, accounting);
    receiving = new ReceivingService(prisma as any, notify, books);
    processing = new ProcessingService(prisma as any, notify, books, charges, {} as any);
    sales = new SalesOpsService(prisma as any, new CatalogService(prisma as any), notify, charges);
    billing = new BillingService(prisma as any, {} as any, {} as any, notify, accounting);
    await accounting.listAccounts();
  });
  afterAll(async () => { await prisma.$disconnect(); await pool.end(); });

  describe('the price list', () => {
    it('gives every AMCOS the standard charges, all switched off, once', async () => {
      const c = await coop();
      const first = await charges.list(c.actor);
      expect(first.map((x) => x.code)).toEqual(['MILLING_FEE', 'STORAGE_FEE', 'DELIVERY_FEE', 'LATE_PENALTY', 'DEFAULT_PENALTY']);
      expect(first.every((x) => !x.isActive)).toBe(true);
      // the overdue-debt penalty is ready at TZS 50,000 and 30 days' grace, but nothing is blocked until it is switched on
      expect(first.filter((x) => x.code !== 'DEFAULT_PENALTY').every((x) => x.amount === 0)).toBe(true);
      expect(first.find((x) => x.code === 'DEFAULT_PENALTY')).toMatchObject({ amount: 50_000, graceDays: 30 });
      await charges.list(c.actor);
      expect(await prisma.amcosCharge.count({ where: { mamcosId: c.mamcos.id } })).toBe(5);
    });

    it('will not switch a charge on at zero, accept more than 100 percent, or give grace days to a fee', async () => {
      const c = await coop();
      await expect(charges.update(c.actor, 'MILLING_FEE', { isActive: true })).rejects.toBeInstanceOf(BadRequestException);
      await expect(charges.update(c.actor, 'LATE_PENALTY', { amount: 120 })).rejects.toBeInstanceOf(BadRequestException);
      await expect(charges.update(c.actor, 'MILLING_FEE', { amount: 10, graceDays: 5 })).rejects.toBeInstanceOf(BadRequestException);
      await expect(charges.update(c.actor, 'NOT_A_CHARGE', { amount: 10 })).rejects.toThrow('Charge not found');
    });

    it('keeps each AMCOS to its own amounts', async () => {
      const a = await coop();
      const b = await coop();
      await set(a, 'MILLING_FEE', 50);
      expect((await charges.list(b.actor)).find((x) => x.code === 'MILLING_FEE')!.amount).toBe(0);
      expect(await charges.rate(a.mamcos.id, 'MILLING_FEE')).toEqual({ amount: 50, graceDays: 0 });
      expect(await charges.rate(b.mamcos.id, 'MILLING_FEE')).toBeNull();
      await expect(charges.list(a.actor, b.mamcos.id)).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('milling fee', () => {
    it('charges the farmer for milling their rice, by weight, once', async () => {
      const c = await coop();
      await set(c, 'MILLING_FEE', 40);
      const batch = await farmerPaddy(c, 1000);
      const run = await mill(c, batch.id, 1000);
      expect(run.millingFee).toBe(40_000);
      const dues = await prisma.farmerDue.findMany({ where: { farmerId: c.farmer.id } });
      expect(dues).toHaveLength(1);
      expect(Number(dues[0].amount)).toBe(40_000);
      expect(dues[0].description).toBe(`Milling · ${run.reference}`);
    });

    it('charges nothing when the fee is off, or when the rice is the cooperative’s own', async () => {
      const off = await coop();
      const r1 = await mill(off, (await farmerPaddy(off, 500)).id, 500);
      expect(r1.millingFee).toBe(0);
      expect(await prisma.farmerDue.count({ where: { mamcosId: off.mamcos.id } })).toBe(0);

      const own = await coop();
      await set(own, 'MILLING_FEE', 40);
      const bought: any = await receiving.create({ warehouseId: own.warehouse.id, productId: own.paddy.id, sourceType: 'EXTERNAL_FARMER', sellerName: 'Walk-in', grossKg: 500, pricePerKg: 900, confirmNow: true } as any, own.actor);
      const batch = (await prisma.stockBatch.findFirst({ where: { receiptId: bought.id } }))!;
      const r2 = await mill(own, batch.id, 500);
      expect(r2.millingFee).toBe(0);
      expect(await prisma.farmerDue.count({ where: { mamcosId: own.mamcos.id } })).toBe(0);
    });

    it('a reversed run cancels its unpaid fee', async () => {
      const c = await coop();
      await set(c, 'MILLING_FEE', 10);
      const run = await mill(c, (await farmerPaddy(c, 400)).id, 400);
      await processing.reverse(run.id, 'Weighed wrongly', c.actor);
      const due = (await prisma.farmerDue.findFirst({ where: { farmerId: c.farmer.id } }))!;
      expect(due.status).toBe('CANCELLED');
    });
  });

  describe('delivery fee', () => {
    async function order(c: Coop, mode: string) {
      const customer = await prisma.customer.create({ data: { mamcosId: c.mamcos.id, reference: `CU-${randomUUID().slice(0, 6)}`, type: 'INDIVIDUAL', name: 'Buyer', phone: '+255700000000' } });
      return sales.createOrder({ customerId: customer.id, deliveryMode: mode, lines: [{ productId: c.rice.id, quantity: 10 }] } as any, c.actor) as Promise<any>;
    }

    it('adds the fee to the total of an order for delivery, and shows it as its own invoice line', async () => {
      const c = await coop();
      await set(c, 'DELIVERY_FEE', 15_000);
      const o = await order(c, 'DELIVERY');
      expect(o.deliveryFee).toBe(15_000);
      expect(o.total).toBe(20_000 + 15_000);
      await prisma.opsOrder.update({ where: { id: o.id }, data: { status: 'APPROVED_FOR_INVOICING' } });
      const inv: any = await billing.issueInvoice(o.id, {}, c.actor);
      expect(inv.total).toBe(35_000);
      expect(inv.lines.map((l: any) => l.description)).toContain('Delivery');
      expect(inv.lines.reduce((t: number, l: any) => t + l.lineTotal, 0)).toBe(35_000);
    });

    it('adds nothing for collection, or when the fee is off', async () => {
      const c = await coop();
      expect((await order(c, 'DELIVERY')).total).toBe(20_000);
      await set(c, 'DELIVERY_FEE', 15_000);
      const collect = await order(c, 'COLLECTION');
      expect(collect.total).toBe(20_000);
      expect(collect.deliveryFee).toBe(0);
    });

    it('switching a returned order between collection and delivery moves the total by the fee', async () => {
      const c = await coop();
      await set(c, 'DELIVERY_FEE', 5_000);
      const o = await order(c, 'COLLECTION');
      await prisma.opsOrder.update({ where: { id: o.id }, data: { status: 'RETURNED_TO_SALES' } });
      const changed: any = await sales.updateOrder(o.id, { deliveryMode: 'DELIVERY' } as any, c.actor);
      expect(changed.total).toBe(25_000);
      const back: any = await sales.updateOrder(o.id, { deliveryMode: 'COLLECTION' } as any, c.actor);
      expect(back.total).toBe(20_000);
    });
  });

  describe('late payment penalty', () => {
    const owe = (c: Coop, dueInDays: number, amount = 100_000, description = 'Levy 2026') =>
      prisma.farmerDue.create({ data: { mamcosId: c.mamcos.id, farmerId: c.farmer.id, category: 'LEVY', description, amount, issuedOn: new Date(`${ymd(-90)}T00:00:00Z`), dueDate: new Date(`${ymd(dueInDays)}T00:00:00Z`) } });

    it('charges a percent of what is overdue beyond the grace days, once a month', async () => {
      const c = await coop();
      await set(c, 'LATE_PENALTY', 5, { graceDays: 30 });
      await owe(c, -45);
      const preview = await charges.previewPenalties(c.actor);
      expect(preview.rows).toHaveLength(1);
      expect(preview.rows[0]).toMatchObject({ balance: 100_000, amount: 5_000 });
      const applied = await charges.applyPenalties(c.actor);
      expect(applied).toMatchObject({ charged: 1, total: 5_000 });
      await expect(charges.applyPenalties(c.actor)).rejects.toBeInstanceOf(ConflictException);
      // A penalty is never itself penalised.
      expect((await charges.previewPenalties(c.actor)).rows).toHaveLength(0);
    });

    it('is added by the daily timer with nobody pressing a button, once a month, and only where it is switched on', async () => {
      const on = await coop(); const off = await coop();
      await set(on, 'LATE_PENALTY', 5, { graceDays: 30 });
      await owe(on, -45);
      await prisma.farmerDue.create({ data: { mamcosId: off.mamcos.id, farmerId: off.farmer.id, category: 'LEVY', description: 'Levy 2026', amount: 100_000, issuedOn: new Date(`${ymd(-90)}T00:00:00Z`), dueDate: new Date(`${ymd(-45)}T00:00:00Z`) } });
      const first = await charges.applyAutomatically();
      expect(first.charged).toBeGreaterThanOrEqual(1);
      const mine = await prisma.farmerDue.findMany({ where: { farmerId: on.farmer.id, description: { startsWith: 'Late penalty' } } });
      expect(mine).toHaveLength(1);
      expect(Number(mine[0].amount)).toBe(5_000);
      expect(mine[0].createdById).toBeNull(); // charged by the system, not a person
      expect(await prisma.farmerDue.count({ where: { farmerId: off.farmer.id, description: { startsWith: 'Late penalty' } } })).toBe(0);
      await charges.applyAutomatically(); // running again the same month adds nothing
      expect(await prisma.farmerDue.count({ where: { farmerId: on.farmer.id, description: { startsWith: 'Late penalty' } } })).toBe(1);
    });

    it('leaves alone what is within the grace days, not yet due, or fully paid', async () => {
      const c = await coop();
      await set(c, 'LATE_PENALTY', 5, { graceDays: 30 });
      await owe(c, -10, 100_000, 'Within grace');
      await owe(c, 20, 100_000, 'Not yet due');
      const paid = await owe(c, -60, 100_000, 'Paid');
      await prisma.duePayment.create({ data: { dueId: paid.id, mamcosId: c.mamcos.id, farmerId: c.farmer.id, amount: 100_000, paidOn: new Date(`${ymd(-1)}T00:00:00Z`), method: 'CASH', receiptNo: `R-${randomUUID().slice(0, 6)}` } as any });
      expect((await charges.previewPenalties(c.actor)).rows).toHaveLength(0);
    });

    it('needs the penalty switched on', async () => {
      const c = await coop();
      await expect(charges.previewPenalties(c.actor)).rejects.toThrow('Switch on the late payment penalty');
    });
  });

  describe('storage fee', () => {
    it('charges each farmer for the rice stored for them, once per month', async () => {
      const c = await coop();
      await set(c, 'STORAGE_FEE', 20);
      await farmerPaddy(c, 300);
      const month = ymd(0).slice(0, 7);
      const preview = await charges.previewStorage(c.actor, month);
      expect(preview.rows).toHaveLength(1);
      expect(preview.rows[0]).toMatchObject({ kg: 300, amount: 6_000 });
      expect(await charges.applyStorage(c.actor, month)).toMatchObject({ charged: 1, total: 6_000 });
      await expect(charges.applyStorage(c.actor, month)).rejects.toBeInstanceOf(ConflictException);
    });

    it('refuses a future month and ignores the cooperative’s own stock', async () => {
      const c = await coop();
      await set(c, 'STORAGE_FEE', 20);
      await expect(charges.previewStorage(c.actor, '2999-01')).rejects.toThrow('has not started');
      await receiving.create({ warehouseId: c.warehouse.id, productId: c.paddy.id, sourceType: 'EXTERNAL_FARMER', sellerName: 'Walk-in', grossKg: 100, pricePerKg: 900, confirmNow: true } as any, c.actor);
      await expect(charges.applyStorage(c.actor, ymd(0).slice(0, 7))).rejects.toThrow('No farmer has stock');
    });
  });
});
