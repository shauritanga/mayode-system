import { db, COLLECTIONS, uid, nowIso, Row } from './store';

/** Shape a resolved value like an axios response so screens need no changes. */
const ok = <T>(data: T) => Promise.resolve({ data });

/** Shape a rejection like an axios error so `err.response.data.message` works. */
const fail = (message: string, status = 400) =>
  Promise.reject({ response: { status, data: { message } } });

/** Record an entry in the farmer's activity feed (home-screen "Recent Activities"). */
async function logActivity(
  farmerId: string | null | undefined,
  type: string,
  title: string,
  subtitle: string,
  icon: string,
) {
  if (!farmerId) return;
  await db.insert(COLLECTIONS.activities, { farmerId, type, title, subtitle, icon, createdAt: nowIso() });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function nextControlNumber(): Promise<string> {
  const farmers = await db.all(COLLECTIONS.farmers);
  const nums = farmers
    .map((f) => parseInt(String(f.controlNumber || '').replace('MYD-', ''), 10))
    .filter((n) => !isNaN(n));
  const next = (nums.length ? Math.max(...nums) : 0) + 1;
  return `MYD-${next.toString().padStart(5, '0')}`;
}

async function generateFarmCode(farmerId: string): Promise<string> {
  const farmer = await db.findById(COLLECTIONS.farmers, farmerId);
  const controlNumber = (farmer?.controlNumber as string) || 'MYD-00000';
  const count = (await db.where(COLLECTIONS.farms, (f) => f.farmerId === farmerId)).length;
  return `${controlNumber}-${(count + 1).toString().padStart(2, '0')}`;
}

async function generatePlotCode(farmId: string): Promise<string> {
  const farm = await db.findById(COLLECTIONS.farms, farmId);
  const count = (await db.where(COLLECTIONS.plots, (p) => p.farmId === farmId)).length;
  return `${farm?.farmCode || 'FARM'}-P${count + 1}`;
}

async function farmerPublic(farmerId: string) {
  const f = await db.findById(COLLECTIONS.farmers, farmerId);
  return f ? { firstName: f.firstName, lastName: f.lastName, controlNumber: f.controlNumber } : undefined;
}

async function withFarmRelations(farm: Row) {
  const plots = await db.where(COLLECTIONS.plots, (p) => p.farmId === farm.id);
  const cycles = await db.where(COLLECTIONS.cropCycles, (c) => c.farmId === farm.id);
  const mamcos = farm.mamcosId ? await db.findById(COLLECTIONS.mamcos, farm.mamcosId) : undefined;
  return {
    ...farm,
    farmer: await farmerPublic(farm.farmerId),
    mamcos: mamcos ? { name: mamcos.name } : undefined,
    plots: await Promise.all(
      plots.map(async (p) => ({
        ...p,
        _count: { cropCycles: (await db.where(COLLECTIONS.cropCycles, (c) => c.plotId === p.id)).length },
      })),
    ),
    _count: { plots: plots.length, cropCycles: cycles.length },
  };
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export const authApi = {
  async login(phone: string, password: string) {
    const user = await db.find(COLLECTIONS.users, (u) => u.phone === phone && u.password === password);
    if (!user) return fail('Invalid phone number or password', 401);
    return ok({
      accessToken: `local-${uid()}`,
      refreshToken: `local-${uid()}`,
      user: {
        id: user.id,
        phone: user.phone,
        email: user.email ?? undefined,
        role: user.role,
        controlNumber: user.controlNumber,
        firstName: user.firstName,
        lastName: user.lastName,
      },
    });
  },

  async register(data: { phone: string; password: string; firstName: string; lastName: string; role: string }) {
    const existing = await db.find(COLLECTIONS.users, (u) => u.phone === data.phone);
    if (existing) return fail('A user with this phone number already exists', 409);
    const controlNumber = await nextControlNumber();
    const userId = uid();
    await db.insert(COLLECTIONS.users, {
      id: userId, phone: data.phone, password: data.password, role: data.role || 'FARMER',
      controlNumber, firstName: data.firstName, lastName: data.lastName, email: null, createdAt: nowIso(),
    });
    await db.insert(COLLECTIONS.farmers, {
      userId, controlNumber, firstName: data.firstName, lastName: data.lastName,
      verificationStatus: 'PENDING', creditScore: 0, isBlacklisted: false,
      district: 'Mbarali', region: 'Mbeya', createdAt: nowIso(),
    });
    return ok({
      accessToken: `local-${uid()}`,
      user: { id: userId, phone: data.phone, role: data.role || 'FARMER', controlNumber, firstName: data.firstName, lastName: data.lastName },
    });
  },

  async logout() {
    return ok({ success: true });
  },
  async createFieldOfficer(data: any) {
    const userId = uid();
    await db.insert(COLLECTIONS.users, {
      id: userId, phone: data.phone, password: data.password, role: 'FIELD_OFFICER',
      firstName: data.firstName, lastName: data.lastName, email: null, createdAt: nowIso(),
    });
    return ok({ id: userId, phone: data.phone, firstName: data.firstName, lastName: data.lastName, role: 'FIELD_OFFICER', createdAt: nowIso() });
  },
};

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

export const usersApi = {
  async getMe(id: string) {
    const u = await db.findById(COLLECTIONS.users, id);
    if (!u) return fail('User not found', 404);
    return ok(u);
  },
  async updatePushToken(_token: string) {
    return ok({ success: true });
  },
};

// ---------------------------------------------------------------------------
// Farmers
// ---------------------------------------------------------------------------

export const farmersApi = {
  async getAll() {
    return ok({ data: await db.all(COLLECTIONS.farmers), pagination: { total: await db.count(COLLECTIONS.farmers), page: 1, pageSize: 100 } });
  },
  async getByControlNumber(cn: string) {
    const f = await db.find(COLLECTIONS.farmers, (x) => x.controlNumber === cn);
    if (!f) return fail(`Farmer ${cn} not found`, 404);
    return ok(f);
  },
  async getOne(id: string) {
    const f = await db.findById(COLLECTIONS.farmers, id);
    if (!f) return fail('Farmer not found', 404);
    const farms = await db.where(COLLECTIONS.farms, (x) => x.farmerId === id);
    const documents = await db.where(COLLECTIONS.documents, (d) => d.farmerId === id);
    return ok({ ...f, farms, documents });
  },
  async create(data: any) {
    const controlNumber = await nextControlNumber();
    const userId = uid();
    await db.insert(COLLECTIONS.users, {
      id: userId, phone: data.phone, password: data.password || 'changeme', role: 'FARMER',
      controlNumber, firstName: data.firstName, lastName: data.lastName, email: data.email ?? null, createdAt: nowIso(),
    });
    const farmer = await db.insert(COLLECTIONS.farmers, {
      userId, controlNumber, verificationStatus: 'PENDING', creditScore: 0, isBlacklisted: false, createdAt: nowIso(), ...data,
    });
    return ok(farmer);
  },
  async update(id: string, data: any) {
    const updated = await db.update(COLLECTIONS.farmers, id, data);
    if (!updated) return fail('Farmer not found', 404);
    return ok(updated);
  },
  async upsertHousehold(id: string, data: any) {
    const updated = await db.update(COLLECTIONS.farmers, id, { household: data });
    return ok(updated);
  },
  async addDocument(id: string, data: any) {
    const doc = await db.insert(COLLECTIONS.documents, { farmerId: id, ...data, createdAt: nowIso() });
    await logActivity(id, 'document.added', `Uploaded ${(data.type || 'document').replace('_', ' ')}`, data.fileName || 'File attached', '📄');
    return ok(doc);
  },
  async listDocuments(id: string) {
    return ok(await db.where(COLLECTIONS.documents, (d) => d.farmerId === id));
  },
  async removeDocument(documentId: string) {
    await db.remove(COLLECTIONS.documents, documentId);
    return ok({ success: true });
  },
  async submitIdentity(id: string, data: any) {
    await db.insert(COLLECTIONS.documents, { farmerId: id, type: data.idType, fileUrl: data.idDocumentUrl, fileName: `${data.idType}-${data.idNumber}`, createdAt: nowIso() });
    await db.insert(COLLECTIONS.documents, { farmerId: id, type: 'FACE_CAPTURE', fileUrl: data.faceCaptureUrl, fileName: 'face-capture', createdAt: nowIso() });
    const updated = await db.update(COLLECTIONS.farmers, id, { nationalId: data.idNumber, photoUrl: data.profilePhotoUrl ?? data.faceCaptureUrl, verificationStatus: 'PENDING' });
    return ok(updated ?? { verificationStatus: 'PENDING' });
  },
  async verify(id: string, _data: any) {
    const updated = await db.update(COLLECTIONS.farmers, id, { verificationStatus: 'VERIFIED' });
    return ok(updated ?? { verificationStatus: 'VERIFIED' });
  },
  async reject(id: string, data: { rejectionReason: string; notes?: string }) {
    const updated = await db.update(COLLECTIONS.farmers, id, { verificationStatus: 'REJECTED', ...data });
    return ok(updated ?? { verificationStatus: 'REJECTED' });
  },
  async suspend(id: string, data: { reason: string }) {
    const updated = await db.update(COLLECTIONS.farmers, id, { verificationStatus: 'SUSPENDED', ...data });
    return ok(updated ?? { verificationStatus: 'SUSPENDED' });
  },
  async productionSummary(farmerId: string) {
    return ok({
      farmerId, controlNumber: '', totalCropCycles: 0, harvestedCycles: 0,
      totalActualYieldKg: 0, totalEstimatedYieldKg: 0, avgYieldKgPerCycle: 0, yieldAccuracy: null, cycles: [],
    });
  },
  async financialSummary(farmerId: string) {
    return ok({
      locked: true, code: 'MEMBERSHIP_REQUIRED', farmerId,
      message: 'Activate your MAYOData membership to view the full financial analysis.',
    });
  },
  async creditReadiness(farmerId: string) {
    return ok({
      farmerId, controlNumber: '', creditScore: 0, creditReady: false, isBlacklisted: false, blacklistReason: null,
      factors: {
        verification: { score: 0, max: 25 }, production: { score: 0, max: 20 }, profitability: { score: 0, max: 20 },
        loanRepayment: { score: 0, max: 20 }, cooperativeMembership: { score: 0, max: 10 }, experience: { score: 0, max: 5 },
      },
    });
  },
};

// ---------------------------------------------------------------------------
// AMCOS cooperatives (stored under the existing mamcos collection name)
// ---------------------------------------------------------------------------

export const mamcosApi = {
  async getAll() {
    return ok(await db.all(COLLECTIONS.mamcos));
  },
  async getOne(id: string) {
    const m = await db.findById(COLLECTIONS.mamcos, id);
    if (!m) return fail('AMCOS not found', 404);
    return ok(m);
  },
};

// ---------------------------------------------------------------------------
// Farms
// ---------------------------------------------------------------------------

export const farmsApi = {
  async getAll(params?: any) {
    let farms = await db.all(COLLECTIONS.farms);
    if (params?.farmerId) farms = farms.filter((f) => f.farmerId === params.farmerId);
    if (params?.grade) farms = farms.filter((f) => f.grade === params.grade);
    if (params?.mamcosId) farms = farms.filter((f) => f.mamcosId === params.mamcosId);
    const withRel = await Promise.all(farms.map((f) => withFarmRelations(f)));
    return ok(withRel);
  },
  async getOne(id: string) {
    const farm = await db.findById(COLLECTIONS.farms, id);
    if (!farm) return fail('Farm not found', 404);
    return ok(await withFarmRelations(farm));
  },
  async getByFarmerId(farmerId: string) {
    const farms = await db.where(COLLECTIONS.farms, (f) => f.farmerId === farmerId);
    return ok(await Promise.all(farms.map((f) => withFarmRelations(f))));
  },
  async create(data: any) {
    const farmer = await db.findById(COLLECTIONS.farmers, data.farmerId);
    if (!farmer) return fail('Farmer not found', 404);
    if (!data.name?.trim()) return fail('Farm name is required', 400);
    if ((data.ownershipType === 'RENTED' || data.ownershipType === 'LEASED') && (!data.ownerName?.trim() || !data.ownerPhone?.trim())) {
      return fail('Owner name and phone are required for rented farms', 400);
    }
    const farmCode = await generateFarmCode(data.farmerId);
    const farm = await db.insert(COLLECTIONS.farms, {
      farmCode,
      farmerId: data.farmerId,
      mamcosId: data.mamcosId || farmer.mamcosId || null,
      name: data.name ?? null,
      plotNumber: data.plotNumber ?? null,
      blockNumber: data.blockNumber ?? null,
      section: data.section ?? null,
      village: data.village ?? null,
      ward: data.ward ?? null,
      district: data.district ?? null,
      region: data.region ?? null,
      socialHectares: data.socialHectares,
      actualAcres: data.actualAcres ?? null,
      grade: data.grade || 'C',
      vichuguuCount: data.vichuguuCount || 0,
      hasIrrigation: !!data.irrigationStatus,
      nearRoad: !!data.nearRoadStatus,
      soilCondition: data.soilCondition ?? null,
      ownershipType: data.ownershipType ?? null,
      ownerName: data.ownerName ?? null,
      ownerPhone: data.ownerPhone ?? null,
      previousCrops: data.previousCrops || [],
      isVerified: false,
      photoUrls: [],
      centerLatitude: null,
      centerLongitude: null,
      createdAt: nowIso(),
    });
    await logActivity(data.farmerId, 'farm.created', `Registered farm ${farm.farmCode}`, farm.name || farm.village || 'New farm', '🌾');
    return ok(farm);
  },
  async update(id: string, data: any) {
    const updated = await db.update(COLLECTIONS.farms, id, data);
    if (!updated) return fail('Farm not found', 404);
    return ok(updated);
  },
  async updateBoundary(id: string, data: { boundaryCoordinates: object; centerLat: number; centerLng: number }) {
    const updated = await db.update(COLLECTIONS.farms, id, {
      boundaryCoordinates: data.boundaryCoordinates,
      centerLatitude: data.centerLat,
      centerLongitude: data.centerLng,
    });
    if (!updated) return fail('Farm not found', 404);
    await logActivity(updated.farmerId, 'farm.mapped', `Mapped ${updated.farmCode} boundary`, 'GPS boundary saved', '📍');
    return ok(updated);
  },
  async productivity(id: string) {
    const farm = await db.findById(COLLECTIONS.farms, id);
    if (!farm) return fail('Farm not found', 404);
    const plots = await db.where(COLLECTIONS.plots, (p) => p.farmId === id);
    const cycles = await db.where(COLLECTIONS.cropCycles, (c) => c.farmId === id);
    const acres = farm.actualAcres ?? (farm.socialHectares ? farm.socialHectares * 2.47105 : 0);
    const totalYieldKg = cycles.reduce((s, c) => s + (c.actualYieldKg || 0), 0);
    const totalCosts = 0;
    const totalRevenues = 0;
    return ok({
      farmId: id, farmCode: farm.farmCode, acres: Number(acres.toFixed(2)),
      plots: plots.length, cropCycles: cycles.length, totalYieldKg, totalCosts, totalRevenues,
      netProfit: totalRevenues - totalCosts,
      yieldPerAcre: acres > 0 ? Number((totalYieldKg / acres).toFixed(1)) : null,
      costPerAcre: acres > 0 ? 0 : null,
      costPerKg: totalYieldKg > 0 ? 0 : null,
    });
  },
  async listDocuments(id: string) {
    return ok(await db.where(COLLECTIONS.documents, (d) => d.farmId === id));
  },
  async addDocument(id: string, data: any) {
    return ok(await db.insert(COLLECTIONS.documents, { farmId: id, ...data, createdAt: nowIso() }));
  },
  async listPhotos(id: string) {
    return ok(await db.where(COLLECTIONS.documents, (d) => d.farmId === id && d.__photo === true));
  },
  async addPhoto(id: string, data: any) {
    return ok(await db.insert(COLLECTIONS.documents, { farmId: id, __photo: true, ...data, createdAt: nowIso() }));
  },
  async deletePhoto(photoId: string) {
    await db.remove(COLLECTIONS.documents, photoId);
    return ok({ success: true });
  },
  async report(id: string) {
    const farm = await db.findById(COLLECTIONS.farms, id);
    if (!farm) return fail('Farm not found', 404);
    const photos = await db.where(COLLECTIONS.documents, (d) => d.farmId === id && d.__photo === true);
    return ok({
      locked: true, code: 'MEMBERSHIP_REQUIRED', farmId: id, farmCode: farm.farmCode, name: farm.name,
      location: [farm.village, farm.ward, farm.district, farm.region].filter(Boolean).join(', '),
      sizeHectares: farm.socialHectares, sizeAcres: Number((farm.socialHectares * 2.47105).toFixed(2)),
      grade: farm.grade, mapped: !!farm.centerLatitude, photoCount: photos.length,
      message: 'Activate your MAYOData membership to unlock the full farm analytics report.',
    });
  },
  async reviewBoundary(id: string) {
    const farm = await db.update(COLLECTIONS.farms, id, { isVerified: true });
    if (!farm) return fail('Farm not found', 404);
    return ok(farm);
  },
};

// ---------------------------------------------------------------------------
// Plots
// ---------------------------------------------------------------------------

export const plotsApi = {
  async getByFarmId(farmId: string) {
    const plots = await db.where(COLLECTIONS.plots, (p) => p.farmId === farmId);
    return ok(plots);
  },
  async getOne(id: string) {
    const p = await db.findById(COLLECTIONS.plots, id);
    if (!p) return fail('Plot not found', 404);
    return ok(p);
  },
  async create(data: any) {
    const farm = await db.findById(COLLECTIONS.farms, data.farmId);
    if (!farm) return fail('Farm not found', 404);
    const plotCode = await generatePlotCode(data.farmId);
    const plot = await db.insert(COLLECTIONS.plots, {
      plotCode,
      farmId: data.farmId,
      name: data.name ?? null,
      sizeAcres: data.sizeAcres ?? null,
      soilCondition: data.soilCondition ?? null,
      irrigationStatus: data.irrigationStatus ?? null,
      createdAt: nowIso(),
    });
    await logActivity(farm.farmerId, 'plot.created', `Added plot ${plot.plotCode}`, `on ${farm.farmCode}`, '🧩');
    return ok(plot);
  },
  async update(id: string, data: any) {
    const updated = await db.update(COLLECTIONS.plots, id, data);
    if (!updated) return fail('Plot not found', 404);
    return ok(updated);
  },
  async updateBoundary(id: string, data: { boundaryCoordinates: object; centerLat: number; centerLng: number }) {
    const updated = await db.update(COLLECTIONS.plots, id, {
      boundaryCoordinates: data.boundaryCoordinates,
      centerLatitude: data.centerLat,
      centerLongitude: data.centerLng,
    });
    if (!updated) return fail('Plot not found', 404);
    const farm = await db.findById(COLLECTIONS.farms, updated.farmId);
    await logActivity(farm?.farmerId, 'plot.mapped', `Mapped plot ${updated.plotCode}`, 'GPS boundary saved', '📍');
    return ok(updated);
  },
  async remove(id: string) {
    await db.remove(COLLECTIONS.plots, id);
    return ok({ success: true });
  },
};

// ---------------------------------------------------------------------------
// Crop cycles
// ---------------------------------------------------------------------------

const ACTIVITY_TYPE_ICONS: Record<string, string> = {
  LAND_PREPARATION: '🚜', PLANTING: '🌱', FERTILIZING: '🧪', WEEDING: '🌿',
  PEST_CONTROL: '🐛', IRRIGATION: '💧', HARVESTING: '🌾', DRYING: '☀️',
  STORAGE: '📦', TRANSPORT: '🚚',
};
const COST_CATEGORY_ICONS: Record<string, string> = {
  SEEDS: '🌱', FERTILIZER: '🧪', PESTICIDE: '🐛', HERBICIDE: '🌿', LABOR: '👷',
  TILLAGE: '🚜', IRRIGATION: '💧', TRANSPORT: '🚚', MISCELLANEOUS: '💵',
};

export const cropCyclesApi = {
  async getAll() {
    return ok(await db.all(COLLECTIONS.cropCycles));
  },
  async getOne(id: string) {
    const cropCycle = await db.findById(COLLECTIONS.cropCycles, id);
    if (!cropCycle) return fail('Crop cycle not found', 404);
    const [activities, costs, revenues] = await Promise.all([
      db.where(COLLECTIONS.activityLogs, (a) => a.cropCycleId === id),
      db.where(COLLECTIONS.inputCosts, (c) => c.cropCycleId === id),
      db.where(COLLECTIONS.revenues, (r) => r.cropCycleId === id),
    ]);
    activities.sort((a, b) => (a.activityDate < b.activityDate ? 1 : -1));
    costs.sort((a, b) => (a.dateIncurred < b.dateIncurred ? 1 : -1));
    revenues.sort((a, b) => (a.saleDate < b.saleDate ? 1 : -1));
    return ok({ ...cropCycle, activities, costs, revenues });
  },
  async getByFarmId(farmId: string) {
    const cycles = await db.where(COLLECTIONS.cropCycles, (c) => c.farmId === farmId);
    cycles.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    return ok(cycles);
  },
  async create(data: any) {
    const farm = await db.findById(COLLECTIONS.farms, data.farmId);
    const cropCycle = await db.insert(COLLECTIONS.cropCycles, {
      ...data,
      farmerId: farm?.farmerId,
      status: 'PLANNED',
      createdAt: nowIso(),
    });
    await logActivity(
      farm?.farmerId,
      'crop_cycle.started',
      `Started crop cycle: ${data.season}`,
      `${farm?.farmCode ?? ''}${data.riceVariety ? ` · ${data.riceVariety}` : ''}`,
      '🌾',
    );
    return ok(cropCycle);
  },
  async update(id: string, data: any) {
    const existing = await db.findById(COLLECTIONS.cropCycles, id);
    const cropCycle = await db.update(COLLECTIONS.cropCycles, id, data);
    if (data.status && existing && data.status !== existing.status) {
      const farm = await db.findById(COLLECTIONS.farms, existing.farmId);
      await logActivity(
        existing.farmerId,
        'crop_cycle.status',
        `${existing.season} is now ${String(data.status).toLowerCase()}`,
        farm?.farmCode,
        data.status === 'HARVESTED' ? '🌾' : '🔄',
      );
    }
    return ok(cropCycle);
  },
  async logActivity(data: any) {
    const cropCycle = await db.findById(COLLECTIONS.cropCycles, data.cropCycleId);
    const activity = await db.insert(COLLECTIONS.activityLogs, { ...data, createdAt: nowIso() });
    if (cropCycle) {
      const farm = await db.findById(COLLECTIONS.farms, cropCycle.farmId);
      const label = String(data.activityType).replace(/_/g, ' ').toLowerCase();
      await logActivity(
        cropCycle.farmerId,
        'crop_cycle.activity',
        `Logged ${label}`,
        `${farm?.farmCode ?? ''} · ${cropCycle.season}`,
        ACTIVITY_TYPE_ICONS[data.activityType] ?? '📝',
      );
    }
    return ok(activity);
  },
  async calendar(_params?: any) { return ok([]); },
};

// ---------------------------------------------------------------------------
// Finance (expenses & revenue per crop cycle)
// ---------------------------------------------------------------------------

export const financeApi = {
  async addCost(data: any) {
    const cropCycle = await db.findById(COLLECTIONS.cropCycles, data.cropCycleId);
    const cost = await db.insert(COLLECTIONS.inputCosts, { ...data, createdAt: nowIso() });
    if (cropCycle) {
      const farm = await db.findById(COLLECTIONS.farms, cropCycle.farmId);
      await logActivity(
        cropCycle.farmerId,
        'expense.added',
        `Recorded expense: ${data.itemName}`,
        `TZS ${Number(data.totalCost).toLocaleString()} · ${farm?.farmCode ?? ''}`,
        COST_CATEGORY_ICONS[data.category] ?? '💵',
      );
    }
    return ok(cost);
  },
  async addRevenue(data: any) {
    const cropCycle = await db.findById(COLLECTIONS.cropCycles, data.cropCycleId);
    const revenue = await db.insert(COLLECTIONS.revenues, { ...data, createdAt: nowIso() });
    if (cropCycle) {
      const farm = await db.findById(COLLECTIONS.farms, cropCycle.farmId);
      await logActivity(
        cropCycle.farmerId,
        'revenue.added',
        `Sale recorded: ${data.quantityKg}kg`,
        `TZS ${Number(data.totalRevenue).toLocaleString()} · ${farm?.farmCode ?? ''}`,
        '💰',
      );
    }
    return ok(revenue);
  },
  async getCropCycleSummary(cropCycleId: string) {
    const costs = await db.where(COLLECTIONS.inputCosts, (c) => c.cropCycleId === cropCycleId);
    const revenues = await db.where(COLLECTIONS.revenues, (r) => r.cropCycleId === cropCycleId);
    const totalCosts = costs.reduce((sum, c) => sum + Number(c.totalCost || 0), 0);
    const totalRevenues = revenues.reduce((sum, r) => sum + Number(r.totalRevenue || 0), 0);
    const totalFairtradePremium = revenues.reduce((sum, r) => sum + Number(r.fairtradePremium || 0), 0);
    return ok({
      cropCycleId,
      financials: {
        totalCosts,
        totalRevenues,
        totalFairtradePremium,
        netProfit: totalRevenues + totalFairtradePremium - totalCosts,
        isProfitable: totalRevenues + totalFairtradePremium - totalCosts > 0,
      },
      costsDetail: costs,
      revenuesDetail: revenues,
    });
  },
};

// ---------------------------------------------------------------------------
// Activity feed (home-screen "Recent Activities")
// ---------------------------------------------------------------------------

export const activitiesApi = {
  async listForFarmer(farmerId: string) {
    const all = await db.where(COLLECTIONS.activities, (a) => a.farmerId === farmerId);
    all.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)); // newest first
    return ok(all);
  },
  async recentForFarmer(farmerId: string, limit = 5) {
    const all = await db.where(COLLECTIONS.activities, (a) => a.farmerId === farmerId);
    all.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    return ok(all.slice(0, limit));
  },
};

