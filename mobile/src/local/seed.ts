import AsyncStorage from '@react-native-async-storage/async-storage';
import { db, COLLECTIONS, uid, nowIso } from './store';
import { locationCounts } from './locations';

const SEED_FLAG = 'mayode.local.seeded.v1';

/**
 * Seed the local database once. Provides a ready-to-use farmer login plus a
 * sample farm/plots and marketplace reference data so every screen has content.
 */
export async function seedIfNeeded(): Promise<void> {
  const done = await AsyncStorage.getItem(SEED_FLAG);
  if (done) return;

  // Tanzania administrative locations are bundled with the app and available
  // offline from first launch (region → district → ward).
  const loc = locationCounts();
  console.log(`[Local seed] Locations ready: ${loc.regions} regions, ${loc.districts} districts, ${loc.wards} wards`);

  // ---- Cooperatives (AMCOS) ----
  const mamcos = [
    { id: uid(), name: 'Madibira AMCOS', location: 'Madibira', district: 'Mbarali', isActive: true },
    { id: uid(), name: 'Mbuyuni AMCOS', location: 'Mbuyuni', district: 'Mbarali', isActive: true },
    { id: uid(), name: 'Ubaruku AMCOS', location: 'Ubaruku', district: 'Mbarali', isActive: true },
  ];
  await db.replaceAll(COLLECTIONS.mamcos, mamcos);

  // ---- Default farmer account (login: +255700000010 / Farm123) ----
  const userId = uid();
  const farmerId = uid();
  const controlNumber = 'MYD-00001';
  await db.replaceAll(COLLECTIONS.users, [
    {
      id: userId,
      phone: '+255700000010',
      password: 'Farm123', // local-only, plaintext for offline testing
      email: null,
      role: 'FARMER',
      controlNumber,
      firstName: 'Frank',
      lastName: 'Farmer',
      createdAt: nowIso(),
    },
  ]);
  await db.replaceAll(COLLECTIONS.farmers, [
    {
      id: farmerId,
      userId,
      controlNumber,
      firstName: 'Frank',
      lastName: 'Farmer',
      gender: 'MALE',
      email: null,
      village: 'Madibira',
      ward: 'Rujewa',
      district: 'Mbarali',
      region: 'Mbeya',
      educationLevel: 'PRIMARY',
      farmingExperienceYears: 8,
      mamcosId: mamcos[0].id,
      verificationStatus: 'VERIFIED',
      creditScore: 0,
      isBlacklisted: false,
      createdAt: nowIso(),
    },
  ]);

  // ---- Sample farm + two plots for that farmer ----
  const farmId = uid();
  await db.replaceAll(COLLECTIONS.farms, [
    {
      id: farmId,
      farmCode: 'FP-FF-01',
      farmerId,
      mamcosId: mamcos[0].id,
      name: 'Plot No. 02, Block 5, South-West Section, Madibira AMCOS',
      plotNumber: '02',
      blockNumber: '5',
      section: 'South-West Section',
      village: 'Madibira',
      ward: 'Rujewa',
      district: 'Mbarali',
      region: 'Mbeya',
      socialHectares: 4,
      actualAcres: 9.5,
      grade: 'B',
      vichuguuCount: 1,
      hasIrrigation: true,
      nearRoad: true,
      soilCondition: 'Clay loam',
      ownershipType: 'OWNED',
      soilType: 'Clay loam',
      waterSource: 'Irrigation canal',
      previousCrops: ['Rice', 'Maize'],
      isVerified: true,
      photoUrls: [],
      centerLatitude: null,
      centerLongitude: null,
      createdAt: nowIso(),
    },
  ]);
  await db.replaceAll(COLLECTIONS.plots, [
    { id: uid(), plotCode: 'FP-FF-01-P1', farmId, name: 'North Paddy', sizeAcres: 5, irrigationStatus: 'canal', createdAt: nowIso() },
    { id: uid(), plotCode: 'FP-FF-01-P2', farmId, name: 'South Paddy', sizeAcres: 4.5, createdAt: nowIso() },
  ]);

  // ---- Marketplace reference data ----
  await db.replaceAll(COLLECTIONS.marketPrices, [
    { id: uid(), commodity: 'rice_sack_100kg', price: 185000, market: 'Mafinga', recordedAt: nowIso() },
    { id: uid(), commodity: 'rice_sack_100kg', price: 178000, market: 'Mbarali', recordedAt: nowIso() },
  ]);
  await db.replaceAll(COLLECTIONS.landListings, [
    { id: uid(), farmId, askingPrice: 450000, dealType: 'STANDARD', leaseStatus: 'DRAFT', leaseDurationMonths: 6, createdAt: nowIso() },
  ]);
  await db.replaceAll(COLLECTIONS.tractors, [
    { id: uid(), registrationNo: 'T-123-ABC', model: 'Massey Ferguson', horsePower: 75, isAvailable: true, pricePerHectare: 60000, location: 'Rujewa' },
  ]);

  await AsyncStorage.setItem(SEED_FLAG, '1');
}
