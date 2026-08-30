/**
 * Seeds field-officer workspace demo data: farmer verification mix,
 * weekly visits (charts), and pending lease verifications (today's work).
 *
 * Visit dates are relative to seed run time: clustered field days, quiet weekends,
 * and 0–4 visits per active day (not one artificial visit every day).
 *
 * Run: npx ts-node prisma/seed-officer-workspace.ts
 */
import {
  Farmer,
  FieldOfficerVisitPurpose,
  LeaseStatus,
  PrismaClient,
  UserRole,
  VerificationStatus,
} from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcrypt';
import * as dotenv from 'dotenv';

dotenv.config();

const connectionString =
  process.env.DATABASE_URL ||
  'postgresql://mayode:Mayode%402026@localhost:5432/mayode_db?schema=public';
const pool = new Pool({ connectionString });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const OFFICER_PHONE = '+255700111222';
const DEMO_TAG = 'OFFICER-WS-DEMO';
const MADCOS_NAME = 'Madibira AMCOS';

function d(iso: string) {
  return new Date(iso);
}

function daysAgo(days: number, hour = 10, minute = 0) {
  const dt = new Date();
  dt.setDate(dt.getDate() - days);
  dt.setHours(hour, minute, 0, 0);
  return dt;
}

type VisitSeed = {
  daysAgo: number;
  hour: number;
  purpose: FieldOfficerVisitPurpose;
  farmerIdx: number;
  farmIdx: number;
};

