import axios from 'axios';
import Constants from 'expo-constants';
import { syncQueue } from '../services/sync-queue';
import { cachedRead, discardOfflineMutation, reconcileOfflineMutation, resolveReplayData, stageOfflineMutation } from '../services/offline-cache';

/**
 * Base URL resolution order:
 *  1. EXPO_PUBLIC_API_URL env var (works with `expo start`)
 *  2. app.json > expo.extra.apiUrl (production default)
 *  3. Derive host from the Metro/dev-server URI at :3001 (only when apiUrl unset)
 *  4. localhost fallback
 *
 * Production points at PRODUCTION_API_URL via expo.extra.apiUrl.
 * Local Nest: unset apiUrl or set EXPO_PUBLIC_API_URL=http://<lan-ip>:3001/api/v1
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

/** Origin that serves static `/uploads/...` files (API lives under `/api/v1`). */
export const MEDIA_BASE_URL = API_BASE_URL.replace(/\/api\/v1\/?$/, '');

/** Turn a relative upload path into an absolute URL the Image component can load. */
export function resolveMediaUrl(url?: string | null): string | null {
  if (!url) return null;
  if (/^(https?:|file:|content:|data:)/i.test(url)) return url;
  if (url.startsWith('/')) return `${MEDIA_BASE_URL}${url}`;
  return `${MEDIA_BASE_URL}/${url}`;
}

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 15000,
});

syncQueue.configure(async (mutation) => {
  if (mutation.method.toUpperCase() === 'PATCH') {
    // Server records expose updatedAt. If another device has a newer version,
    // discard this stale local write; otherwise the queued mutation wins.
    const current = await api.get(mutation.url);
    const serverUpdatedAt = current.data?.updatedAt;
    if (serverUpdatedAt && new Date(serverUpdatedAt).getTime() > new Date(mutation.createdAt).getTime()) {
      await discardOfflineMutation(mutation);
      return;
    }
  }
  const response = await api.request({ method: mutation.method, url: mutation.url, data: await resolveReplayData(mutation.data), params: mutation.params, headers: { 'X-MAYODE-SYNC-REPLAY': '1' } });
  await reconcileOfflineMutation(mutation, response.data);
});

let inMemoryToken: string | null = null;
let inMemoryRefreshToken: string | null = null;

export const setApiToken = (token: string | null) => {
  inMemoryToken = token;
};

export const setApiRefreshToken = (token: string | null) => {
  inMemoryRefreshToken = token;
};

/**
 * Wired up by the auth store so the 401 handler below can persist a
 * refreshed token pair and force a logout when the refresh token itself
 * is no longer valid, without api.ts importing the store directly
 * (which would create a circular import).
 */
let onTokensRefreshed: ((accessToken: string, refreshToken: string) => void) | null = null;
let onRefreshFailed: (() => void) | null = null;

export const registerAuthHandlers = (handlers: {
  onTokensRefreshed: (accessToken: string, refreshToken: string) => void;
  onRefreshFailed: () => void;
}) => {
  onTokensRefreshed = handlers.onTokensRefreshed;
  onRefreshFailed = handlers.onRefreshFailed;
};

api.interceptors.request.use((config) => {
  if (inMemoryToken) {
    config.headers.Authorization = `Bearer ${inMemoryToken}`;
  }
  return config;
});

