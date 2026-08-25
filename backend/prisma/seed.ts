import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import * as path from 'path';
import * as fs from 'fs';
import * as dotenv from 'dotenv';

dotenv.config();

const connectionString = process.env.DATABASE_URL || 'postgresql://mayode:Mayode%402026@localhost:5432/mayode_db?schema=public';
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

/**
 * Region → District → Ward hierarchy is loaded from a nested JSON snapshot of
 * the 2022 Tanzania census (prisma/data/tanzania-locations.json):
 *   { "Region": { "District": ["Ward", ...] } }
 *
 * IDs are Prisma cuid()s (not census PCODEs); Region.name, [District.name,
 * regionId] and [Ward.name, districtId] are unique, so `skipDuplicates` makes
 * this seed idempotent across re-runs.
 */
type LocationTree = Record<string, Record<string, string[]>>;

async function seedLocations() {
  const filePath = path.resolve(__dirname, 'data/tanzania-locations.json');
  if (!fs.existsSync(filePath)) {
    console.log('tanzania-locations.json not found — skipping region/district/ward import.');
    return;
  }
  console.log('Seeding locations from tanzania-locations.json...');
  const tree: LocationTree = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

  // The JSON is the authoritative source for the location hierarchy. Reset the
  // three reference tables first so re-seeding never leaves rows from an older
  // dataset behind. These tables have no external foreign keys (Farmer/Farm
  // store location as plain strings), so this is safe. Order respects the
  // Ward → District → Region cascade.
  await prisma.ward.deleteMany();
  await prisma.district.deleteMany();
  await prisma.region.deleteMany();

  // 1. Regions
  const regionNames = Object.keys(tree);
  await prisma.region.createMany({
    data: regionNames.map((name) => ({ name })),
    skipDuplicates: true,
  });
  const regions = await prisma.region.findMany({ select: { id: true, name: true } });
  const regionIdByName = new Map(regions.map((r) => [r.name, r.id]));
  console.log(`Seeded ${regionNames.length} regions.`);

  // 2. Districts (linked to their region)
  const districtInserts: { name: string; regionId: string }[] = [];
  for (const regionName of regionNames) {
    const regionId = regionIdByName.get(regionName);
    if (!regionId) continue;
    for (const districtName of Object.keys(tree[regionName])) {
      districtInserts.push({ name: districtName, regionId });
    }
  }
  await prisma.district.createMany({ data: districtInserts, skipDuplicates: true });
  const districts = await prisma.district.findMany({
    select: { id: true, name: true, regionId: true },
  });
  // Key by regionId::name because a district name can repeat across regions.
  const districtIdByKey = new Map(districts.map((d) => [`${d.regionId}::${d.name}`, d.id]));
  console.log(`Seeded ${districtInserts.length} districts.`);

  // 3. Wards (linked to their district), chunked to keep query size sane
  const wardInserts: { name: string; districtId: string }[] = [];
  for (const regionName of regionNames) {
    const regionId = regionIdByName.get(regionName);
    if (!regionId) continue;
    for (const districtName of Object.keys(tree[regionName])) {
      const districtId = districtIdByKey.get(`${regionId}::${districtName}`);
      if (!districtId) continue;
      for (const wardName of tree[regionName][districtName]) {
        wardInserts.push({ name: wardName, districtId });
      }
    }
  }
  const chunkSize = 1000;
  for (let i = 0; i < wardInserts.length; i += chunkSize) {
    await prisma.ward.createMany({
      data: wardInserts.slice(i, i + chunkSize),
      skipDuplicates: true,
    });
  }
  console.log(`Seeded ${wardInserts.length} wards.`);
}

/**
 * Seeds the 8 legacy UserRole values as informational `Role` rows (isSystem:
 * true) purely for display in the Roles & Permissions UI, and the initial
 * catalog of `Resource`s the first batch of custom-role enforcement covers.
 * Existing users' `roleId` is intentionally left untouched (NULL) — they
 * keep working entirely through the legacy `role` enum column.
 */