// ---------------------------------------------------------------------------
// Locations (minimal — free-text entry is used in the UI for now)
// ---------------------------------------------------------------------------

export const locationsApi = {
  async getRegions() { return ok([]); },
  async getDistricts(_regionId: string) { return ok([]); },
  async getWards(_districtId: string) { return ok([]); },
};

// ---------------------------------------------------------------------------
// Uploads (store the local file URI directly)
// ---------------------------------------------------------------------------

export const uploadsApi = {
  async uploadFile(file: { uri: string; name: string; type: string }) {
    return ok({ url: file.uri, fileName: file.name, mimeType: file.type });
  },
};

// ---------------------------------------------------------------------------
// Notifications (local, empty for now)
// ---------------------------------------------------------------------------

export const notificationsApi = {
  async list() { return ok([]); },
  async unreadCount() { return ok({ count: 0 }); },
  async markRead(_id: string) { return ok({ success: true }); },
  async markAllRead() { return ok({ success: true }); },
};

// ---------------------------------------------------------------------------
// Marketplace
// ---------------------------------------------------------------------------

export const marketplaceApi = {
  async getLandListings() {
    const listings = await db.all(COLLECTIONS.landListings);
    const withFarm = await Promise.all(
      listings.map(async (l) => ({ ...l, farm: l.farmId ? await db.findById(COLLECTIONS.farms, l.farmId) : undefined })),
    );
    return ok(withFarm);
  },
  async getTractors() {
    return ok(await db.all(COLLECTIONS.tractors));
  },
  async getMarketPrices() {
    return ok(await db.all(COLLECTIONS.marketPrices));
  },
  async bookTractor(data: any) {
    return ok({ id: uid(), status: 'PENDING', ...data, createdAt: nowIso() });
  },
};