// Access tokens are short-lived (15m). On a 401, use the refresh token to
// get a new pair and retry the original request once. Concurrent 401s share
// a single in-flight refresh call instead of each firing their own.
let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  if (!inMemoryRefreshToken) return null;
  try {
    const res = await axios.post(`${API_BASE_URL}/auth/refresh`, {
      refreshToken: inMemoryRefreshToken,
    });
    const { accessToken, refreshToken } = res.data;
    inMemoryToken = accessToken;
    inMemoryRefreshToken = refreshToken;
    onTokensRefreshed?.(accessToken, refreshToken);
    return accessToken;
  } catch {
    inMemoryToken = null;
    inMemoryRefreshToken = null;
    onRefreshFailed?.();
    return null;
  }
}

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const originalConfig = error.config;
    const isRefreshCall = originalConfig?.url?.includes('/auth/refresh');

    if (error.response?.status === 401 && originalConfig && !originalConfig._retry && !isRefreshCall) {
      originalConfig._retry = true;

      if (!refreshPromise) {
        refreshPromise = refreshAccessToken().finally(() => {
          refreshPromise = null;
        });
      }

      const newToken = await refreshPromise;
      if (newToken) {
        originalConfig.headers.Authorization = `Bearer ${newToken}`;
        return api(originalConfig);
      }
    }

    // Network errors for normal data mutations are persisted locally and replayed
    // on reconnect. Authentication, uploads and payment actions are excluded.
    const method = String(originalConfig?.method ?? '').toUpperCase();
    const replayable = ['POST', 'PATCH', 'PUT'].includes(method) && !originalConfig?.headers?.['X-MAYODE-SYNC-REPLAY'] && !String(originalConfig?.url ?? '').startsWith('/auth/') && !String(originalConfig?.url ?? '').startsWith('/uploads') && !String(originalConfig?.url ?? '').includes('payout');
    if (!error.response && replayable) {
      const queued = await syncQueue.enqueue({ method, url: originalConfig.url, data: originalConfig.data, params: originalConfig.params });
      const optimistic = await stageOfflineMutation(queued);
      return { data: { ...(optimistic ?? {}), queued: true, syncId: queued.id }, status: 202, statusText: 'Queued for sync', headers: {}, config: originalConfig };
    }

    // Offline reads for the three field workflows are served from the same
    // persistent optimistic cache that backs queued mutations.
    if (!error.response && method === 'GET') {
      const cached = await cachedRead(String(originalConfig?.url ?? ''), originalConfig?.params as Record<string, unknown> | undefined);
      if (cached !== undefined) return { data: cached, status: 200, statusText: 'Offline cache', headers: {}, config: originalConfig };
    }

    return Promise.reject(error);
  },
);

// ── Auth ──
export const authApi = {
  login: (phone: string, password: string) =>
    api.post('/auth/login', { phone, password }),
  register: (data: { phone: string; password: string; firstName: string; lastName: string; role: string; dataShareConsent: boolean }) =>
    api.post('/auth/register', data),
  logout: () => api.post('/auth/logout'),
  // AMCOS Secretary self-service: mamcosId is resolved server-side from the
  // caller's own AMCOS, so it's never sent from here.
  createFieldOfficer: (data: { phone: string; password: string; firstName: string; lastName: string; assignedArea?: string }) =>
    api.post('/auth/staff', { ...data, role: 'FIELD_OFFICER' }),
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
  /** Current user's farmer profile — use this for FARMER role (control-number lookup is staff-only). */
  me: () => api.get('/farmers/me'),
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
  financialProfile: (id: string) => api.get(`/farmers/${id}/financial-profile`),
  creditReadiness: (id: string) => api.get(`/farmers/${id}/credit-readiness`),
  listConsents: (id: string) => api.get(`/farmers/${id}/consents`),
  captureConsent: (id: string, data: object) => api.post(`/farmers/${id}/consents`, data),
  listQuestionnaires: (id: string) => api.get(`/farmers/${id}/questionnaires`),
  createQuestionnaire: (id: string, data: object) => api.post(`/farmers/${id}/questionnaires`, data),
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
  reviewBoundary: (id: string) => api.post(`/farms/${id}/review-boundary`),
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
  getByFarmerId: (farmerId: string) => api.get(`/crop-cycles/farmer/${farmerId}`),
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
  calendar: (params?: { from?: string; to?: string }) => api.get('/crop-cycles/calendar', { params }),
};

export const riceProtocolsApi = {
  tasks: (cropCycleId: string) => api.get(`/rice-protocols/crop-cycles/${cropCycleId}/tasks`),
  readiness: (cropCycleId: string) => api.get(`/rice-protocols/crop-cycles/${cropCycleId}/readiness`),
  rescheduleTask: (id: string, data: { dueDate: string; reason?: string }) => api.patch(`/rice-protocols/tasks/${id}/schedule`, data),
  completeTask: (id: string, data: { measurements?: Record<string, string | number>; photoUrls?: string[]; description?: string }) => api.post(`/rice-protocols/tasks/${id}/complete`, data),
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
    supplierId?: string;
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
    buyerId?: string;
    saleDate: string;
  }) => api.post('/finance/revenue', data),
  getCropCycleSummary: (cropCycleId: string) => api.get(`/finance/crop-cycle/${cropCycleId}/summary`),
};

export const buyersApi = {
  list: () => api.get('/buyers'),
};

export const suppliersApi = {
  getAll: () => api.get('/suppliers'),
  getOne: (id: string) => api.get(`/suppliers/${id}`),
};