async function seedRolesAndPermissions() {
  console.log('Seeding system roles...');
  const systemRoles: { name: string; systemRole: 'SUPER_ADMIN' | 'ADMIN' | 'FIELD_OFFICER' | 'FARMER' | 'MAMCOS_SECRETARY' | 'AUDITOR' | 'BUYER' | 'FINANCIAL_PROVIDER' }[] = [
    { name: 'Super Admin', systemRole: 'SUPER_ADMIN' },
    { name: 'Admin', systemRole: 'ADMIN' },
    { name: 'Field Officer', systemRole: 'FIELD_OFFICER' },
    { name: 'Farmer', systemRole: 'FARMER' },
    { name: 'AMCOS Secretary', systemRole: 'MAMCOS_SECRETARY' },
    { name: 'Auditor', systemRole: 'AUDITOR' },
    { name: 'Buyer', systemRole: 'BUYER' },
    { name: 'Financial Provider', systemRole: 'FINANCIAL_PROVIDER' },
  ];
  for (const role of systemRoles) {
    await prisma.role.upsert({
      where: { name: role.name },
      update: { isSystem: true, systemRole: role.systemRole },
      create: { name: role.name, isSystem: true, systemRole: role.systemRole },
    });
  }

  console.log('Seeding permission resources...');
  const resources = [
    { key: 'farmers', label: 'Farmers' },
    { key: 'mamcos', label: 'AMCOS' },
    { key: 'memberships', label: 'Memberships' },
    { key: 'farms', label: 'Farms' },
    { key: 'inventory', label: 'Inventory' },
    { key: 'marketplace', label: 'MLAX Marketplace' },
    { key: 'finance', label: 'Finance and Accounting' },
    { key: 'reports', label: 'Reports' },
    { key: 'insurance', label: 'Insurance' },
    { key: 'governance', label: 'Governance' },
    { key: 'buyer_orders', label: 'Buyer Orders' },
    { key: 'suppliers', label: 'Suppliers' },
    { key: 'disputes', label: 'Disputes' },
    { key: 'farm_corrections', label: 'Farm Corrections' },
    { key: 'crop_cycles', label: 'Crop Cycles' },
    { key: 'farm_leases', label: 'Farm Leases' },
    { key: 'farming_seasons', label: 'Farming Seasons' },
    { key: 'facilities', label: 'Facilities' },
    { key: 'field_surveys', label: 'Field Surveys' },
    { key: 'sales', label: 'Sales' },
    { key: 'activities', label: 'Activities' },
    { key: 'weather', label: 'Weather' },
    { key: 'rewards', label: 'Rewards' },
    { key: 'farm_registry', label: 'Farm Registry' },
    { key: 'plots', label: 'Plots' },
    { key: 'farm_verifications', label: 'Farm Verifications' },
    { key: 'accounting', label: 'Accounting' },
    { key: 'loans', label: 'Loans' },
    { key: 'buyers', label: 'Buyers' },
    { key: 'users', label: 'User Accounts' },
    { key: 'settings', label: 'Settings' },
    { key: 'locations', label: 'Locations' },
  ];
  for (const resource of resources) {
    await prisma.resource.upsert({
      where: { key: resource.key },
      update: { label: resource.label },
      create: resource,
    });
  }
}

async function main() {
  await seedLocations();
  await seedRolesAndPermissions();

  console.log('Seeding AMCOS reference records...');
  await prisma.mamcos.createMany({
    data: [
      { name: 'Madibira AMCOS', location: 'Madibira', district: 'Mbarali', isActive: true },
      { name: 'Mbuyuni AMCOS', location: 'Mbuyuni', district: 'Mbarali', isActive: true },
      { name: 'Ubaruku AMCOS', location: 'Ubaruku', district: 'Mbarali', isActive: true },
    ],
    skipDuplicates: true,
  });

  console.log('Seeding membership plans...');
  await prisma.membershipPlan.upsert({
    where: { name: 'Season Premium' },
    update: {},
    create: {
      name: 'Season Premium',
      description:
        'Full farm analytics, yield forecasts, detailed alert recommendations and premium reports for one farming season.',
      priceTzs: 15000,
      durationType: 'SEASON',
      features: [
        'Full farm productivity analytics',
        'Financial summary and profitability',
        'Detailed alert explanations and recommended actions',
        'Yield and risk insights',
        'Premium support programmes',
      ],
      isActive: true,
    },
  });

  console.log('Seeding current farming season...');
  await prisma.farmingSeason.upsert({
    where: { name: '2026/2027 Masika' },
    update: {},
    create: {
      name: '2026/2027 Masika',
      region: 'Mbeya',
      crop: 'Rice',
      startDate: new Date('2026-11-01'),
      endDate: new Date('2027-06-30'),
      registrationOpenDate: new Date('2026-07-01'),
      registrationCloseDate: new Date('2026-10-31'),
      verificationDeadline: new Date('2026-10-15'),
      status: 'REGISTRATION_OPEN',
    },
  });

  // Note: the census snapshot goes down to Ward level (ADM3). Villages (ADM4)
  // can be added dynamically via the application or a separate dataset.
  console.log('Seeding completed successfully! (Regions, Districts, Wards, AMCOS, plans, season)');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
