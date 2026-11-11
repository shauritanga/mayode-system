/** Settings: input types, inputs and stock, and each cooperative's own rice types, against the throw-away `irrigation_test` schema. Skipped unless IRRIGATION_TEST_DATABASE_URL is set. */
import 'reflect-metadata';
import { randomUUID } from 'crypto';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaClient, UserRole } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { OwnershipService } from '../common/ownership.service';
import { RiceVarietiesService } from '../rice-varieties/rice-varieties.service';
import { InputStockService } from '../input-stock/input-stock.service';
import { InputSetupService } from './input-setup.service';

const BASE_URL = process.env.IRRIGATION_TEST_DATABASE_URL;
(BASE_URL ? describe : describe.skip)('Input and rice type settings (PostgreSQL)', () => {
  jest.setTimeout(60_000);
  let pool: Pool; let prisma: PrismaClient; let inputs: InputSetupService; let rice: RiceVarietiesService;
  let a: string; let b: string; let adminA: any; let adminB: any;
  beforeAll(async () => {
    const url = `${BASE_URL!.split('?')[0]}?options=${encodeURIComponent('-c search_path=irrigation_test')}`;
    pool = new Pool({ connectionString: url, max: 3 });
    prisma = new PrismaClient({ adapter: new PrismaPg(pool, { schema: 'irrigation_test' }) });
    const own = new OwnershipService(prisma as any);
    inputs = new InputSetupService(prisma as any, own, new InputStockService(prisma as any, own));
    rice = new RiceVarietiesService(prisma as any);
    const tag = randomUUID().slice(0, 5);
    a = (await prisma.mamcos.create({ data: { name: `Set A ${tag}` } })).id;
    b = (await prisma.mamcos.create({ data: { name: `Set B ${tag}` } })).id;
    adminA = { id: randomUUID(), role: UserRole.CUSTOM, mamcosId: a };
    adminB = { id: randomUUID(), role: UserRole.CUSTOM, mamcosId: b };
  });
  afterAll(async () => { await prisma.$disconnect(); await pool.end(); });

  it('starts with the usual input types, lets the cooperative add its own, and keeps them apart', async () => {
    const first: any = await inputs.types(adminA);
    expect(first.data.map((t: any) => t.name)).toEqual(['Fertiliser', 'Herbicide', 'Other', 'Pesticide', 'Seed', 'Fuel', 'Packaging bags'].sort());
    const added = await inputs.createType(adminA, 'Soil conditioner');
    await expect(inputs.createType(adminA, 'soil CONDITIONER')).rejects.toBeInstanceOf(ConflictException);
    await expect(inputs.createType(adminA, '  ')).rejects.toBeInstanceOf(BadRequestException);
    expect(((await inputs.types(adminA)) as any).data.map((t: any) => t.name)).toContain('Soil conditioner');
    expect(((await inputs.types(adminB)) as any).data.map((t: any) => t.name)).not.toContain('Soil conditioner');
    await inputs.updateType(adminA, added.id, { name: 'Soil improver' });
    await expect(inputs.updateType(adminB, added.id, { isActive: false })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('adds an input under a type, takes stock in, and an input of another cooperative’s type is refused', async () => {
    const types: any = await inputs.types(adminA);
    const urea = types.data.find((t: any) => t.name === 'Fertiliser');
    const item = await inputs.createItem(adminA, { name: 'Urea', inputTypeId: urea.id, unit: 'kg', unitCost: 2000, reorderLevel: 100 });
    expect(item.type).toBe('FERTILIZER');
    await expect(inputs.createItem(adminA, { name: 'Urea', inputTypeId: urea.id })).rejects.toBeInstanceOf(ConflictException);
    const typesB: any = await inputs.types(adminB);
    await expect(inputs.createItem(adminB, { name: 'Sneaky', inputTypeId: urea.id })).rejects.toBeInstanceOf(BadRequestException);
    await inputs.addStock(adminA, item.id, { quantity: 50, note: 'Delivery' });
    await expect(inputs.addStock(adminA, item.id, { quantity: 0 })).rejects.toBeInstanceOf(BadRequestException);
    const list: any = await inputs.items(adminA);
    const row = list.data.find((i: any) => i.id === item.id);
    expect([row.typeName, row.balance, row.low]).toEqual(['Fertiliser', 50, true]); // 50 is at or under the reorder level of 100
    expect(((await inputs.items(adminB)) as any).data.find((i: any) => i.id === item.id)).toBeUndefined();
    await expect(inputs.updateItem(adminB, item.id, { unitCost: 1 })).rejects.toBeInstanceOf(NotFoundException);
    // a custom type files its inputs as OTHER
    const custom = await inputs.createType(adminB, 'Bird scarers');
    expect((await inputs.createItem(adminB, { name: 'Scare tape', inputTypeId: custom.id })).type).toBe('OTHER');
    expect(typesB.data.length).toBeGreaterThan(0);
  });

  it('a cooperative adds its own rice types: visible to it and the platform-wide ones, not to others, and not duplicated', async () => {
    const platform = await rice.create({ name: `Platform ${randomUUID().slice(0, 5)}` } as any, null);
    const mine = await rice.create({ name: `Madibira Special ${randomUUID().slice(0, 5)}` } as any, a);
    const namesA = (await rice.list(false, a)).map((v) => v.name);
    expect(namesA).toEqual(expect.arrayContaining([platform.name, mine.name]));
    const namesB = (await rice.list(false, b)).map((v) => v.name);
    expect(namesB).toContain(platform.name);
    expect(namesB).not.toContain(mine.name);
    await expect(rice.create({ name: platform.name.toUpperCase() } as any, a)).rejects.toBeInstanceOf(ConflictException);
    await expect(rice.create({ name: mine.name } as any, a)).rejects.toBeInstanceOf(ConflictException);
    await rice.create({ name: mine.name } as any, b); // another cooperative may use the same name
    await expect(rice.update(platform.id, { name: 'Hijack' } as any, a)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(rice.update(mine.id, { name: 'Hijack' } as any, b)).rejects.toBeInstanceOf(NotFoundException);
    const hidden = await rice.update(mine.id, { isActive: false } as any, a);
    expect(hidden.isActive).toBe(false);
    expect((await rice.list(false, a)).map((v) => v.name)).not.toContain(mine.name);
    expect((await rice.list(true, a)).map((v) => v.name)).toContain(mine.name);
  });
});
