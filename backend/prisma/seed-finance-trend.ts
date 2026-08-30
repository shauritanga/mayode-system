/**
 * Recent income/expense rows so the home trend chart has Weekly / Monthly / Yearly data.
 * Idempotent: deletes previous CHART-SEED rows first.
 *
 * Run: npx ts-node prisma/seed-finance-trend.ts
 */
import { CostCategory, PrismaClient, RevenueType } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';

dotenv.config();

const connectionString =
  process.env.DATABASE_URL ||
  'postgresql://mayode:Mayode%402026@localhost:5432/mayode_db?schema=public';
const pool = new Pool({ connectionString });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const TAG = 'CHART-SEED';
const LOGIN_PHONE = '+255629593331';

function daysAgo(days: number) {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - days);
  return d;
}

async function main() {
  const farmer = await prisma.farmer.findFirst({
    where: {
      OR: [
        { controlNumber: { in: ['MYD-00001', 'MYD-00006'] } },
        { user: { phone: LOGIN_PHONE } },
      ],
    },
    include: {
      cropCycles: { orderBy: { createdAt: 'desc' } },
    },
  });
  if (!farmer) throw new Error('Athanas farmer not found');
  const cycle =
    farmer.cropCycles.find((c) => c.status === 'ACTIVE') ?? farmer.cropCycles[0];
  if (!cycle) throw new Error('No crop cycle to attach finance rows');

  await prisma.inputCost.deleteMany({
    where: { cropCycleId: { in: farmer.cropCycles.map((c) => c.id) }, itemName: { startsWith: TAG } },
  });
  await prisma.revenue.deleteMany({
    where: { cropCycleId: { in: farmer.cropCycles.map((c) => c.id) }, pricePerKg: 1199 },
  });

  const expenseDays = [0, 1, 2, 4, 6, 10, 16, 22, 40, 70, 100, 160, 220, 280];
  const incomeDays = [0, 3, 5, 12, 18, 35, 80, 140, 200, 260];

  for (const [i, day] of expenseDays.entries()) {
    await prisma.inputCost.create({
      data: {
        cropCycleId: cycle.id,
        category: i % 2 === 0 ? CostCategory.LABOR : CostCategory.FERTILIZER,
        itemName: `${TAG} ${i + 1}`,
        totalCost: 45000 + i * 12000,
        dateIncurred: daysAgo(day),
      },
    });
  }

  for (const [i, day] of incomeDays.entries()) {
    await prisma.revenue.create({
      data: {
        cropCycleId: cycle.id,
        revenueType: RevenueType.CONVENTIONAL_SALE,
        quantityKg: 20 + i * 5,
        pricePerKg: 1199,
        totalRevenue: 80000 + i * 25000,
        saleDate: daysAgo(day),
      },
    });
  }

  console.log(`Seeded ${expenseDays.length} expenses and ${incomeDays.length} income rows on cycle ${cycle.id}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
