/** Buyers: the list with trading stats, the details panel, and isolation between cooperatives, against the throw-away `irrigation_test` schema. Skipped unless IRRIGATION_TEST_DATABASE_URL is set. */
import 'reflect-metadata';
import { randomUUID } from 'crypto';
import { NotFoundException } from '@nestjs/common';
import { PrismaClient, UserRole } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { BuyersService } from './buyers.service';

const BASE_URL = process.env.IRRIGATION_TEST_DATABASE_URL;
(BASE_URL ? describe : describe.skip)('Buyers (PostgreSQL)', () => {
  jest.setTimeout(60_000);
  let pool: Pool; let prisma: PrismaClient; let svc: BuyersService;
  beforeAll(() => {
    const url = `${BASE_URL!.split('?')[0]}?options=${encodeURIComponent('-c search_path=irrigation_test')}`;
    pool = new Pool({ connectionString: url, max: 3 });
    prisma = new PrismaClient({ adapter: new PrismaPg(pool, { schema: 'irrigation_test' }) });
    svc = new BuyersService(prisma as any);
  });
  afterAll(async () => { await prisma.$disconnect(); await pool.end(); });

  it('lists a cooperative’s own buyers with their record, shows the details, and keeps others out', async () => {
    const a = (await prisma.mamcos.create({ data: { name: `Buy A ${randomUUID().slice(0, 5)}` } })).id;
    const b = (await prisma.mamcos.create({ data: { name: `Buy B ${randomUUID().slice(0, 5)}` } })).id;
    const adminA = { id: randomUUID(), role: UserRole.CUSTOM, mamcosId: a } as any;
    const adminB = { id: randomUUID(), role: UserRole.CUSTOM, mamcosId: b } as any;
    const buyer = await svc.create({ name: 'Mbeya Millers', contactPerson: 'Neema', contactPhone: '0712345678', businessType: 'MILLER', preferredVarieties: ['Super'] } as any, adminA);
    expect(buyer.mamcosId).toBe(a);

    const listA: any[] = await svc.findAll(adminA);
    expect(listA.map((x) => x.id)).toContain(buyer.id);
    expect(listA.find((x) => x.id === buyer.id).stats).toMatchObject({ sales: 0, soldValue: 0, outstanding: 0, openOrders: 0, activeAgreements: 0 });
    expect((await svc.findAll(adminB)).map((x: any) => x.id)).not.toContain(buyer.id);

    const d: any = await svc.detail(buyer.id, adminA);
    expect(d.name).toBe('Mbeya Millers');
    expect(d.recentSales).toEqual([]);
    expect(d.stats.sales).toBe(0);
    await expect(svc.detail(buyer.id, adminB)).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc.remove(buyer.id, adminB)).rejects.toBeInstanceOf(NotFoundException);
    await svc.remove(buyer.id, adminA);
    await expect(svc.detail(buyer.id, adminA)).rejects.toBeInstanceOf(NotFoundException);
  });
});
