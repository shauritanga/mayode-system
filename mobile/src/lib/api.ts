import axios from 'axios';
import Constants from 'expo-constants';

/**
 * Base URL resolution order:
 *  1. EXPO_PUBLIC_API_URL env var (works with `expo start`)
 *  2. app.json > expo.extra.apiUrl
 *  3. Derive host from the Metro/dev-server URI (so a phone on the same
 *     Wi-Fi hits the developer's machine automatically) at :3001
 *  4. localhost fallback
 */
function resolveBaseUrl(): string {
  const envUrl = process.env.EXPO_PUBLIC_API_URL;
  if (envUrl) return envUrl;

  const extra = (Constants.expoConfig?.extra ?? {}) as { apiUrl?: string };
  if (extra.apiUrl) return extra.apiUrl;

  // hostUri looks like "192.168.1.194:8081" during development
  const hostUri = Constants.expoConfig?.hostUri || '';
  const host = hostUri.split(':')[0];
  if (host) return `http://${host}:3001/api/v1`;

  return 'http://localhost:3001/api/v1';
}

export const API_BASE_URL = resolveBaseUrl();

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 15000,
});

let inMemoryToken: string | null = null;

export const setApiToken = (token: string | null) => {
  inMemoryToken = token;
};

api.interceptors.request.use((config) => {
  if (inMemoryToken) {
    config.headers.Authorization = `Bearer ${inMemoryToken}`;
  }
  return config;
});

// ── Auth ──
export const authApi = {
  login: (phone: string, password: string) =>
    api.post('/auth/login', { phone, password }),
  register: (data: { phone: string; password: string; firstName: string; lastName: string; role: string }) =>
    api.post('/auth/register', data),
  logout: () => api.post('/auth/logout'),
};

// ── Users ──
export const usersApi = {
  getMe: (id: string) => api.get(`/users/${id}`),
  updatePushToken: (token: string) => api.put('/users/push-token', { token }),
};

// ── Farmers ──
export const farmersApi = {
  getAll: (params?: object) => api.get('/farmers', { params }),
  getOne: (id: string) => api.get(`/farmers/${id}`),
  getByControlNumber: (cn: string) => api.get(`/farmers/control-number/${cn}`),
  create: (data: object) => api.post('/farmers', data),
  update: (id: string, data: object) => api.patch(`/farmers/${id}`, data),
  overview: () => api.get('/farmers/overview'),
  verify: (id: string, data: object) => api.post(`/farmers/${id}/verify`, data),
  reject: (id: string, data: { rejectionReason: string; notes?: string }) =>
    api.post(`/farmers/${id}/reject`, data),
  suspend: (id: string, data: { reason: string }) => api.post(`/farmers/${id}/suspend`, data),
  upsertHousehold: (id: string, data: object) => api.put(`/farmers/${id}/household`, data),
  addDocument: (id: string, data: object) => api.post(`/farmers/${id}/documents`, data),
  listDocuments: (id: string) => api.get(`/farmers/${id}/documents`),
  removeDocument: (documentId: string) => api.delete(`/farmers/documents/${documentId}`),
  submitIdentity: (id: string, data: {
    idType: string; idNumber: string; idDocumentUrl: string; faceCaptureUrl: string; profilePhotoUrl?: string;
  }) => api.post(`/farmers/${id}/identity`, data),
  productionSummary: (id: string) => api.get(`/farmers/${id}/production-summary`),
  financialSummary: (id: string) => api.get(`/farmers/${id}/financial-summary`),
  creditReadiness: (id: string) => api.get(`/farmers/${id}/credit-readiness`),
};

// ── AMCOS cooperatives (API route remains /mamcos) ──
export const mamcosApi = {
  getAll: () => api.get('/mamcos'),
  getOne: (id: string) => api.get(`/mamcos/${id}`),
};

