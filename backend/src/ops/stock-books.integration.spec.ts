/**
 * Integration tests for the single stock record and its link to the accounts, against the throw-away `irrigation_test` schema
 * (scripts/irrigation-test-schema.sh). Skipped unless IRRIGATION_TEST_DATABASE_URL is set.
 */
import 'reflect-metadata';
import { randomUUID } from 'crypto';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaClient, UserRole } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { OwnershipService } from '../common/ownership.service';
import { AccountingService } from '../accounting/accounting.service';
import { StockAccountingService } from './stock-accounting.service';
import { ChargesService } from '../charges/charges.service';
import { ReceivingService } from './receiving.service';
import { ProcessingService } from './processing.service';
import { StockService } from './stock.service';
import { BillingService } from './billing.service';
import { WarehousesService } from '../warehouses/warehouses.service';
import { warehouseBalance } from '../warehouses/stock';
import { drawFromBatches } from '../warehouses/batch-draw';

const BASE_URL = process.env.IRRIGATION_TEST_DATABASE_URL;
const SCHEMA = 'irrigation_test';
const describeDb = BASE_URL ? describe : describe.skip;

describeDb('Stock record and accounts (PostgreSQL)', () => {
  jest.setTimeout(120_000);
  let pool: Pool;
  let prisma: PrismaClient;
  let accounting: AccountingService;
  let books: StockAccountingService;
  let receiving: ReceivingService;
  let processing: ProcessingService;
  let stock: StockService;
  let billing: BillingService;
  let warehouses: WarehousesService;
  const notify: any = { tellPermission: async () => undefined, tell: async () => undefined };

  /** A fresh cooperative with a warehouse, its keeper and the products it handles. */
  async function coop() {
    const tag = randomUUID().slice(0, 6);
    const mamcos = await prisma.mamcos.create({ data: { name: `Coop ${tag}`, code: `C-${tag.toUpperCase()}` } });
    const warehouse = await prisma.warehouse.create({ data: { mamcosId: mamcos.id, name: `Store ${tag}` } });
    const product = (code: string, category: any, unitPrice?: number) =>
      prisma.product.create({ data: { mamcosId: mamcos.id, code: `${code}-${tag}`, name: code, category, unitPrice } });
    const paddy = await product('PADDY', 'PADDY');
    const rice = await product('RICE', 'PROCESSED', 2000);
    const broken = await product('BROKEN', 'BROKEN', 800);
    const bran = await product('BRAN', 'BYPRODUCT');
    const actor = { id: randomUUID(), role: UserRole.CUSTOM, mamcosId: mamcos.id } as any;
    return { mamcos, warehouse, paddy, rice, broken, bran, actor };
  }
  const buy = (c: Awaited<ReturnType<typeof coop>>, kg: number, price?: number, extra: object = {}) =>
    receiving.create(
      { warehouseId: c.warehouse.id, productId: c.paddy.id, sourceType: 'EXTERNAL_FARMER', sellerName: 'Asha Mwanga', grossKg: kg, pricePerKg: price, confirmNow: true, ...extra } as any,
      c.actor,
    );
  const balance = async (c: Awaited<ReturnType<typeof coop>>, code: string) => {
    const account = (await prisma.account.findUnique({ where: { code } }))!;
    const rows = await prisma.ledgerEntry.aggregate({ where: { mamcosId: c.mamcos.id, accountId: account.id }, _sum: { debit: true, credit: true } });
    return Math.round(((rows._sum.debit ?? 0) - (rows._sum.credit ?? 0)) * 100) / 100;
  };

  beforeAll(async () => {
    const url = `${BASE_URL!.split('?')[0]}?options=${encodeURIComponent(`-c search_path=${SCHEMA}`)}`;
    pool = new Pool({ connectionString: url, max: 8 });
    prisma = new PrismaClient({ adapter: new PrismaPg(pool, { schema: SCHEMA }) });
    accounting = new AccountingService(prisma as any, new OwnershipService(prisma as any));
    books = new StockAccountingService(prisma as any, accounting);
    receiving = new ReceivingService(prisma as any, notify, books);
    processing = new ProcessingService(prisma as any, notify, books, new ChargesService(prisma as any, new OwnershipService(prisma as any)), {} as any);
    stock = new StockService(prisma as any, notify, books);
    warehouses = new WarehousesService(prisma as any, receiving, books);
    billing = new BillingService(prisma as any, {} as any, {} as any, notify, accounting);
    await accounting.listAccounts();
  });
  afterAll(async () => { await prisma.$disconnect(); await pool.end(); });

  describe('the stock record cannot be rewritten', () => {
    it('refuses to update or delete a stock row', async () => {
      const c = await coop();
      const r: any = await buy(c, 100);
      const row = (await prisma.stockLedgerEntry.findFirst({ where: { refId: r.id } }))!;
      await expect(prisma.stockLedgerEntry.update({ where: { id: row.id }, data: { quantityKg: 1 } })).rejects.toThrow(/cannot be changed or deleted/);
      await expect(prisma.stockLedgerEntry.delete({ where: { id: row.id } })).rejects.toThrow(/cannot be changed or deleted/);
    });
  });

  describe('receiving', () => {
    it('paddy bought at a price is owned by the cooperative and booked: Dr paddy inventory, Cr farmer payable', async () => {
      const c = await coop();
      const r: any = await buy(c, 1000, 900);
      expect(r.status).toBe('CONFIRMED');
      const batch = (await prisma.stockBatch.findFirst({ where: { receiptId: r.id } }))!;
      expect(batch.ownerType).toBe('COOPERATIVE');
      expect(batch.unitCost).toBe(900);
      expect(await balance(c, '1200')).toBe(900_000);
      expect(await balance(c, '2200')).toBe(-900_000);
    });

    it('rejected kilograms are neither stocked nor paid for', async () => {
      const c = await coop();
      await buy(c, 1000, 900, { rejectedKg: 100, inspection: 'PASSED' });
      expect(await balance(c, '1200')).toBe(810_000);
    });

    it('rice only held for a farmer stays out of the books', async () => {
      const c = await coop();
      const r: any = await buy(c, 500);
      const batch = (await prisma.stockBatch.findFirst({ where: { receiptId: r.id } }))!;
      expect(batch.ownerType).toBe('OTHER');
      expect(batch.unitCost).toBeNull();
      expect(await balance(c, '1200')).toBe(0);
    });
  });

  describe('milling moves cost onto the rice', () => {
    async function mill(c: Awaited<ReturnType<typeof coop>>, paddyBatchId: string) {
      return processing.create(
        {
          kind: 'MILLING', warehouseId: c.warehouse.id,
          inputs: [{ batchId: paddyBatchId, quantityKg: 1000 }],
          outputs: [
            { kind: 'PRODUCT', productId: c.rice.id, quantityKg: 600 },
            { kind: 'BROKEN', productId: c.broken.id, quantityKg: 100 },
            { kind: 'BRAN', productId: c.bran.id, quantityKg: 80 },
          ],
        } as any,
        c.actor,
      );
    }

    it('the cost of the paddy moves to rice and broken rice by selling value; unpriced bran carries none', async () => {
      const c = await coop();
      const r: any = await buy(c, 1000, 900);
      const paddyBatch = (await prisma.stockBatch.findFirst({ where: { receiptId: r.id } }))!;
      const run: any = await mill(c, paddyBatch.id);
      expect(await balance(c, '1200')).toBe(0);
      expect(await balance(c, '1210')).toBe(900_000);
      expect(await balance(c, '1220')).toBe(0);
      // 600 kg × 2000 = 1,200,000 and 100 kg × 800 = 80,000: rice takes 1,200,000/1,280,000 of the cost.
      const out = await prisma.stockBatch.findMany({ where: { processingRunId: run.id }, include: { product: true } });
      const cost = (code: string) => out.find((b) => b.product.name === code)!.unitCost;
      expect(cost('RICE')! * 600).toBeCloseTo(843_750, 1);
      expect(cost('BROKEN')! * 100).toBeCloseTo(56_250, 1);
      expect(cost('BRAN')).toBeNull();
    });

    it('reversing a run cancels its journal', async () => {
      const c = await coop();
      const r: any = await buy(c, 1000, 900);
      const paddyBatch = (await prisma.stockBatch.findFirst({ where: { receiptId: r.id } }))!;
      const run: any = await mill(c, paddyBatch.id);
      await processing.reverse(run.id, 'Weighed wrongly', c.actor);
      expect(await balance(c, '1200')).toBe(900_000);
      expect(await balance(c, '1210')).toBe(0);
    });

    it('stock held for someone else is milled without touching the books', async () => {
      const c = await coop();
      const r: any = await buy(c, 1000);
      const paddyBatch = (await prisma.stockBatch.findFirst({ where: { receiptId: r.id } }))!;
      await mill(c, paddyBatch.id);
      expect(await balance(c, '1210')).toBe(0);
    });
  });

  describe('losses, selling and valuing', () => {
    it('a write-off books a loss at cost; reversing it books the gain back', async () => {
      const c = await coop();
      const r: any = await buy(c, 1000, 900);
      const batch = (await prisma.stockBatch.findFirst({ where: { receiptId: r.id } }))!;
      const entry: any = await stock.adjust({ batchId: batch.id, warehouseId: c.warehouse.id, type: 'WRITE_OFF', quantityKg: -50, reason: 'Rats' } as any, c.actor);
      expect(await balance(c, '5310')).toBe(45_000);
      expect(await balance(c, '1200')).toBe(855_000);
      await stock.reverse(entry.id, 'Counted wrongly', c.actor);
      expect(await balance(c, '5310')).toBe(0);
      expect(await balance(c, '1200')).toBe(900_000);
    });

    it('rice leaving the warehouse becomes cost of goods sold', async () => {
      const c = await coop();
      const r: any = await buy(c, 1000, 900);
      const batch = (await prisma.stockBatch.findFirst({ where: { receiptId: r.id } }))!;
      await prisma.$transaction(async (tx) => {
        const taken = await drawFromBatches(tx, { warehouseId: c.warehouse.id, quantityKg: 400, refType: 'test', refId: 'load-1', actorId: c.actor.id });
        await books.postDispatch(tx, { id: 'load-1', reference: 'LD-1', mamcosId: c.mamcos.id }, taken, c.actor.id, 'StockLoad');
      });
      expect(await balance(c, '5300')).toBe(360_000);
      expect(await balance(c, '1200')).toBe(540_000);
      const left = await stock.batches(c.actor, {});
      expect((left as any[]).find((b) => b.id === batch.id).physicalKg).toBe(600);
    });

    it('cannot draw more than is free in the warehouse', async () => {
      const c = await coop();
      await buy(c, 100, 900);
      await expect(prisma.$transaction((tx) => drawFromBatches(tx, { warehouseId: c.warehouse.id, quantityKg: 150, refType: 't', refId: 'x', actorId: c.actor.id }))).rejects.toBeInstanceOf(ConflictException);
    });

    it('a batch with no cost gets an opening value once, and the books follow', async () => {
      const c = await coop();
      const r: any = await buy(c, 200);
      const batch = (await prisma.stockBatch.findFirst({ where: { receiptId: r.id } }))!;
      // Held for someone else: cannot be valued.
      await expect(books.setOpeningValue(batch.id, 500, c.actor)).rejects.toBeInstanceOf(BadRequestException);
      await prisma.stockBatch.update({ where: { id: batch.id }, data: { ownerType: 'COOPERATIVE' } });
      await books.setOpeningValue(batch.id, 500, c.actor);
      expect(await balance(c, '1200')).toBe(100_000);
      await expect(books.setOpeningValue(batch.id, 600, c.actor)).rejects.toBeInstanceOf(ConflictException);
    });

    it('stock value and the books agree after buying, milling, a loss and a sale', async () => {
      const c = await coop();
      const r: any = await buy(c, 1000, 900);
      const paddyBatch = (await prisma.stockBatch.findFirst({ where: { receiptId: r.id } }))!;
      await processing.create({ kind: 'MILLING', warehouseId: c.warehouse.id, inputs: [{ batchId: paddyBatch.id, quantityKg: 1000 }], outputs: [{ kind: 'PRODUCT', productId: c.rice.id, quantityKg: 700 }, { kind: 'BROKEN', productId: c.broken.id, quantityKg: 100 }] } as any, c.actor);
      const riceBatch = (await prisma.stockBatch.findFirst({ where: { mamcosId: c.mamcos.id, productId: c.rice.id } }))!;
      await stock.adjust({ batchId: riceBatch.id, warehouseId: c.warehouse.id, type: 'WRITE_OFF', quantityKg: -20, reason: 'Spoiled' } as any, c.actor);
      await prisma.$transaction(async (tx) => {
        const taken = await drawFromBatches(tx, { warehouseId: c.warehouse.id, quantityKg: 300, refType: 't', refId: 'sale', actorId: c.actor.id });
        await books.postDispatch(tx, { id: 'sale', reference: 'S-1', mamcosId: c.mamcos.id }, taken, c.actor.id);
      });
      const v = await books.valuation(c.actor);
      expect(v.matches).toBe(true);
      expect(v.totalStockValue).toBeCloseTo(v.totalBooksValue, 0);
    });

    it('paddy bought at the centre but not yet received into a warehouse explains the difference', async () => {
      const c = await coop();
      const user = await prisma.user.create({ data: { phone: `+2557${Math.floor(Math.random() * 1e8)}`, passwordHash: 'x', role: UserRole.FARMER } });
      const farmer = await prisma.farmer.create({ data: { userId: user.id, controlNumber: `ST-${randomUUID().slice(0, 6)}`, firstName: 'Asha', lastName: 'M', mamcosId: c.mamcos.id } });
      const farm = await prisma.farm.create({ data: { farmCode: `F-${randomUUID().slice(0, 6)}`, name: 'Shamba', socialHectares: 2, mamcosId: c.mamcos.id } as any });
      const record = await prisma.inventoryRecord.create({ data: { farmId: farm.id, farmerId: farmer.id, weightKg: 100, trackingCode: `TRK-${randomUUID().slice(0, 6)}`, receivedDate: new Date(), mamcosId: c.mamcos.id, pricePerKg: 1000, totalValue: 100_000 } });
      await accounting.postToLedger('PaddyDelivery', record.id, new Date(), 'Paddy received', [{ code: '1200', debit: 100_000 }, { code: '2200', credit: 100_000 }], c.mamcos.id);
      let v = await books.valuation(c.actor);
      expect(v.matches).toBe(true);
      expect(v.rows[0].notYetReceived).toBe(100_000);

      // Receiving it into the warehouse carries its cost over and must not book it a second time.
      await warehouses.receive(c.warehouse.id, { inventoryRecordIds: [record.id] } as any, c.actor);
      expect(await balance(c, '1200')).toBe(100_000);
      const batch = (await prisma.stockBatch.findFirst({ where: { warehouseId: c.warehouse.id } }))!;
      expect(batch.unitCost).toBe(1000);
      expect(batch.ownerType).toBe('COOPERATIVE');
      v = await books.valuation(c.actor);
      expect(v.matches).toBe(true);
      expect(v.rows[0].notYetReceived).toBe(0);
      expect(v.rows[0].stockValue).toBe(100_000);
    });
  });

  describe('the warehouse counter uses the same record', () => {
    it('counted stock appears in the balance, adjustments change it, and a loss is taken from the oldest stock', async () => {
      const c = await coop();
      await warehouses.receive(c.warehouse.id, { quantityKg: 500, note: 'Opening count' } as any, c.actor);
      expect((await warehouseBalance(prisma as any, c.warehouse.id)).onHandKg).toBe(500);
      await buy(c, 300, 900);
      expect((await warehouseBalance(prisma as any, c.warehouse.id)).onHandKg).toBe(800);
      await warehouses.adjust(c.warehouse.id, { deltaKg: -50, reason: 'Spillage' } as any, c.actor);
      expect((await warehouseBalance(prisma as any, c.warehouse.id)).onHandKg).toBe(750);
      const moves = await warehouses.movements(c.warehouse.id, c.actor);
      expect(moves.map((m: any) => m.type)).toEqual(expect.arrayContaining(['IN', 'ADJUST']));
    });

    it('refuses an adjustment that would take stock below zero', async () => {
      const c = await coop();
      await warehouses.receive(c.warehouse.id, { quantityKg: 100 } as any, c.actor);
      await expect(warehouses.adjust(c.warehouse.id, { deltaKg: -150, reason: 'Oops' } as any, c.actor)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('stock quarantined or sitting in by-products is not counted as sellable', async () => {
      const c = await coop();
      const r: any = await buy(c, 200, 900);
      const batch = (await prisma.stockBatch.findFirst({ where: { receiptId: r.id } }))!;
      await stock.setBatchStatus(batch.id, { status: 'QUARANTINED', reason: 'Damp' } as any, c.actor);
      expect((await warehouseBalance(prisma as any, c.warehouse.id)).onHandKg).toBe(0);
    });
  });

  describe('sales invoices and payments reach the books', () => {
    async function order(c: Awaited<ReturnType<typeof coop>>, total: number, tax = 0) {
      const customer = await prisma.customer.create({ data: { mamcosId: c.mamcos.id, reference: `CU-${randomUUID().slice(0, 6)}`, type: 'INDIVIDUAL', name: 'Buyer', phone: '+255700000000' } });
      return prisma.opsOrder.create({ data: { mamcosId: c.mamcos.id, reference: `OR-${randomUUID().slice(0, 6)}`, customerId: customer.id, status: 'APPROVED_FOR_INVOICING', subtotal: total - tax, taxTotal: tax, total, createdByUserId: c.actor.id } });
    }

    it('issuing books receivable, revenue and VAT; payments book cash; a void takes it back', async () => {
      const c = await coop();
      const o = await order(c, 1180, 180);
      const inv: any = await billing.issueInvoice(o.id, {}, c.actor);
      expect(await balance(c, '1100')).toBe(1180);
      expect(await balance(c, '4000')).toBe(-1000);
      expect(await balance(c, '2400')).toBe(-180);

      await billing.recordPayment(inv.id, { amount: 500, method: 'CASH', reference: `RC-${randomUUID().slice(0, 6)}` } as any, c.actor);
      expect(await balance(c, '1000')).toBe(500);
      expect(await balance(c, '1100')).toBe(680);
    });

    it('the debtors list shows the unpaid part of Orders & Sales invoices, and drops them once paid', async () => {
      const c = await coop();
      const o = await order(c, 1000);
      const inv: any = await billing.issueInvoice(o.id, {}, c.actor);
      const scope = { mamcosId: c.mamcos.id };
      let list: any[] = await accounting.receivables(scope);
      expect(list).toHaveLength(1);
      expect(list[0]).toMatchObject({ source: 'ORDERS', invoiceNumber: inv.invoiceNumber, amount: 1000, status: 'OPEN' });
      await billing.recordPayment(inv.id, { amount: 400, method: 'CASH', reference: `RC-${randomUUID().slice(0, 6)}` } as any, c.actor);
      list = await accounting.receivables(scope);
      expect(list[0].amount).toBe(600);
      await billing.recordPayment(inv.id, { amount: 600, method: 'CASH', reference: `RC-${randomUUID().slice(0, 6)}` } as any, c.actor);
      expect(await accounting.receivables(scope)).toHaveLength(0);
      // The list agrees with the receivable in the books.
      expect(await balance(c, '1100')).toBe(0);
    });

    it('voiding an unpaid invoice removes revenue and receivable', async () => {
      const c = await coop();
      const o = await order(c, 2000);
      const inv: any = await billing.issueInvoice(o.id, {}, c.actor);
      await billing.voidInvoice(inv.id, 'Wrong customer', c.actor);
      expect(await balance(c, '1100')).toBe(0);
      expect(await balance(c, '4000')).toBe(0);
    });
  });

  describe('each cooperative sees only its own stock value', () => {
    it('valuation is limited to the actor’s cooperative', async () => {
      const a = await coop();
      const b = await coop();
      await buy(a, 100, 1000);
      await buy(b, 100, 3000);
      expect((await books.valuation(a.actor)).totalStockValue).toBe(100_000);
      expect((await books.valuation(b.actor)).totalStockValue).toBe(300_000);
    });
  });
});