/** Realistic visit mix: clustered field days, quiet weekends, 0–4 visits/day. */
function buildVisitPlan(): VisitSeed[] {
  const R = FieldOfficerVisitPurpose.ROUTINE_CHECK;
  const A = FieldOfficerVisitPurpose.FARMING_ASSISTANCE;
  const V = FieldOfficerVisitPurpose.VERIFICATION;
  const T = FieldOfficerVisitPurpose.TRAINING;
  const D = FieldOfficerVisitPurpose.DISPUTE_FOLLOWUP;

  return [
    // Last 7 days — uneven week an officer actually has
    { daysAgo: 6, hour: 8, purpose: R, farmerIdx: 0, farmIdx: 0 },
    { daysAgo: 6, hour: 14, purpose: V, farmerIdx: 2, farmIdx: 2 },
    { daysAgo: 5, hour: 7, purpose: A, farmerIdx: 1, farmIdx: 1 },
    { daysAgo: 5, hour: 10, purpose: R, farmerIdx: 3, farmIdx: 3 },
    { daysAgo: 5, hour: 15, purpose: T, farmerIdx: 5, farmIdx: 1 },
    // day 4: no visits (AMCOS meeting / travel)
    { daysAgo: 3, hour: 8, purpose: V, farmerIdx: 6, farmIdx: 2 },
    { daysAgo: 3, hour: 9, purpose: R, farmerIdx: 7, farmIdx: 3 },
    { daysAgo: 3, hour: 11, purpose: A, farmerIdx: 4, farmIdx: 0 },
    { daysAgo: 3, hour: 14, purpose: R, farmerIdx: 0, farmIdx: 0 },
    { daysAgo: 2, hour: 10, purpose: D, farmerIdx: 1, farmIdx: 1 },
    // day 1: no visits (Saturday)
    { daysAgo: 0, hour: 9, purpose: R, farmerIdx: 2, farmIdx: 2 },
    { daysAgo: 0, hour: 11, purpose: V, farmerIdx: 8, farmIdx: 3 },

    // Prior weeks — busier mid-month, lighter edges
    { daysAgo: 8, hour: 9, purpose: R, farmerIdx: 3, farmIdx: 3 },
    { daysAgo: 8, hour: 13, purpose: A, farmerIdx: 5, farmIdx: 1 },
    { daysAgo: 10, hour: 8, purpose: R, farmerIdx: 0, farmIdx: 0 },
    { daysAgo: 10, hour: 10, purpose: V, farmerIdx: 6, farmIdx: 2 },
    { daysAgo: 10, hour: 14, purpose: T, farmerIdx: 4, farmIdx: 0 },
    { daysAgo: 12, hour: 9, purpose: A, farmerIdx: 7, farmIdx: 3 },
    { daysAgo: 14, hour: 8, purpose: R, farmerIdx: 1, farmIdx: 1 },
    { daysAgo: 14, hour: 11, purpose: R, farmerIdx: 2, farmIdx: 2 },
    { daysAgo: 14, hour: 15, purpose: V, farmerIdx: 9, farmIdx: 0 },
    { daysAgo: 17, hour: 10, purpose: T, farmerIdx: 5, farmIdx: 1 },
    { daysAgo: 19, hour: 9, purpose: R, farmerIdx: 3, farmIdx: 3 },
    { daysAgo: 19, hour: 14, purpose: A, farmerIdx: 0, farmIdx: 0 },
    { daysAgo: 21, hour: 8, purpose: D, farmerIdx: 1, farmIdx: 1 },
    { daysAgo: 24, hour: 10, purpose: R, farmerIdx: 4, farmIdx: 0 },
    { daysAgo: 24, hour: 13, purpose: V, farmerIdx: 6, farmIdx: 2 },
    { daysAgo: 27, hour: 9, purpose: A, farmerIdx: 2, farmIdx: 2 },
    { daysAgo: 27, hour: 11, purpose: R, farmerIdx: 7, farmIdx: 3 },
    { daysAgo: 27, hour: 15, purpose: T, farmerIdx: 8, farmIdx: 3 },

    // ~1–2 months back — moderate activity
    { daysAgo: 32, hour: 9, purpose: R, farmerIdx: 0, farmIdx: 0 },
    { daysAgo: 35, hour: 10, purpose: V, farmerIdx: 3, farmIdx: 3 },
    { daysAgo: 38, hour: 8, purpose: A, farmerIdx: 1, farmIdx: 1 },
    { daysAgo: 38, hour: 14, purpose: R, farmerIdx: 5, farmIdx: 1 },
    { daysAgo: 42, hour: 9, purpose: T, farmerIdx: 4, farmIdx: 0 },
    { daysAgo: 45, hour: 10, purpose: R, farmerIdx: 2, farmIdx: 2 },
    { daysAgo: 48, hour: 11, purpose: A, farmerIdx: 6, farmIdx: 2 },
    { daysAgo: 52, hour: 9, purpose: V, farmerIdx: 7, farmIdx: 3 },
    { daysAgo: 55, hour: 8, purpose: R, farmerIdx: 0, farmIdx: 0 },
    { daysAgo: 55, hour: 13, purpose: R, farmerIdx: 1, farmIdx: 1 },
    { daysAgo: 60, hour: 10, purpose: A, farmerIdx: 3, farmIdx: 3 },
    { daysAgo: 65, hour: 9, purpose: R, farmerIdx: 5, farmIdx: 1 },
    { daysAgo: 70, hour: 14, purpose: T, farmerIdx: 4, farmIdx: 0 },
    { daysAgo: 75, hour: 10, purpose: V, farmerIdx: 2, farmIdx: 2 },
    { daysAgo: 80, hour: 9, purpose: R, farmerIdx: 6, farmIdx: 2 },

    // Quieter stretch 3–5 months ago
    { daysAgo: 95, hour: 10, purpose: R, farmerIdx: 1, farmIdx: 1 },
    { daysAgo: 102, hour: 9, purpose: A, farmerIdx: 3, farmIdx: 3 },
    { daysAgo: 110, hour: 11, purpose: R, farmerIdx: 0, farmIdx: 0 },
    { daysAgo: 118, hour: 10, purpose: V, farmerIdx: 4, farmIdx: 0 },
    { daysAgo: 125, hour: 9, purpose: R, farmerIdx: 2, farmIdx: 2 },
    { daysAgo: 135, hour: 14, purpose: T, farmerIdx: 5, farmIdx: 1 },
    { daysAgo: 148, hour: 10, purpose: R, farmerIdx: 7, farmIdx: 3 },
    { daysAgo: 160, hour: 9, purpose: A, farmerIdx: 1, farmIdx: 1 },

    // Early season ramp-up 6–10 months ago
    { daysAgo: 185, hour: 10, purpose: R, farmerIdx: 0, farmIdx: 0 },
    { daysAgo: 195, hour: 9, purpose: V, farmerIdx: 2, farmIdx: 2 },
    { daysAgo: 210, hour: 11, purpose: A, farmerIdx: 4, farmIdx: 0 },
    { daysAgo: 225, hour: 8, purpose: R, farmerIdx: 3, farmIdx: 3 },
    { daysAgo: 225, hour: 13, purpose: T, farmerIdx: 6, farmIdx: 2 },
    { daysAgo: 250, hour: 10, purpose: R, farmerIdx: 1, farmIdx: 1 },
    { daysAgo: 275, hour: 9, purpose: A, farmerIdx: 5, farmIdx: 1 },
    { daysAgo: 300, hour: 10, purpose: R, farmerIdx: 0, farmIdx: 0 },
  ];
}