// ── Farms ──
export const farmsApi = {
  getAll: (params?: object) => api.get('/farms', { params }),
  getOne: (id: string) => api.get(`/farms/${id}`),
  getByFarmerId: (farmerId: string) => api.get(`/farms/farmer/${farmerId}`),
  create: (data: object) => api.post('/farms', data),
  update: (id: string, data: object) => api.patch(`/farms/${id}`, data),
  updateBoundary: (id: string, data: { boundaryCoordinates: object; centerLat: number; centerLng: number }) =>
    api.patch(`/farms/${id}/boundary`, data),
  overview: () => api.get('/farms/overview'),
  productivity: (id: string) => api.get(`/farms/${id}/productivity`),
  addDocument: (id: string, data: object) => api.post(`/farms/${id}/documents`, data),
  listDocuments: (id: string) => api.get(`/farms/${id}/documents`),
  // Photos & printable analytics report
  listPhotos: (id: string) => api.get(`/farms/${id}/photos`),
  addPhoto: (id: string, data: { url: string; caption?: string; latitude?: number; longitude?: number }) =>
    api.post(`/farms/${id}/photos`, data),
  deletePhoto: (photoId: string) => api.delete(`/farms/photos/${photoId}`),
  report: (id: string) => api.get(`/farms/${id}/report`),
};

// ── Plots ──
export const plotsApi = {
  getByFarmId: (farmId: string) => api.get(`/plots/farm/${farmId}`),
  getOne: (id: string) => api.get(`/plots/${id}`),
  create: (data: object) => api.post('/plots', data),
  update: (id: string, data: object) => api.patch(`/plots/${id}`, data),
  updateBoundary: (id: string, data: { boundaryCoordinates: object; centerLat: number; centerLng: number }) =>
    api.patch(`/plots/${id}/boundary`, data),
  remove: (id: string) => api.delete(`/plots/${id}`),
};

// ── Activity feed ──
export const activitiesApi = {
  listForFarmer: (farmerId: string) => api.get(`/activities/farmer/${farmerId}`),
  recentForFarmer: (farmerId: string, limit?: number) =>
    api.get(`/activities/farmer/${farmerId}`, { params: limit ? { limit } : undefined }),
};

// ── Crop Cycles (starting a season, farming activities) ──
export const cropCyclesApi = {
  getAll: (params?: object) => api.get('/crop-cycles', { params }),
  getOne: (id: string) => api.get(`/crop-cycles/${id}`),
  getByFarmId: (farmId: string) => api.get(`/crop-cycles/farm/${farmId}`),
  create: (data: {
    farmId: string;
    season: string;
    riceVariety?: string;
    plantingDate?: string;
    expectedHarvest?: string;
    estimatedYieldKg?: number;
  }) => api.post('/crop-cycles', data),
  update: (id: string, data: object) => api.patch(`/crop-cycles/${id}`, data),
  logActivity: (data: {
    cropCycleId: string;
    activityType: string;
    activityDate: string;
    description?: string;
    inputsUsed?: Record<string, unknown>;
    laborWorkers?: number;
    laborHours?: number;
    photoUrls?: string[];
    gpsLatitude?: number;
    gpsLongitude?: number;
  }) => api.post('/crop-cycles/activity', data),
};

// ── Finance (expenses & revenue per crop cycle) ──
export const financeApi = {
  addCost: (data: {
    cropCycleId: string;
    category: string;
    itemName: string;
    quantity?: number;
    unit?: string;
    unitPrice?: number;
    totalCost: number;
    supplier?: string;
    receiptUrl?: string;
    dateIncurred: string;
  }) => api.post('/finance/cost', data),
  addRevenue: (data: {
    cropCycleId: string;
    revenueType: string;
    quantityKg: number;
    pricePerKg: number;
    totalRevenue: number;
    fairtradePremium?: number;
    saleDate: string;
  }) => api.post('/finance/revenue', data),
  getCropCycleSummary: (cropCycleId: string) => api.get(`/finance/crop-cycle/${cropCycleId}/summary`),
};

// ── Locations ──
export const locationsApi = {
  getRegions: () => api.get('/locations/regions'),
  getDistricts: (regionId: string) => api.get(`/locations/regions/${regionId}/districts`),
  getWards: (districtId: string) => api.get(`/locations/districts/${districtId}/wards`),
};

