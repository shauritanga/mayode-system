/**
 * Idempotent rice-calendar tasks so the farmer home pie + farm bars have data.
 * Finds Athanas's farms, picks the latest cycle on each, upserts mixed
 * completed / pending / overdue tasks in the last 6 months + next 2 months.
 *
 * Run: npx ts-node prisma/seed-chart-tasks.ts
 */
import { CalendarTaskStatus, PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';

dotenv.config();

const connectionString =
  process.env.DATABASE_URL ||
  'postgresql://mayode:Mayode%402026@localhost:5432/mayode_db?schema=public';
const pool = new Pool({ connectionString });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const LOGIN_PHONE = '+255629593331';

function daysFromNow(days: number) {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d;
}

type Spec = {
  key: string;
  title: string;
  guidance: string;
  days: number;
  status: CalendarTaskStatus;
};

/** Farm A ~70% complete; farm B ~40% complete. */
const FARM_SPECS: Spec[][] = [
  [
    { key: 'market_plan', title: 'Mpango wa msimu na soko', guidance: 'Panga uzalishaji kwa bei ya soko.', days: -140, status: CalendarTaskStatus.COMPLETED },
    { key: 'certified_seed', title: 'Mbegu zilizoidhinishwa', guidance: 'Nunua mbegu bora zilizoidhinishwa.', days: -110, status: CalendarTaskStatus.COMPLETED },
    { key: 'land_preparation', title: 'Andaa shamba', guidance: 'Safisha na sawazisha shamba.', days: -80, status: CalendarTaskStatus.COMPLETED },
    { key: 'nursery', title: 'Andaa vitalu', guidance: 'Tengeneza matuta ya kitalu.', days: -60, status: CalendarTaskStatus.COMPLETED },
    { key: 'transplanting', title: 'Pandikiza miche', guidance: 'Pandikiza miche ya siku 14–21.', days: -45, status: CalendarTaskStatus.COMPLETED },
    { key: 'basal_fertilizer', title: 'Mbolea ya kupandia', guidance: 'Weka mbolea ya kupandia.', days: -35, status: CalendarTaskStatus.COMPLETED },
    { key: 'gap_filling', title: 'Jaza pengo', guidance: 'Jaza pengo la miche.', days: -20, status: CalendarTaskStatus.COMPLETED },
    { key: 'fertilizer_1', title: 'Mbolea ya kwanza', guidance: 'Weka mbolea ya kukuzia.', days: -12, status: CalendarTaskStatus.PENDING },
    { key: 'weed_water', title: 'Palizi na maji', guidance: 'Palilia na dhibiti kina cha maji.', days: 14, status: CalendarTaskStatus.PENDING },
    { key: 'pest_disease_scouting', title: 'Kagua wadudu', guidance: 'Kagua magonjwa na wadudu.', days: 28, status: CalendarTaskStatus.PENDING },
  ],
  [
    { key: 'market_plan', title: 'Mpango wa msimu na soko', guidance: 'Panga uzalishaji kwa bei ya soko.', days: -130, status: CalendarTaskStatus.COMPLETED },
    { key: 'certified_seed', title: 'Mbegu zilizoidhinishwa', guidance: 'Nunua mbegu bora zilizoidhinishwa.', days: -100, status: CalendarTaskStatus.COMPLETED },
    { key: 'land_preparation', title: 'Andaa shamba', guidance: 'Safisha na sawazisha shamba.', days: -70, status: CalendarTaskStatus.COMPLETED },
    { key: 'nursery', title: 'Andaa vitalu', guidance: 'Tengeneza matuta ya kitalu.', days: -50, status: CalendarTaskStatus.COMPLETED },
    { key: 'transplanting', title: 'Pandikiza miche', guidance: 'Pandikiza miche ya siku 14–21.', days: -18, status: CalendarTaskStatus.PENDING },
    { key: 'basal_fertilizer', title: 'Mbolea ya kupandia', guidance: 'Weka mbolea ya kupandia.', days: -8, status: CalendarTaskStatus.PENDING },
    { key: 'gap_filling', title: 'Jaza pengo', guidance: 'Jaza pengo la miche.', days: -4, status: CalendarTaskStatus.PENDING },
    { key: 'fertilizer_1', title: 'Mbolea ya kwanza', guidance: 'Weka mbolea ya kukuzia.', days: 10, status: CalendarTaskStatus.PENDING },
    { key: 'weed_water', title: 'Palizi na maji', guidance: 'Palilia na dhibiti kina cha maji.', days: 22, status: CalendarTaskStatus.PENDING },
    { key: 'pest_disease_scouting', title: 'Kagua wadudu', guidance: 'Kagua magonjwa na wadudu.', days: 40, status: CalendarTaskStatus.PENDING },
  ],
];

async function main() {
  const farmer = await prisma.farmer.findFirst({
    where: {
      OR: [
        { controlNumber: { in: ['MYD-00001', 'MYD-00006'] } },
        { user: { phone: LOGIN_PHONE } },
        {
          AND: [
            { lastName: { contains: 'Shauritanga', mode: 'insensitive' } },
            { firstName: { contains: 'Athanas', mode: 'insensitive' } },
          ],
        },
      ],
    },
    include: {
      farms: {
        orderBy: { farmCode: 'asc' },
        include: {
          cropCycles: { orderBy: { createdAt: 'desc' } },
        },
      },
    },
  });

  if (!farmer) throw new Error('Athanas farmer not found');
  if (!farmer.farms.length) throw new Error(`Farmer ${farmer.controlNumber} has no farms`);

  console.log(`Seeding chart tasks for ${farmer.firstName} ${farmer.lastName} (${farmer.controlNumber})`);

  let upserted = 0;
  for (let i = 0; i < Math.min(farmer.farms.length, FARM_SPECS.length); i += 1) {
    const farm = farmer.farms[i];
    const cycle =
      farm.cropCycles.find((c) => c.status === 'ACTIVE') ?? farm.cropCycles[0];
    if (!cycle) {
      console.log(`  skip ${farm.farmCode}: no crop cycle`);
      continue;
    }

    console.log(`  ${farm.farmCode} cycle ${cycle.season} (${cycle.id})`);
    for (const spec of FARM_SPECS[i]) {
      const dueDate = daysFromNow(spec.days);
      const completed = spec.status === CalendarTaskStatus.COMPLETED;
      await prisma.riceCalendarTask.upsert({
        where: { cropCycleId_taskKey: { cropCycleId: cycle.id, taskKey: spec.key } },
        create: {
          cropCycleId: cycle.id,
          protocolVersion: 1,
          taskKey: spec.key,
          title: spec.title,
          guidance: spec.guidance,
          dueDate,
          status: spec.status,
          evidenceRequired: false,
          photoUrls: [],
          completedAt: completed ? dueDate : null,
        },
        update: {
          title: spec.title,
          guidance: spec.guidance,
          dueDate,
          status: spec.status,
          completedAt: completed ? dueDate : null,
        },
      });
      upserted += 1;
    }
  }

  console.log(`Upserted ${upserted} rice calendar tasks.`);
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