// ---------------------------------------------------------------------------
// Memberships / seasons / leases (demo-mode stubs — real flows need the backend)
// ---------------------------------------------------------------------------

export const membershipsApi = {
  async plans() {
    return ok([
      {
        id: 'local-plan-season',
        name: 'Season Premium',
        description: 'Full farm analytics, recommendations and premium reports for one farming season.',
        priceTzs: 15000,
        durationType: 'SEASON',
        features: [
          'Full farm productivity analytics',
          'Financial summary and profitability',
          'Detailed alert explanations and recommended actions',
        ],
      },
    ]);
  },
  async me() { return ok({ active: false, membership: null }); },
  async start(_data: { planId: string; farmingSeasonId?: string; phoneNumber?: string }) {
    return ok({ paymentProvider: 'manual', membership: { id: uid(), status: 'PAYMENT_PENDING', createdAt: nowIso() } });
  },
  async reconcile() { return ok({ active: false, status: 'PAYMENT_PENDING' }); },
};

export const seasonsApi = {
  async list() { return ok([]); },
  async current() { return ok(null); },
};

export const leasesApi = {
  async create(data: any) { return ok({ id: uid(), status: 'PENDING_VERIFICATION', ...data, createdAt: nowIso() }); },
  async mine() { return ok([]); },
  async forFarm(_farmId: string) { return ok([]); },
  async renterConfirm(_id: string) { return ok({ success: true }); },
  async renterReject(_id: string) { return ok({ success: true }); },
  async all(_status?: string) { return ok([]); },
  async officerVerify(_id: string, _data: any) { return ok({ success: true }); },
};

