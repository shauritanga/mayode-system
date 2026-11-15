/**
 * Rice promised to sale orders must not be offered by operations. Runs against the throw-away `irrigation_test` schema
 * (scripts/irrigation-test-schema.sh). Skipped unless IRRIGATION_TEST_DATABASE_URL is set.
 */
import 'reflect-metadata';
import { randomUUID } from 'crypto';
import { PrismaClient, UserRole } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { OwnershipService } from '../common/ownership.service';
import { AccountingService } from '../accounting/accounting.service';
import { StockAccountingService } from './stock-accounting.service';
import { ReceivingService } from './receiving.service';
import { SalesOpsService } from './sales-ops.service';
import { saleOrderReservedKg, warehouseBalance } from '../warehouses/stock';

const BASE_URL = process.env.IRRIGATION_TEST_DATABASE_URL;
const SCHEMA = 'irrigation_test';
const describeDb = BASE_URL ? describe : describe.skip;

describeDb('Sale-order reservations and operations availability (PostgreSQL)', () => {
  jest.setTimeout(120_000);
  let pool: Pool;
  let prisma: PrismaClient;
  let receiving: ReceivingService;
  let salesOps: SalesOpsService;
  const notify: any = { tellPermission: async () => undefined, tell: async () => undefined };

  async function coopWithRice(kg: number) {
    const tag = randomUUID().slice(0, 6);
    const mamcos = await prisma.mamcos.create({ data: { name: `Coop ${tag}`, code: `C-${tag.toUpperCase()}` } });
    const warehouse = await prisma.warehouse.create({ data: { mamcosId: mamcos.id, name: `Store ${tag}` } });
    const paddy = await prisma.product.create({ data: { mamcosId: mamcos.id, code: `PADDY-${tag}`, name: 'PADDY', category: 'PADDY' } });
    const actor = { id: randomUUID(), role: UserRole.CUSTOM, mamcosId: mamcos.id } as any;
    await receiving.create({ warehouseId: warehouse.id, productId: paddy.id, sourceType: 'EXTERNAL_FARMER', sellerName: 'Asha', grossKg: kg, confirmNow: true } as any, actor);
    return { mamcos, warehouse, paddy, actor };
  }
  const reserve = (warehouseId: string, kg: number) =>
    prisma.stockMovement.create({ data: { warehouseId, type: 'RESERVE', quantityKg: kg, refType: 'SALE_ORDER', refId: randomUUID() } });

  beforeAll(async () => {
    const url = `${BASE_URL!.split('?')[0]}?options=${encodeURIComponent(`-c search_path=${SCHEMA}`)}`;
    pool = new Pool({ connectionString: url, max: 4 });
    prisma = new PrismaClient({ adapter: new PrismaPg(pool, { schema: SCHEMA }) });
    const accounting = new AccountingService(prisma as any, new OwnershipService(prisma as any));
    receiving = new ReceivingService(prisma as any, notify, new StockAccountingService(prisma as any, accounting));
    salesOps = new SalesOpsService(prisma as any, {} as any, notify, {} as any);
    await accounting.listAccounts();
  });
  afterAll(async () => { await prisma.$disconnect(); await pool.end(); });

  it('ops availability is the same as the warehouse figure when nothing is promised', async () => {
    const c = await coopWithRice(1000);
    const avail = await salesOps.availability(c.actor, [c.paddy.id]);
    expect(avail.get(c.paddy.id)).toBe(1000);
  });

  it('rice reserved by a sale order is no longer offered to operations', async () => {
    const c = await coopWithRice(1000);
    await reserve(c.warehouse.id, 400);
    expect(await saleOrderReservedKg(prisma as any, c.warehouse.id)).toBe(400);
    const avail = await salesOps.availability(c.actor, [c.paddy.id]);
    expect(avail.get(c.paddy.id)).toBe(600);
    expect((await warehouseBalance(prisma as any, c.warehouse.id)).availableKg).toBe(600);
  });

  it('a released reservation frees the rice again', async () => {
    const c = await coopWithRice(1000);
    await reserve(c.warehouse.id, 400);
    await prisma.stockMovement.create({ data: { warehouseId: c.warehouse.id, type: 'UNRESERVE', quantityKg: 400, refType: 'SALE_ORDER', refId: randomUUID() } });
    const avail = await salesOps.availability(c.actor, [c.paddy.id]);
    expect(avail.get(c.paddy.id)).toBe(1000);
  });
});
