/**
 * Demo seed for Athanas / Athsnas Shauritanga (MYD-00006):
 * 2 farms × 2 seasons (2024/25 + 2025/26) with crop cycles,
 * field activities, expenses, sales, and activity-feed events.
 *
 * Run: npx ts-node prisma/seed-athanas-demo.ts
 */
import { PrismaClient, ActivityType, CostCategory, RevenueType, CropCycleStatus, FarmingSeasonStatus, OwnershipSource, VerificationStatus, InputPaymentStatus, AssignmentType } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';

dotenv.config();

const connectionString =
  process.env.DATABASE_URL ||
  'postgresql://mayode:Mayode%402026@localhost:5432/mayode_db?schema=public';
const pool = new Pool({ connectionString });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const FARMER_CONTROL = 'MYD-00006';
const DEMO_TAG = 'ATHANAS-DEMO';

function d(iso: string) {
  return new Date(iso);
}

async function main() {
  const farmer = await prisma.farmer.findFirst({
    where: {
      OR: [
        { controlNumber: FARMER_CONTROL },
        {
          AND: [
            { lastName: { contains: 'Shauritanga', mode: 'insensitive' } },
            {
              OR: [
                { firstName: { contains: 'Athanas', mode: 'insensitive' } },
                { firstName: { contains: 'Athsnas', mode: 'insensitive' } },
              ],
            },
          ],
        },
      ],
    },
  });

  if (!farmer) {
    throw new Error('Farmer Athanas/Athsnas Shauritanga not found in database');
  }

  console.log(`Found farmer ${farmer.firstName} ${farmer.lastName} (${farmer.controlNumber}) id=${farmer.id}`);

  let mamcos = await prisma.mamcos.findFirst({
    where: { name: { contains: 'Madibira', mode: 'insensitive' } },
  });
  if (!mamcos) {
    mamcos = await prisma.mamcos.findFirst({ where: { name: 'Test MAMCOS' } });
  }
  if (!mamcos) {
    mamcos = await prisma.mamcos.create({
      data: {
        name: 'Madibira AMCOS',
        location: 'Madibira',
        district: 'Mbarali',
        isActive: true,
      },
    });
  }

  if (!farmer.mamcosId) {
    await prisma.farmer.update({
      where: { id: farmer.id },
      data: { mamcosId: mamcos.id, district: farmer.district || 'Mbarali', region: farmer.region || 'Mbeya' },
    });
  }

  // Idempotent cleanup of previous demo farms for this farmer
  const existingDemo = await prisma.farm.findMany({
    where: {
      farmerId: farmer.id,
      OR: [
        { farmCode: { in: [`${FARMER_CONTROL}-01`, `${FARMER_CONTROL}-02`] } },
        { name: { contains: DEMO_TAG } },
      ],
    },
    select: { id: true },
  });
  if (existingDemo.length) {
    const ids = existingDemo.map((f) => f.id);
    console.log(`Removing ${ids.length} previous demo farm(s)...`);
    await prisma.farm.deleteMany({ where: { id: { in: ids } } });
  }

  // Seasons covering two years
  const seasonsSpec = [
    {
      name: '2024/2025 Masika',
      startDate: d('2024-11-01'),
      endDate: d('2025-06-30'),
      status: FarmingSeasonStatus.COMPLETED,
    },
    {
      name: '2025/2026 Masika',
      startDate: d('2025-11-01'),
      endDate: d('2026-06-30'),
      status: FarmingSeasonStatus.ACTIVE,
    },
  ] as const;

  const seasons: Awaited<ReturnType<typeof prisma.farmingSeason.upsert>>[] = [];
  for (const s of seasonsSpec) {
    const season = await prisma.farmingSeason.upsert({
      where: { name: s.name },
      create: {
        name: s.name,
        mamcosId: mamcos.id,
        region: 'Mbeya',
        crop: 'Rice',
        startDate: s.startDate,
        endDate: s.endDate,
        status: s.status,
      },
      update: {
        mamcosId: mamcos.id,
        startDate: s.startDate,
        endDate: s.endDate,
        status: s.status,
      },
    });
    seasons.push(season);
    console.log(`Season ready: ${season.name} (${season.status})`);
  }

  // No fake centerLatitude/centerLongitude — "Mapped" means a walked boundary only.
  const farmsSpec = [
    {
      farmCode: `${FARMER_CONTROL}-01`,
      name: `Chimala North Block A (${DEMO_TAG})`,
      village: 'Chimala',
      ward: 'Chimala',
      socialHectares: 1.5,
      actualAcres: 3.7,
      grade: 'A' as const,
    },
    {
      farmCode: `${FARMER_CONTROL}-02`,
      name: `Madibira Canal Plot (${DEMO_TAG})`,
      village: 'Madibira',
      ward: 'Madibira',
      socialHectares: 2.0,
      actualAcres: 4.9,
      grade: 'B' as const,
    },
  ];

  const farms: Awaited<ReturnType<typeof prisma.farm.create>>[] = [];
  for (const f of farmsSpec) {
    const user = await prisma.user.findUnique({ where: { id: farmer.userId } });
    const farm = await prisma.farm.create({
      data: {
        farmCode: f.farmCode,
        farmerId: farmer.id,
        mamcosId: mamcos.id,
        name: f.name,
        village: f.village,
        ward: f.ward,
        district: 'Mbarali',
        region: 'Mbeya',
        socialHectares: f.socialHectares,
        actualAcres: f.actualAcres,
        grade: f.grade,
        hasIrrigation: true,
        nearRoad: true,
        soilCondition: 'Loamy',
        ownershipType: 'OWNED',
        ownerName: `${farmer.firstName} ${farmer.lastName}`,
        ownerPhone: user?.phone,
        isVerified: true,
      },
    });
    await prisma.farmOwnership.create({
      data: {
        farmId: farm.id,
        ownerFarmerId: farmer.id,
        ownerName: `${farmer.firstName} ${farmer.lastName}`,
        source: OwnershipSource.OWNER,
        confirmationStatus: VerificationStatus.VERIFIED,
        confirmedAt: d('2024-10-15'),
      },
    });
    farms.push(farm);
    console.log(`Created farm ${farm.farmCode}`);
  }

  // Owner-operated seasonal assignments (required for crop-cycle / activity access).
  const activeSeason = seasons.find((s) => s.status === FarmingSeasonStatus.ACTIVE) ?? seasons[seasons.length - 1];
  for (const farm of farms) {
    for (const season of seasons) {
      await prisma.seasonalFarmAssignment.upsert({
        where: {
          farmId_farmingSeasonId: {
            farmId: farm.id,
            farmingSeasonId: season.id,
          },
        },
        create: {
          farmId: farm.id,
          farmingSeasonId: season.id,
          activeFarmerId: farmer.id,
          assignmentType: AssignmentType.OWNER_OPERATED,
          status: VerificationStatus.VERIFIED,
        },
        update: {
          activeFarmerId: farmer.id,
          assignmentType: AssignmentType.OWNER_OPERATED,
          status: VerificationStatus.VERIFIED,
        },
      });
    }
    console.log(`Assignments ready for ${farm.farmCode} (incl. ${activeSeason.name})`);
  }

  const activityPlan: { type: ActivityType; offsetDays: number; description: string }[] = [
    { type: ActivityType.LAND_PREPARATION, offsetDays: 5, description: 'Tractor ploughing and leveling' },
    { type: ActivityType.PLANTING, offsetDays: 25, description: 'Transplanted SARO 5 seedlings' },
    { type: ActivityType.FERTILIZING, offsetDays: 45, description: 'Applied basal NPK fertilizer' },
    { type: ActivityType.WEEDING, offsetDays: 60, description: 'Manual weeding round 1' },
    { type: ActivityType.IRRIGATION, offsetDays: 75, description: 'Canal irrigation cycle' },
    { type: ActivityType.PEST_CONTROL, offsetDays: 90, description: 'Sprayed for stem borers' },
    { type: ActivityType.FERTILIZING, offsetDays: 105, description: 'Top dressing with urea' },
    { type: ActivityType.WEEDING, offsetDays: 120, description: 'Second weeding' },
    { type: ActivityType.HARVESTING, offsetDays: 180, description: 'Combine harvest completed' },
    { type: ActivityType.DRYING, offsetDays: 190, description: 'Sun drying to 14% moisture' },
    { type: ActivityType.STORAGE, offsetDays: 200, description: 'Bagged and stored at aggregation centre' },
  ];

  const expensePlan: { category: CostCategory; itemName: string; totalCost: number; day: number; unit?: string; quantity?: number }[] = [
    { category: CostCategory.TILLAGE, itemName: 'Tractor hire', totalCost: 180_000, day: 5 },
    { category: CostCategory.SEEDS, itemName: 'SARO 5 seed', totalCost: 95_000, day: 20, unit: 'kg', quantity: 40 },
    { category: CostCategory.FERTILIZER, itemName: 'NPK 17:17:17', totalCost: 210_000, day: 45, unit: 'bags', quantity: 4 },
    { category: CostCategory.LABOR, itemName: 'Transplanting labor', totalCost: 150_000, day: 25 },
    { category: CostCategory.HERBICIDE, itemName: 'Weedkiller', totalCost: 45_000, day: 55, unit: 'liters', quantity: 2 },
    { category: CostCategory.FERTILIZER, itemName: 'Urea', totalCost: 160_000, day: 105, unit: 'bags', quantity: 3 },
    { category: CostCategory.PESTICIDE, itemName: 'Insecticide', totalCost: 55_000, day: 90, unit: 'liters', quantity: 1.5 },
    { category: CostCategory.LABOR, itemName: 'Harvest labor', totalCost: 200_000, day: 180 },
    { category: CostCategory.TRANSPORT, itemName: 'Haulage to warehouse', totalCost: 80_000, day: 195 },
  ];

  let cycleCount = 0;
  for (const farm of farms) {
    for (const season of seasons) {
      const planting = new Date(season.startDate);
      planting.setDate(planting.getDate() + 20);
      const harvest = new Date(season.startDate);
      harvest.setDate(harvest.getDate() + 180);
      const isCompleted = season.status === FarmingSeasonStatus.COMPLETED;
      const yieldKg = farm.socialHectares * (isCompleted ? 4200 : 3800);

      const cycle = await prisma.cropCycle.create({
        data: {
          farmId: farm.id,
          farmerId: farmer.id,
          season: season.name,
          riceVariety: 'SARO 5',
          plantingDate: planting,
          expectedHarvest: harvest,
          harvestDate: isCompleted ? harvest : null,
          estimatedYieldKg: yieldKg,
          actualYieldKg: isCompleted ? yieldKg * 0.96 : null,
          status: isCompleted ? CropCycleStatus.COMPLETED : CropCycleStatus.ACTIVE,
        },
      });
      cycleCount += 1;

      for (const a of activityPlan) {
        const activityDate = new Date(season.startDate);
        activityDate.setDate(activityDate.getDate() + a.offsetDays);
        if (activityDate > new Date() && !isCompleted) continue;
        await prisma.activityLog.create({
          data: {
            cropCycleId: cycle.id,
            activityType: a.type,
            activityDate,
            description: `${a.description} — ${farm.farmCode}`,
            laborWorkers: a.type === ActivityType.PLANTING || a.type === ActivityType.HARVESTING ? 8 : 3,
            laborHours: 6,
          },
        });
      }

      for (const e of expensePlan) {
        const dateIncurred = new Date(season.startDate);
        dateIncurred.setDate(dateIncurred.getDate() + e.day);
        if (dateIncurred > new Date() && !isCompleted) continue;
        const scale = farm.socialHectares / 1.5;
        await prisma.inputCost.create({
          data: {
            cropCycleId: cycle.id,
            category: e.category,
            itemName: e.itemName,
            quantity: e.quantity,
            unit: e.unit,
            totalCost: Math.round(e.totalCost * scale),
            unitPrice: e.quantity ? Math.round((e.totalCost * scale) / e.quantity) : undefined,
            supplier: 'Local agro-dealer',
            paymentStatus: InputPaymentStatus.PAID,
            dateIncurred,
          },
        });
      }

      const saleDate = new Date(season.startDate);
      saleDate.setDate(saleDate.getDate() + 210);
      if (isCompleted || saleDate <= new Date()) {
        const qty = Math.round(yieldKg * 0.85);
        const price = isCompleted ? 1450 : 1500;
        await prisma.revenue.create({
          data: {
            cropCycleId: cycle.id,
            revenueType: RevenueType.CONVENTIONAL_SALE,
            quantityKg: qty,
            pricePerKg: price,
            totalRevenue: qty * price,
            fairtradePremium: 0,
            saleDate,
          },
        });
        // Second smaller sale / residual
        await prisma.revenue.create({
          data: {
            cropCycleId: cycle.id,
            revenueType: RevenueType.FAIRTRADE_SALE,
            quantityKg: Math.round(yieldKg * 0.1),
            pricePerKg: price + 120,
            totalRevenue: Math.round(yieldKg * 0.1) * (price + 120),
            fairtradePremium: Math.round(yieldKg * 0.1) * 50,
            saleDate: new Date(saleDate.getTime() + 14 * 86400000),
          },
        });
      }

      await prisma.activity.create({
        data: {
          farmerId: farmer.id,
          type: 'crop_cycle.started',
          title: `Started ${season.name} on ${farm.farmCode}`,
          subtitle: farm.name,
          icon: '🌱',
          createdAt: planting,
        },
      });
      if (isCompleted) {
        await prisma.activity.create({
          data: {
            farmerId: farmer.id,
            type: 'crop_cycle.harvested',
            title: `Harvested ${Math.round(yieldKg)} kg — ${farm.farmCode}`,
            subtitle: season.name,
            icon: '🌾',
            createdAt: harvest,
          },
        });
      }
    }

    await prisma.activity.create({
      data: {
        farmerId: farmer.id,
        type: 'farm.created',
        title: `Registered farm ${farm.farmCode}`,
        subtitle: farm.name,
        icon: '🌾',
        createdAt: d('2024-10-20'),
      },
    });
  }

  console.log(`\nDone. Seeded ${farms.length} farms, ${seasons.length} seasons, ${cycleCount} crop cycles`);
  console.log(`Farmer: ${farmer.firstName} ${farmer.lastName} (${farmer.controlNumber})`);
  console.log(`Login phone: check users table for user_id ${farmer.userId}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