export const correctionsApi = {
  async submit(_farmId: string, data: any) { return ok({ id: uid(), reviewStatus: 'PENDING', ...data, createdAt: nowIso() }); },
  async listForFarm(_farmId: string) { return ok([]); },
};

export const fieldSurveysApi = {
  async create(_farmId: string, data: any) { return ok({ id: uid(), ...data, surveyDate: nowIso() }); },
  async listForFarm(_farmId: string) { return ok([]); },
};

export const assignmentsApi = {
  async selfOperate(data: any) { return ok({ id: uid(), assignmentType: 'OWNER_OPERATED', status: 'VERIFIED', ...data }); },
  async mine() { return ok([]); },
  async forFarm(_farmId: string) { return ok([]); },
};

export const ownershipApi = {
  async confirm(_farmId: string, _notes?: string) { return ok({ confirmationStatus: 'VERIFIED', confirmedAt: nowIso() }); },
  async forFarm(_farmId: string) { return ok([]); },
};

export const alertsApi = {
  async list() { return ok([]); },
  async getOne(id: string) { return ok({ id, locked: true, category: 'OTHER', urgency: 'MEDIUM', title: '', previewMessage: '', status: 'OPEN' }); },
  async complete(_id: string) { return ok({ status: 'COMPLETED' }); },
};

