/** Warehouse stock of farm inputs, fuel and bags, against the throw-away `irrigation_test` schema. Skipped unless IRRIGATION_TEST_DATABASE_URL is set. */
import 'reflect-metadata';
import { randomUUID } from 'crypto';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaClient, UserRole } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { OwnershipService } from '../common/ownership.service';
import { InputStockService } from './input-stock.service';

const BASE_URL = process.env.IRRIGATION_TEST_DATABASE_URL;
(BASE_URL ? describe : describe.skip)('Input stock in warehouses (PostgreSQL)', () => {
  jest.setTimeout(60_000);
  let pool: Pool; let prisma: PrismaClient; let svc: InputStockService;
  beforeAll(() => {
    const url = `${BASE_URL!.split('?')[0]}?options=${encodeURIComponent('-c search_path=irrigation_test')}`;
    pool = new Pool({ connectionString: url, max: 6 });
    prisma = new PrismaClient({ adapter: new PrismaPg(pool, { schema: 'irrigation_test' }) });
    svc = new InputStockService(prisma as any, new OwnershipService(prisma as any));
  });
  afterAll(async () => { await prisma.$disconnect(); await pool.end(); });

  const coop = async () => {
    const m = (await prisma.mamcos.create({ data: { name: `Stock ${randomUUID().slice(0, 6)}` } })).id;
    const user = await prisma.user.create({ data: { phone: `+2557${Math.floor(Math.random() * 1e8)}`, passwordHash: 'x', role: UserRole.CUSTOM, mamcosId: m } });
    const actor: any = { id: user.id, role: UserRole.CUSTOM, mamcosId: m };
    const item = await prisma.farmInputItem.create({ data: { mamcosId: m, name: `Urea ${randomUUID().slice(0, 4)}`, type: 'FERTILIZER', unit: 'kg', unitCost: 100, reorderLevel: 20 } });
    const main = await svc.defaultWarehouse(prisma as any, m);
    const second = (await prisma.warehouse.create({ data: { mamcosId: m, name: 'Field store' } })).id;
    return { m, actor, item, main, second };
  };
  const bal = async (a: Awaited<ReturnType<typeof coop>>) => {
    const o: any = await svc.overview(a.actor);
    const rows = o.data.filter((r: any) => r.itemId === a.item.id);
    return Object.fromEntries(rows.map((r: any) => [r.warehouseId ?? 'none', r.balance]));
  };

  it('creates a default store, receives into a chosen warehouse, and keeps balances per warehouse', async () => {
    const a = await coop();
    expect(a.main).toBeTruthy();
    await svc.receive(a.actor, { itemId: a.item.id, quantity: 100, source: 'PURCHASE', supplierName: 'Agro Ltd' });
    await svc.receive(a.actor, { itemId: a.item.id, warehouseId: a.second, quantity: 30, source: 'DIRECT', reference: 'DN-77' });
    expect(await bal(a)).toEqual({ [a.main]: 100, [a.second]: 30 });
    await expect(svc.receive(a.actor, { itemId: a.item.id, quantity: 5, source: 'PURCHASE' })).rejects.toThrow(/who it came from/);
    await expect(svc.receive(a.actor, { itemId: a.item.id, quantity: 0, source: 'DIRECT', reference: 'x' })).rejects.toBeInstanceOf(BadRequestException);
    // another cooperative's warehouse is refused
    const other = await coop();
    await expect(svc.receive(a.actor, { itemId: a.item.id, warehouseId: other.main, quantity: 1, source: 'OPENING' })).rejects.toThrow(/own warehouses/);
  });

  it('draws from the chosen warehouse first, then the others; strict stays in one; never goes below zero', async () => {
    const a = await coop();
    await svc.receive(a.actor, { itemId: a.item.id, quantity: 10, source: 'OPENING' });
    await svc.receive(a.actor, { itemId: a.item.id, warehouseId: a.second, quantity: 10, source: 'OPENING' });
    await prisma.$transaction((tx) => svc.drawOut(tx, { itemId: a.item.id, quantity: 14, userId: a.actor.id, refType: 'DISTRIBUTION', warehouseId: a.second }));
    expect(await bal(a)).toEqual({ [a.main]: 6 }); // an empty warehouse is not listed
    await expect(prisma.$transaction((tx) => svc.drawOut(tx, { itemId: a.item.id, quantity: 7, userId: a.actor.id, refType: 'DISTRIBUTION', warehouseId: a.main, strict: true }))).rejects.toThrow(/Only 6 kg/);
    await expect(prisma.$transaction((tx) => svc.drawOut(tx, { itemId: a.item.id, quantity: 7, userId: a.actor.id, refType: 'FIELD_WORK' }))).rejects.toBeInstanceOf(ConflictException);
    const moves = await prisma.farmInputMovement.findMany({ where: { itemId: a.item.id, type: 'OUT' } });
    expect(moves.every((m) => m.refType === 'DISTRIBUTION' && m.warehouseId)).toBe(true);
  });

  it('two people spending the same stock at once cannot overdraw it', async () => {
    const a = await coop();
    await svc.receive(a.actor, { itemId: a.item.id, quantity: 5, source: 'OPENING' });
    const results = await Promise.allSettled([1, 2].map(() => prisma.$transaction((tx) => svc.drawOut(tx, { itemId: a.item.id, quantity: 4, userId: a.actor.id, refType: 'FIELD_WORK' }))));
    expect(results.filter((r) => r.status === 'fulfilled').length).toBe(1);
    expect(await bal(a)).toEqual({ [a.main]: 1 });
  });

  it('transfers between warehouses without changing the total, and refuses what is not there', async () => {
    const a = await coop();
    await svc.receive(a.actor, { itemId: a.item.id, quantity: 50, source: 'OPENING' });
    const t = await svc.transfer(a.actor, { itemId: a.item.id, fromWarehouseId: a.main, toWarehouseId: a.second, quantity: 20 });
    expect(t.out.groupId).toBe(t.in.groupId);
    expect(await bal(a)).toEqual({ [a.main]: 30, [a.second]: 20 });
    await expect(svc.transfer(a.actor, { itemId: a.item.id, fromWarehouseId: a.second, toWarehouseId: a.main, quantity: 25 })).rejects.toBeInstanceOf(ConflictException);
    await expect(svc.transfer(a.actor, { itemId: a.item.id, fromWarehouseId: a.main, toWarehouseId: a.main, quantity: 1 })).rejects.toThrow(/two different/);
  });

  it('corrects with a reason, and reverses a mistaken receipt once', async () => {
    const a = await coop();
    const inn: any = await svc.receive(a.actor, { itemId: a.item.id, quantity: 40, source: 'DIRECT', reference: 'typo' });
    await svc.adjust(a.actor, { itemId: a.item.id, warehouseId: a.main, quantity: -5, reason: 'DAMAGED' });
    await expect(svc.adjust(a.actor, { itemId: a.item.id, warehouseId: a.main, quantity: 5, reason: 'DAMAGED' })).rejects.toThrow(/negative/);
    await expect(svc.adjust(a.actor, { itemId: a.item.id, warehouseId: a.main, quantity: -999, reason: 'LOST' })).rejects.toBeInstanceOf(ConflictException);
    await expect(svc.adjust(a.actor, { itemId: a.item.id, warehouseId: a.main, quantity: 1, reason: 'OTHER' })).rejects.toThrow(/note/);
    expect(await bal(a)).toEqual({ [a.main]: 35 });
    await expect(svc.reverse(a.actor, inn.id, 'no')).rejects.toBeInstanceOf(BadRequestException);
    await expect(svc.reverse(a.actor, inn.id, 'Entered twice by mistake')).rejects.toBeInstanceOf(ConflictException); // 5 of it was already written off, only 35 left of 40... reversing 40 needs 40
    await svc.adjust(a.actor, { itemId: a.item.id, warehouseId: a.main, quantity: 5, reason: 'FOUND' });
    await svc.reverse(a.actor, inn.id, 'Entered twice by mistake');
    expect(await bal(a)).toEqual({ none: 0 });
    await expect(svc.reverse(a.actor, inn.id, 'Entered twice by mistake')).rejects.toThrow(/already reversed/);
    const list: any = await svc.movements(a.actor, { itemId: a.item.id });
    expect(list.data.find((r: any) => r.id === inn.id).reversed).toBe(true);
  });

  it('older movements with no warehouse count as the default store, and low stock is flagged', async () => {
    const a = await coop();
    await prisma.farmInputMovement.create({ data: { itemId: a.item.id, type: 'IN', quantity: 15, createdByUserId: a.actor.id, note: 'before warehouses' } });
    const o: any = await svc.overview(a.actor);
    const row = o.data.find((r: any) => r.itemId === a.item.id);
    expect([row.warehouseId, row.balance, row.low]).toEqual([a.main, 15, true]); // 15 is under the reorder level of 20
    expect((await svc.overview(a.actor, { stockClass: 'FUEL' }) as any).data.find((r: any) => r.itemId === a.item.id)).toBeUndefined();
  });
});