export const inventoryApi = {
  mine: (params?: { cropCycleId?: string }) =>
    api.get('/inventory/records/mine', { params }),
  mySummary: () => api.get('/inventory/summary/mine'),
  reportDelivery: (data: {
    cropCycleId: string;
    weightKg: number;
    qualityGrade?: string;
    moistureContentPct?: number;
    warehouseLocation?: string;
    receivedDate?: string;
  }) => api.post('/inventory/records/mine', data),
};

export const insuranceApi = {
  myPolicies: () => api.get('/insurance/policies/me'),
  getPoliciesForFarmer: (farmerId: string) => api.get(`/insurance/policies/farmer/${farmerId}`),
  createClaim: (data: {
    policyId: string;
    incidentDate: string;
    incidentType: string;
    description?: string;
    claimedAmount: number;
  }) => api.post('/insurance/claims', data),
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
  // Staff (Field Officer / AMCOS Leader) queue and decision
  all: (status?: string) => api.get('/farm-leases', { params: status ? { status } : undefined }),
  officerVerify: (id: string, data: {
    decision: 'VERIFIED' | 'REJECTED' | 'NEEDS_MORE_INFO' | 'DISPUTED';
    method: string;
    contactedName?: string;
    contactedPhone?: string;
    evidenceUrls?: string[];
    notes?: string;
  }) => api.patch(`/farm-leases/${id}/officer-verify`, data),
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

/** Role-scoped dashboard data. Do not infer workspace permissions in the app. */
export const workspaceApi = {
  context: () => api.get('/workspace/context'),
};

// ── Field officer visits (timestamped farmer visits, own-AMCOS scoped) ──
export const officerVisitsApi = {
  create: (data: {
    farmerId: string;
    farmId?: string;
    cropCycleId?: string;
    purpose: 'ROUTINE_CHECK' | 'FARMING_ASSISTANCE' | 'VERIFICATION' | 'DISPUTE_FOLLOWUP' | 'TRAINING' | 'OTHER';
    notes?: string;
    photoUrls?: string[];
    gpsLatitude?: number;
    gpsLongitude?: number;
  }) => api.post('/field-officer-visits', data),
  mine: (params?: { farmerId?: string; from?: string; to?: string; page?: number; pageSize?: number }) =>
    api.get('/field-officer-visits/mine', { params }),
  forFarmer: (farmerId: string) => api.get(`/field-officer-visits/farmer/${farmerId}`),
  calendar: (params?: { from?: string; to?: string }) =>
    api.get('/field-officer-visits/calendar', { params }),
};

// ── Marketplace (M-LAX) ──
export const marketplaceApi = {
  // Land listings
  getLandListings: (params?: object) => api.get('/marketplace/land', { params }),
  getLandListing: (id: string) => api.get(`/marketplace/land/${id}`),
  createLandListing: (data: object) => api.post('/marketplace/land', data),
  updateLandListing: (id: string, data: object) => api.patch(`/marketplace/land/${id}`, data),
  cancelLandListing: (id: string) => api.patch(`/marketplace/land/${id}/cancel`),
  getSuggestedPrice: (farmId: string, askingPrice?: number) =>
    api.get(`/marketplace/land/farm/${farmId}/suggested-price`, { params: askingPrice ? { askingPrice } : undefined }),

  // Escrow
  depositEscrow: (listingId: string, data: { renterId: string; amount: number; mpesaRef?: string; phoneNumber?: string }) =>
    api.post(`/marketplace/land/${listingId}/escrow-deposit`, data),
  reconcileEscrow: (listingId: string) => api.post(`/marketplace/land/${listingId}/escrow-reconcile`),
  releaseEscrow: (listingId: string) => api.post(`/marketplace/land/${listingId}/escrow-release`),

  // Digital lease agreement
  regenerateAgreement: (listingId: string) => api.post(`/marketplace/land/${listingId}/agreement/regenerate`),

  // Sub-leasing & ownership transfer
  requestSubLease: (listingId: string, data: { renterId: string; newAskingPrice?: number }) =>
    api.post(`/marketplace/land/${listingId}/sub-lease/request`, data),
  approveSubLease: (listingId: string, subLeaseId: string, data: { ownerId: string; approve: boolean }) =>
    api.patch(`/marketplace/land/${listingId}/sub-lease/${subLeaseId}/approve`, data),
  transferOwnership: (listingId: string, data: { currentOwnerId: string; newOwnerPhone: string; reason?: string }) =>
    api.post(`/marketplace/land/${listingId}/transfer-ownership`, data),

  // Bargaining — "Make an Offer"
  submitOffer: (listingId: string, data: { farmerId: string; offerAmount: number }) =>
    api.post(`/marketplace/land/${listingId}/offers`, data),
  getOffers: (listingId: string) => api.get(`/marketplace/land/${listingId}/offers`),
  respondToOffer: (listingId: string, offerId: string, data: { ownerId: string; action: 'accept' | 'reject' | 'counter'; counterAmount?: number }) =>
    api.patch(`/marketplace/land/${listingId}/offers/${offerId}/respond`, data),
  respondToCounter: (listingId: string, offerId: string, data: { farmerId: string; accept: boolean }) =>
    api.patch(`/marketplace/land/${listingId}/offers/${offerId}/counter-response`, data),

  // Multi-year rent schedule & installments
  getRentSchedule: (listingId: string) => api.get(`/marketplace/land/${listingId}/rent-schedule`),
  payInstallment: (listingId: string, data: { renterId: string; phoneNumber?: string; mpesaRef?: string }) =>
    api.post(`/marketplace/land/${listingId}/installments/pay`, data),
  logImprovement: (listingId: string, data: { renterId: string; description: string; amountTzs: number }) =>
    api.post(`/marketplace/land/${listingId}/improvements`, data),

  // Reward for Honesty (internal MAYODE protection status, not third-party insurance)
  getProtectionStatus: (listingId: string) => api.get(`/marketplace/land/${listingId}/protection`),

  // Input credit / harvest buy-back eligibility (gated on M-LAX activity)
  checkInputCreditEligibility: (farmerId: string) => api.get(`/marketplace/farmers/${farmerId}/input-credit-eligibility`),
  issueInputCredit: (farmerId: string, data: { amountTzs: number; repaymentSchedule?: string; autoDeductPercent?: number }) =>
    api.post(`/marketplace/farmers/${farmerId}/input-credit`, data),
  checkBuyBackEligibility: (farmerId: string) => api.get(`/marketplace/farmers/${farmerId}/buy-back-eligibility`),

  // MAMCOS stability + unreported-activity flagging
  getMamcosStability: (mamcosId: string) => api.get(`/marketplace/mamcos/${mamcosId}/stability`),
  flagUnreportedActivity: (farmId: string, data: { officerUserId: string; description: string }) =>
    api.post(`/marketplace/farms/${farmId}/flag-unreported-activity`, data),

  // Tractors
  createTractorOwner: (data: { name: string; phone: string; location?: string }) =>
    api.post('/marketplace/tractors/owners', data),
  createTractor: (data: object) => api.post('/marketplace/tractors', data),
  getTractors: (params?: object) => api.get('/marketplace/tractors', { params }),
  getMyTractors: (ownerId: string) => api.get(`/marketplace/tractors/owners/${ownerId}/tractors`),
  bookTractor: (data: object) => api.post('/marketplace/tractors/book', data),
  confirmTractorBooking: (id: string) => api.patch(`/marketplace/tractors/bookings/${id}/confirm`),
  completeTractorBooking: (id: string) => api.patch(`/marketplace/tractors/bookings/${id}/complete`),
  cancelTractorBooking: (id: string) => api.patch(`/marketplace/tractors/bookings/${id}/cancel`),

  // Market prices
  getMarketPrices: (params?: object) => api.get('/marketplace/prices', { params }),
  createMarketPrice: (data: { commodity: string; price: number; market?: string; source?: string; recordedAt: string }) =>
    api.post('/marketplace/prices', data),
};

export const governanceApi = {
  votes: () => api.get('/governance/votes'),
  respond: (voteId: string, optionId: string) => api.post(`/governance/votes/${voteId}/respond/${optionId}`),
};

export const reportsApi = {
  flocertAuditPack: (params?: object) => api.get('/reports/flocert-audit-pack', { params }),
};

export const integrationsApi = {
  catalog: () => api.get('/integrations/ai-catalog'),
  createAiRecord: (data: object) => api.post('/integrations/ai-records', data),
  generateFieldAdvisory: (cropCycleId: string) =>
    api.post(`/integrations/ai-records/field-advisory/${cropCycleId}`, {}),
  aiRecords: (params?: object) => api.get('/integrations/ai-records', { params }),
  myAiRecords: (params?: object) =>
    api.get('/integrations/ai-records/mine', { params }),
};