export const rewardsApi = {
  async mine() { return ok([]); },
  async confirmReceipt(_winnerId: string) { return ok({ status: 'CONFIRMED' }); },
};

export const registryApi = {
  async mine() { return ok([]); },
  async claim(_id: string) { return ok({ record: { status: 'CLAIMED' } }); },
  async reject(_id: string) { return ok({ status: 'DISPUTED' }); },
};

/** Local-mode approximation of the server workspace context. */
export const workspaceApi = {
  async context() {
    return {
      data: {
        workspace: 'RENTER',
        role: 'FARMER',
        navigation: ['home', 'my-farm', 'activities', 'alerts', 'profile'],
        activeAssignments: [],
        pendingAssignments: [],
        metrics: { activeFarmCount: 0, pendingVerificationCount: 0, unreadAlerts: 0 },
      },
    };
  },
};

export const officerVisitsApi = {
  async create(data: any) { return ok({ id: uid(), photoUrls: [], ...data, visitedAt: nowIso(), createdAt: nowIso() }); },
  async mine(_params?: any) { return ok({ total: 0, page: 1, pageSize: 20, data: [] }); },
  async forFarmer(_farmerId: string) { return ok([]); },
  async calendar(_params?: any) { return ok([]); },
};

/** No-op locally; token is only meaningful for the remote backend. */
export const setApiToken = (_token: string | null) => {};