// ── Uploads ──
export const uploadsApi = {
  /** Upload a local file (from image/document picker) as multipart. */
  uploadFile: (file: { uri: string; name: string; type: string }) => {
    const form = new FormData();
    // React Native FormData accepts { uri, name, type } for file parts.
    form.append('file', file as unknown as Blob);
    return api.post('/uploads', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
};

// ── Notifications ──
export const notificationsApi = {
  list: (unreadOnly = false) => api.get('/notifications', { params: { unreadOnly } }),
  unreadCount: () => api.get('/notifications/unread-count'),
  markRead: (id: string) => api.patch(`/notifications/${id}/read`),
  markAllRead: () => api.patch('/notifications/read-all'),
};

// ── Memberships (free registration, paid analytics) ──
export const membershipsApi = {
  plans: () => api.get('/memberships/plans'),
  me: () => api.get('/memberships/me'),
  start: (data: { planId: string; farmingSeasonId?: string; phoneNumber?: string }) =>
    api.post('/memberships/start', data),
  // Poll after a mobile-money push to see if the payment cleared.
  reconcile: () => api.post('/memberships/reconcile'),
};

// ── Farming seasons ──
export const seasonsApi = {
  list: () => api.get('/farming-seasons'),
  current: () => api.get('/farming-seasons/current'),
};

// ── Farm leases (owner adds lease, renter confirms) ──
export const leasesApi = {
  create: (data: {
    farmId: string;
    farmingSeasonId: string;
    renterPhone: string;
    renterName?: string;
    leaseStartDate: string;
    leaseEndDate: string;
    notes?: string;
    agreementDocumentUrl?: string;
  }) => api.post('/farm-leases', data),
  mine: () => api.get('/farm-leases/mine'),
  forFarm: (farmId: string) => api.get(`/farm-leases/farm/${farmId}`),
  renterConfirm: (id: string) => api.patch(`/farm-leases/${id}/renter-confirm`),
  renterReject: (id: string) => api.patch(`/farm-leases/${id}/renter-reject`),
};

// ── Suggested farm corrections ("Add More Details" / "Suggest Correction") ──
export const correctionsApi = {
  submit: (farmId: string, data: { fieldName: string; suggestedValue: string; evidenceUrls?: string[] }) =>
    api.post(`/farms/${farmId}/suggested-updates`, data),
  listForFarm: (farmId: string) => api.get(`/farms/${farmId}/suggested-updates`),
};

// ── Field surveys (MAYODE field data collection) ──
export const fieldSurveysApi = {
  create: (farmId: string, data: object) => api.post(`/farms/${farmId}/field-surveys`, data),
  listForFarm: (farmId: string) => api.get(`/farms/${farmId}/field-surveys`),
};

// ── Seasonal assignments (active farmer per farm & season) ──
export const assignmentsApi = {
  selfOperate: (data: { farmId: string; farmingSeasonId: string }) =>
    api.post('/seasonal-assignments/self-operate', data),
  mine: () => api.get('/seasonal-assignments/mine'),
  forFarm: (farmId: string) => api.get(`/seasonal-assignments/farm/${farmId}`),
};

// ── Farm ownership confirmation ──
export const ownershipApi = {
  confirm: (farmId: string, notes?: string) =>
    api.post(`/farm-ownerships/farm/${farmId}/confirm`, { notes }),
  forFarm: (farmId: string) => api.get(`/farm-ownerships/farm/${farmId}`),
};

// ── Farm-action alerts (free preview vs premium recommendation) ──
export const alertsApi = {
  list: () => api.get('/farm-alerts'),
  getOne: (id: string) => api.get(`/farm-alerts/${id}`),
  complete: (id: string) => api.patch(`/farm-alerts/${id}/complete`),
};

// ── Farmer rewards / incentives ──
export const rewardsApi = {
  mine: () => api.get('/rewards/mine'),
  confirmReceipt: (winnerId: string) => api.patch(`/rewards/winners/${winnerId}/confirm`),
};

// ── AMCOS-first farm registry (owner claim) ──
export const registryApi = {
  mine: () => api.get('/farm-registry/mine'),
  claim: (id: string) => api.post(`/farm-registry/${id}/claim`),
  reject: (id: string) => api.post(`/farm-registry/${id}/reject`),
};

// ── Marketplace ──
export const marketplaceApi = {
  getLandListings: (params?: object) => api.get('/marketplace/land', { params }),
  getTractors: (params?: object) => api.get('/marketplace/tractors', { params }),
  bookTractor: (data: object) => api.post('/marketplace/tractors/book', data),
  getMarketPrices: (params?: object) => api.get('/marketplace/prices', { params }),
};
