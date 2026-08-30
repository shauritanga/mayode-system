/**
 * Seeds field-officer workspace demo data: farmer verification mix,
 * weekly visits (charts), and pending lease verifications (today's work).
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

function daysAgo(days: number, hour = 10) {
  const dt = new Date();
  dt.setDate(dt.getDate() - days);
  dt.setHours(hour, 0, 0, 0);
  return dt;
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

  const visitPlan: Array<{ daysAgo: number; purpose: FieldOfficerVisitPurpose; farmerIdx: number; farmIdx: number }> = [
    { daysAgo: 39, purpose: FieldOfficerVisitPurpose.ROUTINE_CHECK, farmerIdx: 0, farmIdx: 0 },
    { daysAgo: 38, purpose: FieldOfficerVisitPurpose.FARMING_ASSISTANCE, farmerIdx: 1, farmIdx: 1 },
    { daysAgo: 35, purpose: FieldOfficerVisitPurpose.VERIFICATION, farmerIdx: 2, farmIdx: 2 },
    { daysAgo: 33, purpose: FieldOfficerVisitPurpose.TRAINING, farmerIdx: 3, farmIdx: 3 },
    { daysAgo: 32, purpose: FieldOfficerVisitPurpose.ROUTINE_CHECK, farmerIdx: 4, farmIdx: 0 },
    { daysAgo: 28, purpose: FieldOfficerVisitPurpose.FARMING_ASSISTANCE, farmerIdx: 5, farmIdx: 1 },
    { daysAgo: 27, purpose: FieldOfficerVisitPurpose.VERIFICATION, farmerIdx: 6, farmIdx: 2 },
    { daysAgo: 25, purpose: FieldOfficerVisitPurpose.ROUTINE_CHECK, farmerIdx: 7, farmIdx: 3 },
    { daysAgo: 24, purpose: FieldOfficerVisitPurpose.TRAINING, farmerIdx: 0, farmIdx: 0 },
    { daysAgo: 21, purpose: FieldOfficerVisitPurpose.DISPUTE_FOLLOWUP, farmerIdx: 1, farmIdx: 1 },
    { daysAgo: 20, purpose: FieldOfficerVisitPurpose.ROUTINE_CHECK, farmerIdx: 2, farmIdx: 2 },
    { daysAgo: 18, purpose: FieldOfficerVisitPurpose.FARMING_ASSISTANCE, farmerIdx: 3, farmIdx: 3 },
    { daysAgo: 17, purpose: FieldOfficerVisitPurpose.VERIFICATION, farmerIdx: 4, farmIdx: 0 },
    { daysAgo: 14, purpose: FieldOfficerVisitPurpose.ROUTINE_CHECK, farmerIdx: 5, farmIdx: 1 },
    { daysAgo: 13, purpose: FieldOfficerVisitPurpose.TRAINING, farmerIdx: 6, farmIdx: 2 },
    { daysAgo: 11, purpose: FieldOfficerVisitPurpose.FARMING_ASSISTANCE, farmerIdx: 7, farmIdx: 3 },
    { daysAgo: 10, purpose: FieldOfficerVisitPurpose.ROUTINE_CHECK, farmerIdx: 0, farmIdx: 0 },
    { daysAgo: 7, purpose: FieldOfficerVisitPurpose.VERIFICATION, farmerIdx: 1, farmIdx: 1 },
    { daysAgo: 6, purpose: FieldOfficerVisitPurpose.ROUTINE_CHECK, farmerIdx: 2, farmIdx: 2 },
    { daysAgo: 5, purpose: FieldOfficerVisitPurpose.FARMING_ASSISTANCE, farmerIdx: 3, farmIdx: 3 },
    { daysAgo: 4, purpose: FieldOfficerVisitPurpose.TRAINING, farmerIdx: 4, farmIdx: 0 },
    { daysAgo: 3, purpose: FieldOfficerVisitPurpose.VERIFICATION, farmerIdx: 5, farmIdx: 1 },
    { daysAgo: 2, purpose: FieldOfficerVisitPurpose.ROUTINE_CHECK, farmerIdx: 6, farmIdx: 2 },
    { daysAgo: 1, purpose: FieldOfficerVisitPurpose.FARMING_ASSISTANCE, farmerIdx: 7, farmIdx: 3 },
    { daysAgo: 0, purpose: FieldOfficerVisitPurpose.ROUTINE_CHECK, farmerIdx: 0, farmIdx: 0 },
  ];

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
        visitedAt: daysAgo(plan.daysAgo),
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