async function nextControl(prefix = 'MYD-DEMO') {
  const existing = await prisma.farmer.findMany({
    where: { controlNumber: { startsWith: prefix } },
    select: { controlNumber: true },
  });
  const nums = existing
    .map((f) => Number(f.controlNumber.replace(`${prefix}-`, '')))
    .filter((n) => !Number.isNaN(n));
  const next = (nums.length ? Math.max(...nums) : 0) + 1;
  return `${prefix}-${String(next).padStart(3, '0')}`;
}

async function ensureDemoFarmer(
  officerStaffId: string,
  mamcosId: string,
  spec: {
    firstName: string;
    lastName: string;
    phone: string;
    status: VerificationStatus;
    village: string;
  },
) {
  const controlNumber = await nextControl('MYD-DEMO');
  const passwordHash = await bcrypt.hash('Demo@2026', 10);

  let user = await prisma.user.findUnique({ where: { phone: spec.phone } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        phone: spec.phone,
        passwordHash,
        firstName: spec.firstName,
        lastName: spec.lastName,
        role: UserRole.FARMER,
        isActive: true,
        language: 'en',
      },
    });
  }

  const farmer = await prisma.farmer.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      controlNumber,
      firstName: spec.firstName,
      lastName: spec.lastName,
      village: spec.village,
      ward: 'Madibira',
      district: 'Mbarali',
      region: 'Mbeya',
      mamcosId,
      verificationStatus: spec.status,
      verifiedAt: spec.status === VerificationStatus.VERIFIED ? daysAgo(90) : null,
      assignedOfficerId: officerStaffId,
      dataShareConsent: true,
      consentedAt: daysAgo(120),
    },
    update: {
      mamcosId,
      verificationStatus: spec.status,
      verifiedAt: spec.status === VerificationStatus.VERIFIED ? daysAgo(90) : null,
      assignedOfficerId: officerStaffId,
      village: spec.village,
    },
  });

  return farmer;
}

async function ensureDemoFarm(mamcosId: string, farmCode: string, name: string, farmerId?: string) {
  return prisma.farm.upsert({
    where: { farmCode },
    create: {
      farmCode,
      name,
      mamcosId,
      farmerId: farmerId ?? null,
      socialHectares: 1.2,
      actualAcres: 2.5,
      village: 'Madibira',
      district: 'Mbarali',
      region: 'Mbeya',
      isVerified: true,
    },
    update: { mamcosId, name, farmerId: farmerId ?? undefined },
  });
}

async function main() {
  const officerUser = await prisma.user.findFirst({
    where: { phone: OFFICER_PHONE },
    include: { mamcosStaff: { include: { mamcos: true } } },
  });
  if (!officerUser?.mamcosStaff) {
    throw new Error(`Field officer not found for ${OFFICER_PHONE}`);
  }

  const staff = officerUser.mamcosStaff;
  const mamcosId = staff.mamcosId;
  if (!mamcosId) throw new Error('Officer has no AMCOS assignment');

  const season = await prisma.farmingSeason.findFirst({
    where: { OR: [{ name: '2026/2027 Masika' }, { mamcosId }] },
    orderBy: { startDate: 'desc' },
  });
  if (!season) throw new Error('No farming season found');

  console.log(`Seeding workspace for ${staff.firstName} ${staff.lastName} @ ${staff.mamcos?.name || MADCOS_NAME}`);

  // Clean prior demo visits / leases tagged in notes
  await prisma.fieldOfficerVisit.deleteMany({ where: { notes: { contains: DEMO_TAG } } });
  await prisma.farmLease.deleteMany({ where: { notes: { contains: DEMO_TAG } } });

  const farmerSpecs: Array<{
    firstName: string;
    lastName: string;
    phone: string;
    status: VerificationStatus;
    village: string;
  }> = [
    { firstName: 'Juma', lastName: 'Mwalimu', phone: '+255700200001', status: VerificationStatus.VERIFIED, village: 'Ihango' },
    { firstName: 'Neema', lastName: 'Kileo', phone: '+255700200002', status: VerificationStatus.VERIFIED, village: 'Madibira' },
    { firstName: 'Rajabu', lastName: 'Mwakasege', phone: '+255700200003', status: VerificationStatus.VERIFIED, village: 'Igurusi' },
    { firstName: 'Fatuma', lastName: 'Saidi', phone: '+255700200004', status: VerificationStatus.VERIFIED, village: 'Ihango' },
    { firstName: 'Hamisi', lastName: 'Mponda', phone: '+255700200005', status: VerificationStatus.VERIFIED, village: 'Madibira' },
    { firstName: 'Amina', lastName: 'Juma', phone: '+255700200006', status: VerificationStatus.VERIFIED, village: 'Igurusi' },
    { firstName: 'Yohana', lastName: 'Mtui', phone: '+255700200007', status: VerificationStatus.PENDING, village: 'Ihango' },
    { firstName: 'Grace', lastName: 'Lyimo', phone: '+255700200008', status: VerificationStatus.PENDING, village: 'Madibira' },
    { firstName: 'Omary', lastName: 'Kassim', phone: '+255700200009', status: VerificationStatus.PENDING, village: 'Igurusi' },
    { firstName: 'Rehema', lastName: 'Mwakasubi', phone: '+255700200010', status: VerificationStatus.PENDING, village: 'Madibira' },
    { firstName: 'Salum', lastName: 'Ngassa', phone: '+255700200011', status: VerificationStatus.REJECTED, village: 'Ihango' },
    { firstName: 'Zawadi', lastName: 'Mrema', phone: '+255700200012', status: VerificationStatus.SUSPENDED, village: 'Igurusi' },
  ];

  const demoFarmers: Farmer[] = [];
  for (const spec of farmerSpecs) {
    demoFarmers.push(await ensureDemoFarmer(staff.id, mamcosId, spec));
  }

  // Include existing AMCOS farmers (e.g. Athanas) in visit pool
  const allFarmers = await prisma.farmer.findMany({
    where: { mamcosId },
    select: { id: true, firstName: true, lastName: true },
  });

  const farms = [
    await ensureDemoFarm(mamcosId, 'MD-DEMO-01', 'Ihango Block A', demoFarmers[0]?.id),
    await ensureDemoFarm(mamcosId, 'MD-DEMO-02', 'Madibira Block B', demoFarmers[1]?.id),
    await ensureDemoFarm(mamcosId, 'MD-DEMO-03', 'Igurusi Block C', demoFarmers[2]?.id),
    await ensureDemoFarm(mamcosId, 'MD-DEMO-04', 'Ihango Block D', demoFarmers[3]?.id),
  ];

  const existingFarms = await prisma.farm.findMany({ where: { mamcosId }, take: 6 });
  const visitFarms = [...farms, ...existingFarms].filter(
    (farm, idx, arr) => arr.findIndex((f) => f.id === farm.id) === idx,
  );

  const visitPlan = buildVisitPlan();

  let visitCount = 0;
  for (const plan of visitPlan) {
    const farmer = allFarmers[plan.farmerIdx % allFarmers.length];
    const farm = visitFarms[plan.farmIdx % visitFarms.length];
    if (!farmer) continue;
    await prisma.fieldOfficerVisit.create({
      data: {
        fieldOfficerId: staff.id,
        farmerId: farmer.id,
        farmId: farm?.id,
        purpose: plan.purpose,
        notes: `${DEMO_TAG} ${plan.purpose}`,
        visitedAt: daysAgo(plan.daysAgo, plan.hour),
        photoUrls: [],
      },
    });
    visitCount += 1;
  }

  const leaseRenters = demoFarmers.slice(0, 4);
  const leaseFarms = farms.slice(0, 4);
  let leaseCount = 0;
  for (let i = 0; i < leaseRenters.length; i += 1) {
    const renter = leaseRenters[i];
    const farm = leaseFarms[i];
    const renterRow = await prisma.farmer.findUnique({
      where: { id: renter.id },
      include: { user: { select: { phone: true } } },
    });
    await prisma.farmLease.create({
      data: {
        farmId: farm.id,
        ownerFarmerId: null,
        renterFarmerId: renter.id,
        renterName: `${renter.firstName} ${renter.lastName}`,
        renterPhone: renterRow?.user?.phone || `+25570029900${i}`,
        farmingSeasonId: season.id,
        leaseStartDate: d('2026-03-01'),
        leaseEndDate: d('2026-08-31'),
        ownerConfirmationStatus: VerificationStatus.VERIFIED,
        renterConfirmationStatus: VerificationStatus.VERIFIED,
        officerConfirmationStatus: VerificationStatus.PENDING,
        status: LeaseStatus.PENDING_VERIFICATION,
        notes: `${DEMO_TAG} lease pending officer review`,
        updatedAt: daysAgo(i),
      },
    });
    leaseCount += 1;
  }

  const farmerStats = await prisma.farmer.groupBy({
    by: ['verificationStatus'],
    where: { mamcosId },
    _count: true,
  });

  console.log('Done.');
  console.log(`  Demo farmers ensured: ${demoFarmers.length}`);
  console.log(`  Visits created: ${visitCount}`);
  console.log(`  Pending lease verifications: ${leaseCount}`);
  console.log(`  Farmer verification mix:`, farmerStats);
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
