import axios from 'axios';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 15000,
});

// Attach Bearer token from localStorage on every request
api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('accessToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

// Auto-refresh token on 401: exchange the stored refresh token for a new
// access token and retry the original request once. Concurrent 401s while a
// refresh is already in flight queue behind it instead of each firing their
// own refresh call. Falls back to a hard logout/redirect if there's no
// refresh token, or the refresh call itself fails/401s.
let isRefreshing = false;
let refreshQueue: Array<(token: string | null) => void> = [];

const forceLogout = () => {
  if (typeof window === 'undefined') return;
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
  window.location.href = '/login';
};

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    if (typeof window === 'undefined' || !originalRequest) {
      return Promise.reject(error);
    }

    const isAuthEndpoint = originalRequest.url?.includes('/auth/login') || originalRequest.url?.includes('/auth/refresh');

    if (error.response?.status !== 401 || isAuthEndpoint || originalRequest._retry) {
      if (error.response?.status === 401) forceLogout();
      return Promise.reject(error);
    }

    const refreshToken = localStorage.getItem('refreshToken');
    if (!refreshToken) {
      forceLogout();
      return Promise.reject(error);
    }

    originalRequest._retry = true;

    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        refreshQueue.push((token) => {
          if (!token) { reject(error); return; }
          originalRequest.headers.Authorization = `Bearer ${token}`;
          resolve(api(originalRequest));
        });
      });
    }

    isRefreshing = true;
    try {
      const res = await axios.post(`${API_BASE_URL}/auth/refresh`, { refreshToken });
      const { accessToken, refreshToken: newRefreshToken } = res.data;
      localStorage.setItem('accessToken', accessToken);
      localStorage.setItem('refreshToken', newRefreshToken);
      refreshQueue.forEach((resolveQueued) => resolveQueued(accessToken));
      refreshQueue = [];
      originalRequest.headers.Authorization = `Bearer ${accessToken}`;
      return api(originalRequest);
    } catch (refreshError) {
      refreshQueue.forEach((resolveQueued) => resolveQueued(null));
      refreshQueue = [];
      forceLogout();
      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  }
);

// ── Auth ──
export const authApi = {
  login: (phone: string, password: string) =>
    api.post('/auth/login', { phone, password }),
  register: (data: object) => api.post('/auth/register', data),
  logout: () => api.post('/auth/logout'),
  createStaff: (data: object) => api.post('/auth/staff', data),
};
export const usersApi = {
  getAll: () => api.get('/users'),
  update: (id: string, data: object) => api.patch(`/users/${id}`, data),
  updateProfile: (data: object) => api.put('/users/profile', data),
};
export const rolesApi = {
  getAll: () => api.get('/roles'),
  getOne: (id: string) => api.get(`/roles/${id}`),
  create: (data: object) => api.post('/roles', data),
  update: (id: string, data: object) => api.patch(`/roles/${id}`, data),
  remove: (id: string) => api.delete(`/roles/${id}`),
  getPermissions: (id: string) => api.get(`/roles/${id}/permissions`),
  setPermissions: (id: string, data: object) => api.put(`/roles/${id}/permissions`, data),
  getResources: () => api.get('/roles/resources'),
};

// ── Farmers ──
export const farmersApi = {
  getAll: (params?: object) => api.get('/farmers', { params }),
  /** Unpaginated, minimal-field list for dashboard aggregation — use this, not getAll(), when you need every farmer. */
  getAllUnpaginated: () => api.get('/farmers/all'),
  overview: () => api.get('/farmers/overview'),
  getOne: (id: string) => api.get(`/farmers/${id}`),
  getMe: () => api.get('/farmers/me'),
  getByControlNumber: (controlNumber: string) => api.get(`/farmers/control-number/${encodeURIComponent(controlNumber)}`),
  update: (id: string, data: object) => api.patch(`/farmers/${id}`, data),
  assignOfficer: (id: string, officerId: string) => api.patch(`/farmers/${id}/assign-officer`, { officerId }),
  financialProfile: (id: string) => api.get(`/farmers/${id}/financial-profile`),
  creditReadiness: (id: string) => api.get(`/farmers/${id}/credit-readiness`),
  listConsents: (id: string) => api.get(`/farmers/${id}/consents`),
  captureConsent: (id: string, data: object) => api.post(`/farmers/${id}/consents`, data),
  listQuestionnaires: (id: string) => api.get(`/farmers/${id}/questionnaires`),
  createQuestionnaire: (id: string, data: object) => api.post(`/farmers/${id}/questionnaires`, data),
};

export const partnerApi = {
  docs: () => api.get('/partner/v1/docs'),
  listKeys: () => api.get('/partner/keys'),
  createKey: (partnerName: string) => api.post('/partner/keys', { partnerName }),
  revokeKey: (id: string) => api.patch(`/partner/keys/${id}/revoke`),
  listRequests: (id: string, take = 50) =>
    api.get(`/partner/keys/${id}/requests`, { params: { take } }),
};

// ── MAMCOS ──
export const mamcosApi = {
  getAll: () => api.get('/mamcos'),
  getOne: (id: string) => api.get(`/mamcos/${id}`),
  create: (data: object) => api.post('/mamcos', data),
  update: (id: string, data: object) => api.patch(`/mamcos/${id}`, data),
  assignSecretary: (id: string, data: object) => api.post(`/mamcos/${id}/secretary`, data),
  assignFarmer: (id: string, data: object) => api.post(`/mamcos/${id}/assign-farmer`, data),
  dashboard: () => api.get('/mamcos/secretary-dashboard'),
  fieldOfficers: () => api.get('/mamcos/staff/field-officers'),
};
export const facilitiesApi = {
  getIrrigationSchemes: (mamcosId?: string) => api.get('/facilities/irrigation-schemes', { params: mamcosId ? { mamcosId } : undefined }),
  createIrrigationScheme: (data: object) => api.post('/facilities/irrigation-schemes', data),
  updateIrrigationScheme: (id: string, data: object) => api.patch(`/facilities/irrigation-schemes/${id}`, data),
  removeIrrigationScheme: (id: string) => api.delete(`/facilities/irrigation-schemes/${id}`),
  getAggregationCentres: (mamcosId?: string) => api.get('/facilities/aggregation-centres', { params: mamcosId ? { mamcosId } : undefined }),
  createAggregationCentre: (data: object) => api.post('/facilities/aggregation-centres', data),
  updateAggregationCentre: (id: string, data: object) => api.patch(`/facilities/aggregation-centres/${id}`, data),
  removeAggregationCentre: (id: string) => api.delete(`/facilities/aggregation-centres/${id}`),
};

// ── Farms ──
export const farmsApi = {
  getAll: (params?: object) => api.get('/farms', { params }),
  overview: () => api.get('/farms/overview'),
  getOne: (id: string) => api.get(`/farms/${id}`),
  getByFarmerId: (farmerId: string) => api.get(`/farms/farmer/${farmerId}`),
  create: (data: object) => api.post('/farms', data),
  update: (id: string, data: object) => api.patch(`/farms/${id}`, data),
  updateBoundary: (id: string, data: object) => api.patch(`/farms/${id}/boundary`, data),
  reviewBoundary: (id: string) => api.post(`/farms/${id}/review-boundary`),
  productivity: (id: string) => api.get(`/farms/${id}/productivity`),
  report: (id: string) => api.get(`/farms/${id}/report`),
  listPhotos: (id: string) => api.get(`/farms/${id}/photos`),
  addPhoto: (id: string, data: object) => api.post(`/farms/${id}/photos`, data),
  addDocument: (id: string, data: object) => api.post(`/farms/${id}/documents`, data),
  listDocuments: (id: string) => api.get(`/farms/${id}/documents`),
};
export const farmVerificationsApi = {
  getAll: () => api.get('/farm-verifications'),
  getOne: (id: string) => api.get(`/farm-verifications/${id}`),
  getForFarm: (farmId: string) => api.get(`/farm-verifications/farm/${farmId}`),
  verify: (data: object) => api.post('/farm-verifications', data),
};

// ── Crop Cycles ──
export const cropCyclesApi = {
  getAll: (params?: object) => api.get('/crop-cycles', { params }),
  getOne: (id: string) => api.get(`/crop-cycles/${id}`),
  getByFarmId: (farmId: string) => api.get(`/crop-cycles/farm/${farmId}`),
  create: (data: object) => api.post('/crop-cycles', data),
  update: (id: string, data: object) => api.patch(`/crop-cycles/${id}`, data),
  logActivity: (data: object) => api.post('/crop-cycles/activity', data),
  calendar: (params?: object) => api.get('/crop-cycles/calendar', { params }),
  activityLogs: () => api.get('/crop-cycles/activity-logs'),
  getActivityLog: (id: string) => api.get(`/crop-cycles/activity/${id}`),
  updateActivityLog: (id: string, data: object) => api.patch(`/crop-cycles/activity/${id}`, data),
  deleteActivityLog: (id: string) => api.delete(`/crop-cycles/activity/${id}`),
};
export const riceProtocolsApi = {
  bootstrap: (mamcosId: string) => api.post(`/rice-protocols/mamcos/${mamcosId}/bootstrap`),
  list: (mamcosId: string) => api.get(`/rice-protocols/mamcos/${mamcosId}`),
  update: (id: string, data: object) => api.patch(`/rice-protocols/${id}`, data),
  tasks: (cropCycleId: string) => api.get(`/rice-protocols/crop-cycles/${cropCycleId}/tasks`),
  readiness: (cropCycleId: string, params?: { includeWarehouse?: boolean }) => api.get(`/rice-protocols/crop-cycles/${cropCycleId}/readiness`, { params }),
  rescheduleTask: (id: string, data: { dueDate: string; reason?: string }) => api.patch(`/rice-protocols/tasks/${id}/schedule`, data),
  completeTask: (id: string, data: object) => api.post(`/rice-protocols/tasks/${id}/complete`, data),
};

export const activitiesApi = {
  listForFarmer: (farmerId: string, params?: object) => api.get(`/activities/farmer/${farmerId}`, { params }),
  recentForFarmer: (farmerId: string, limit?: number) => api.get(`/activities/farmer/${farmerId}`, { params: limit ? { limit } : undefined }),
};

// ── Finance ──
export const financeApi = {
  getCropCycleSummary: (id: string) => api.get(`/finance/crop-cycle/${id}/summary`),
  getFarmerSummary: (id: string) => api.get(`/finance/farmer/${id}/summary`),
  addCost: (data: object) => api.post('/finance/cost', data),
  addRevenue: (data: object) => api.post('/finance/revenue', data),
  getAllCosts: () => api.get('/finance/costs'),
};
// ── Suppliers ──
export const suppliersApi = {
  getAll: () => api.get('/suppliers'),
  getOne: (id: string) => api.get(`/suppliers/${id}`),
  create: (data: object) => api.post('/suppliers', data),
  update: (id: string, data: object) => api.patch(`/suppliers/${id}`, data),
  remove: (id: string) => api.delete(`/suppliers/${id}`),
};
// ── Loans ──
export const loansApi = {
  getForFarmer: (farmerId: string) => api.get(`/loans/farmer/${farmerId}`),
  getAll: () => api.get('/loans'),
  create: (data: object) => api.post('/loans', data),
  payoutReport: (params?: { from?: string; to?: string; format?: 'csv' | 'pdf' | 'xlsx' }) =>
    api.get('/loans/lender-payout-report', { params, responseType: 'blob' }),
  lenders: {
    getAll: () => api.get('/lenders'),
    getOne: (id: string) => api.get(`/lenders/${id}`),
    create: (data: object) => api.post('/lenders', data),
    update: (id: string, data: object) => api.patch(`/lenders/${id}`, data),
    remove: (id: string) => api.delete(`/lenders/${id}`),
  },
};
export const accountingApi = {
  statements: (params?: object) => api.get('/accounting/statements', { params }),
  profitLoss: (params?: object) => api.get('/accounting/profit-loss', { params }),
  balanceSheet: (params?: object) => api.get('/accounting/balance-sheet', { params }),
  cashFlow: (params?: object) => api.get('/accounting/cash-flow', { params }),
  trialBalance: (params?: object) => api.get('/accounting/trial-balance', { params }),
  ratios: (params?: object) => api.get('/accounting/ratios', { params }),
  accounts: () => api.get('/accounting/accounts'),
  createInvoice: (data: object) => api.post('/accounting/invoices', data),
  createBill: (data: object) => api.post('/accounting/bills', data),
  payBill: (id: string) => api.post(`/accounting/bills/${id}/pay`),
  receivables: () => api.get('/accounting/receivables'),
  payables: () => api.get('/accounting/payables'),
  createBudget: (data: object) => api.post('/accounting/budgets', data),
  listBudgets: () => api.get('/accounting/budgets'),
  getBudget: (id: string) => api.get(`/accounting/budgets/${id}`),
  budgetActual: (id: string) => api.get(`/accounting/budgets/${id}/actual`),
};

export const insuranceApi = {
  getProviders: () => api.get('/insurance/providers'),
  createProvider: (data: object) => api.post('/insurance/providers', data),
  updateProvider: (id: string, data: object) => api.patch(`/insurance/providers/${id}`, data),
  getPolicies: () => api.get('/insurance/policies'),
  myPolicies: () => api.get('/insurance/policies/me'),
  getPoliciesForFarmer: (farmerId: string) => api.get(`/insurance/policies/farmer/${farmerId}`),
  createPolicy: (data: object) => api.post('/insurance/policies', data),
  updatePolicyStatus: (id: string, status: string) => api.patch(`/insurance/policies/${id}/status`, { status }),
  amendPolicy: (id: string, data: object) => api.patch(`/insurance/policies/${id}/amend`, data),
  renewPolicy: (id: string, data: object) => api.post(`/insurance/policies/${id}/renew`, data),
  getClaims: () => api.get('/insurance/claims'),
  createClaim: (data: object) => api.post('/insurance/claims', data),
  inspectClaim: (id: string, data: object) => api.patch(`/insurance/claims/${id}/inspect`, data),
  updateClaimPayment: (id: string, data: object) => api.patch(`/insurance/claims/${id}/payment`, data),
  getWeatherContextForClaim: (id: string) => api.get(`/insurance/claims/${id}/weather-context`),
  coverageSummary: () => api.get('/insurance/coverage-summary'),
};
export const weatherApi = {
  forecast: (lat: number, lon: number) => api.get('/weather/forecast', { params: { lat, lon } }),
  getAlerts: () => api.get('/weather/alerts'),
  createAlert: (data: object) => api.post('/weather/alerts', data),
};
export const reportsApi = {
  kpis: () => api.get('/reports/kpis'),
  impact: () => api.get('/reports/impact'),
  complianceSummary: () => api.get('/reports/compliance-summary'),
  farmerPayments: (params?: object) => api.get('/reports/farmer-payments', { params }),
  premiumFund: (params?: object) => api.get('/reports/premium-fund', { params }),
  flocertAuditPack: (params?: object) => api.get('/reports/flocert-audit-pack', { params }),
  farmers: (params?: object) => api.get('/reports/farmers', { params }),
  cropCycles: (params?: object) => api.get('/reports/crop-cycles', { params }),
  fieldOfficerPerformance: (params?: object) => api.get('/reports/field-officer-performance', { params }),
  insuranceCoverage: (params?: object) => api.get('/reports/insurance-coverage', { params }),
  genderYouthInclusion: (params?: object) => api.get('/reports/gender-youth-inclusion', { params }),
  builderSchema: () => api.get('/reports/builder/schema'),
  runBuilder: (payload: object) => api.post('/reports/builder', payload),
  downloadBuilder: (payload: object) => api.post('/reports/builder', payload, { responseType: 'blob' }),
  download: (path: string, params?: object) => api.get(path, { params, responseType: 'blob' }),
};
export const integrationsApi = {
  catalog: () => api.get('/integrations/ai-catalog'),
  createAiRecord: (data: object) => api.post('/integrations/ai-records', data),
  generateFieldAdvisory: (cropCycleId: string) =>
    api.post(`/integrations/ai-records/field-advisory/${cropCycleId}`, {}),
  aiRecords: (params?: object) => api.get('/integrations/ai-records', { params }),
  myAiRecords: (params?: object) =>
    api.get('/integrations/ai-records/mine', { params }),
  lotQuality: (lotId: string) =>
    api.get(`/integrations/ai-records/lot/${lotId}/quality`),
};
export const buyerPortalApi = {
  profile: () => api.get('/buyer-portal/profile'),
  me: () => api.get('/buyer-portal/me'),
  dashboard: () => api.get('/buyer-portal/dashboard'),
  createOrder: (data: object) => api.post('/buyer-portal/orders', data),
  traceability: (reference: string) =>
    api.get(`/buyer-portal/traceability/${encodeURIComponent(reference)}`),
};
export const governanceApi = {
  votes: () => api.get('/governance/votes'), createVote: (data: object) => api.post('/governance/votes', data),
  openVote: (id: string) => api.post(`/governance/votes/${id}/open`), closeVote: (id: string) => api.post(`/governance/votes/${id}/close`),
  respond: (voteId: string, optionId: string) => api.post(`/governance/votes/${voteId}/respond/${optionId}`),
  results: (id: string) => api.get(`/governance/votes/${id}/results`), projects: () => api.get('/governance/projects'), createProject: (data: object) => api.post('/governance/projects', data), updateProject: (id: string, data: object) => api.patch(`/governance/projects/${id}`, data), removeProject: (id: string) => api.delete(`/governance/projects/${id}`), meetings: () => api.get('/governance/meetings'), createMeeting: (data: object) => api.post('/governance/meetings', data), report: () => api.get('/governance/report'),
};
export const salesApi = {
  create: (data: object) => api.post('/sales', data),
  list: () => api.get('/sales'),
  settle: (id: string) => api.post(`/sales/${id}/settle`, {}),
  collect: (id: string, phoneNumber?: string) => api.post(`/sales/${id}/collect`, { phoneNumber }),
  approvePayouts: (id: string) => api.post(`/loans/sales/${id}/approve-payouts`),
  reconcilePayouts: (id: string) => api.post(`/loans/sales/${id}/reconcile-payouts`),
  traceability: (reference: string) =>
    api.get(`/sales/traceability/${encodeURIComponent(reference)}`),
  dispatchLookup: (reference: string) =>
    api.get(`/sales/${encodeURIComponent(reference)}/dispatch-lookup`),
  createDispatch: (reference: string, data: object) =>
    api.post(`/sales/${encodeURIComponent(reference)}/dispatch`, data),
};
export const buyersApi = { list: () => api.get('/buyers') };
export const buyerOrdersApi = {
  getAll: () => api.get('/buyer-orders'),
  getForBuyer: (buyerId: string) => api.get(`/buyer-orders/buyer/${buyerId}`),
  create: (data: object) => api.post('/buyer-orders', data),
  updateStatus: (id: string, status: string) => api.patch(`/buyer-orders/${id}/status`, { status }),
  remove: (id: string) => api.delete(`/buyer-orders/${id}`),
};

// ── Inventory ──
export const inventoryApi = {
  getAll: (params?: object) => api.get('/inventory/records', { params }),
  receive: (data: object) => api.post('/inventory/records', data),
  updateStatus: (id: string, data: object) => api.patch(`/inventory/records/${id}/status`, data),
  createLot: (data: object) => api.post('/inventory/lots', data),
  lots: () => api.get('/inventory/lots'),
  getLot: (lotNumber: string) => api.get(`/inventory/lots/${encodeURIComponent(lotNumber)}`),
  dashboardSummary: () => api.get('/inventory/dashboard-summary'),
};

// ── Locations ──
export const locationsApi = {
  getRegions: () => api.get('/locations/regions'),
  getDistricts: (regionId: string) => api.get(`/locations/regions/${regionId}/districts`),
  getWards: (districtId: string) => api.get(`/locations/districts/${districtId}/wards`),
  createRegion: (data: object) => api.post('/locations/regions', data),
  updateRegion: (id: string, data: object) => api.patch(`/locations/regions/${id}`, data),
  removeRegion: (id: string) => api.delete(`/locations/regions/${id}`),
  createDistrict: (data: object) => api.post('/locations/districts', data),
  updateDistrict: (id: string, data: object) => api.patch(`/locations/districts/${id}`, data),
  removeDistrict: (id: string) => api.delete(`/locations/districts/${id}`),
  createWard: (data: object) => api.post('/locations/wards', data),
  updateWard: (id: string, data: object) => api.patch(`/locations/wards/${id}`, data),
  removeWard: (id: string) => api.delete(`/locations/wards/${id}`),
};
export const settingsApi = {
  getOrg: () => api.get('/settings/org'),
  updateOrg: (data: object) => api.put('/settings/org', data),
  getTemplates: () => api.get('/settings/notification-templates'),
  createTemplate: (data: object) => api.post('/settings/notification-templates', data),
  updateTemplate: (id: string, data: object) => api.patch(`/settings/notification-templates/${id}`, data),
  removeTemplate: (id: string) => api.delete(`/settings/notification-templates/${id}`),
};

// ── Marketplace ──
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
  depositEscrow: (listingId: string, data: object) => api.post(`/marketplace/land/${listingId}/escrow-deposit`, data),
  reconcileEscrow: (listingId: string) => api.post(`/marketplace/land/${listingId}/escrow-reconcile`),
  releaseEscrow: (listingId: string) => api.post(`/marketplace/land/${listingId}/escrow-release`),

  // Digital lease agreement
  regenerateAgreement: (listingId: string) => api.post(`/marketplace/land/${listingId}/agreement/regenerate`),

  // Sub-leasing & ownership transfer
  requestSubLease: (listingId: string, data: object) => api.post(`/marketplace/land/${listingId}/sub-lease/request`, data),
  approveSubLease: (listingId: string, subLeaseId: string, data: object) =>
    api.patch(`/marketplace/land/${listingId}/sub-lease/${subLeaseId}/approve`, data),
  transferOwnership: (listingId: string, data: object) => api.post(`/marketplace/land/${listingId}/transfer-ownership`, data),

  // Bargaining — "Make an Offer"
  submitOffer: (listingId: string, data: object) => api.post(`/marketplace/land/${listingId}/offers`, data),
  getOffers: (listingId: string) => api.get(`/marketplace/land/${listingId}/offers`),
  respondToOffer: (listingId: string, offerId: string, data: object) =>
    api.patch(`/marketplace/land/${listingId}/offers/${offerId}/respond`, data),

  // Multi-year rent schedule & installments
  getRentSchedule: (listingId: string) => api.get(`/marketplace/land/${listingId}/rent-schedule`),
  payInstallment: (listingId: string, data: object) => api.post(`/marketplace/land/${listingId}/installments/pay`, data),
  logImprovement: (listingId: string, data: object) => api.post(`/marketplace/land/${listingId}/improvements`, data),

  // Reward for Honesty (internal MAYODE protection status, not third-party insurance)
  getProtectionStatus: (listingId: string) => api.get(`/marketplace/land/${listingId}/protection`),

  // Input credit / harvest buy-back eligibility (gated on M-LAX activity)
  checkInputCreditEligibility: (farmerId: string) => api.get(`/marketplace/farmers/${farmerId}/input-credit-eligibility`),
  issueInputCredit: (farmerId: string, data: object) => api.post(`/marketplace/farmers/${farmerId}/input-credit`, data),
  checkBuyBackEligibility: (farmerId: string) => api.get(`/marketplace/farmers/${farmerId}/buy-back-eligibility`),

  // MAMCOS stability + unreported-activity flagging
  getMamcosStability: (mamcosId: string) => api.get(`/marketplace/mamcos/${mamcosId}/stability`),
  flagUnreportedActivity: (farmId: string, data: object) => api.post(`/marketplace/farms/${farmId}/flag-unreported-activity`, data),

  // Tractors
  createTractorOwner: (data: object) => api.post('/marketplace/tractors/owners', data),
  createTractor: (data: object) => api.post('/marketplace/tractors', data),
  getTractors: (params?: object) => api.get('/marketplace/tractors', { params }),
  getMyTractors: (ownerId: string) => api.get(`/marketplace/tractors/owners/${ownerId}/tractors`),
  bookTractor: (data: object) => api.post('/marketplace/tractors/book', data),
  confirmTractorBooking: (id: string) => api.patch(`/marketplace/tractors/bookings/${id}/confirm`),
  completeTractorBooking: (id: string) => api.patch(`/marketplace/tractors/bookings/${id}/complete`),
  cancelTractorBooking: (id: string) => api.patch(`/marketplace/tractors/bookings/${id}/cancel`),

  // Market prices
  getMarketPrices: (params?: object) => api.get('/marketplace/prices', { params }),
  createMarketPrice: (data: object) => api.post('/marketplace/prices', data),
};

// ── AMCOS-first farm registry ──
export const registryApi = {
  list: (params?: object) => api.get('/farm-registry', { params }),
  preRegister: (data: object) => api.post('/farm-registry', data),
  mine: () => api.get('/farm-registry/mine'),
  claim: (id: string) => api.post(`/farm-registry/${id}/claim`),
  reject: (id: string) => api.post(`/farm-registry/${id}/reject`),
};

// ── Farming seasons ──
export const farmingSeasonsApi = {
  getAll: () => api.get('/farming-seasons'),
  getCurrent: () => api.get('/farming-seasons/current'),
  getOne: (id: string) => api.get(`/farming-seasons/${id}`),
  create: (data: object) => api.post('/farming-seasons', data),
  update: (id: string, data: object) => api.patch(`/farming-seasons/${id}`, data),
};

// ── Farm leases, seasonal assignments & ownerships ──
export const farmLeasesApi = {
  getAll: (params?: object) => api.get('/farm-leases', { params }),
  create: (data: object) => api.post('/farm-leases', data),
  officerVerify: (id: string, data: object) => api.patch(`/farm-leases/${id}/officer-verify`, data),
  remove: (id: string) => api.delete(`/farm-leases/${id}`),
};
export const seasonalAssignmentsApi = {
  getAll: () => api.get('/seasonal-assignments'),
};
export const farmOwnershipsApi = {
  getAll: (params?: object) => api.get('/farm-ownerships', { params }),
};

// ── Disputes ──
export const disputesApi = {
  getAll: (params?: object) => api.get('/disputes', { params }),
  forFarm: (farmId: string) => api.get(`/disputes/farm/${farmId}`),
  create: (data: object) => api.post('/disputes', data),
  resolve: (id: string, data: object) => api.patch(`/disputes/${id}/resolve`, data),
};

// ── Suggested farm corrections & source-tracked data values ──
export const farmCorrectionsApi = {
  listAll: (params?: object) => api.get('/suggested-updates', { params }),
  review: (id: string, data: object) => api.patch(`/suggested-updates/${id}/review`, data),
  listConflicts: () => api.get('/farm-data-conflicts'),
  listValuesForFarm: (farmId: string) => api.get(`/farms/${farmId}/data-values`),
  recordValue: (farmId: string, data: object) => api.post(`/farms/${farmId}/data-values`, data),
  resolveConflict: (farmId: string, fieldName: string, approvedValueId: string) =>
    api.patch(`/farms/${farmId}/data-values/${fieldName}/resolve`, { approvedValueId }),
};

// ── Field surveys (MAYODE field data collection) ──
export const fieldSurveysApi = {
  listForFarm: (farmId: string) => api.get(`/farms/${farmId}/field-surveys`),
  create: (farmId: string, data: object) => api.post(`/farms/${farmId}/field-surveys`, data),
};

// ── Field officer visits ──
export const fieldOfficerVisitsApi = {
  getAll: () => api.get('/field-officer-visits'),
  mine: (params?: object) => api.get('/field-officer-visits/mine', { params }),
  forFarmer: (farmerId: string) => api.get(`/field-officer-visits/farmer/${farmerId}`),
  calendar: (params?: object) => api.get('/field-officer-visits/calendar', { params }),
  create: (data: object) => api.post('/field-officer-visits', data),
};

// ── Owner-confirmation requests (AMCOS-first registry) ──
export const confirmationRequestsApi = {
  resend: (registryRecordId: string) => api.post(`/farm-registry/${registryRecordId}/resend-confirmation`),
  listForRecord: (registryRecordId: string) => api.get(`/farm-registry/${registryRecordId}/confirmation-requests`),
};

// ── Memberships ──
export const membershipsApi = {
  getAll: (params?: object) => api.get('/memberships', { params }),
  me: () => api.get('/memberships/me'),
  listPlans: () => api.get('/memberships/plans'),
  createPlan: (data: object) => api.post('/memberships/plans', data),
  start: (data: object) => api.post('/memberships/start', data),
  reconcile: () => api.post('/memberships/reconcile'),
  reconcilePending: () => api.post('/memberships/reconcile-pending'),
  reconcileOne: (id: string) => api.post(`/memberships/${id}/reconcile`),
  approve: (id: string, data?: object) => api.post(`/memberships/${id}/approve`, data || {}),
};

export const workspaceApi = {
  context: () => api.get('/workspace/context'),
};

// ── Farm alerts ──
export const farmAlertsApi = {
  getAll: () => api.get('/farm-alerts'),
  getOne: (id: string) => api.get(`/farm-alerts/${id}`),
  complete: (id: string) => api.patch(`/farm-alerts/${id}/complete`),
  generateAll: () => api.post('/farm-alerts/generate'),
};

// ── Rewards ──
export const rewardsApi = {
  mine: () => api.get('/rewards/mine'),
  confirmReceipt: (winnerId: string) => api.patch(`/rewards/winners/${winnerId}/confirm`),
  listCampaigns: () => api.get('/rewards/campaigns'),
  getCampaign: (id: string) => api.get(`/rewards/campaigns/${id}`),
  createCampaign: (data: object) => api.post('/rewards/campaigns', data),
  eligible: (id: string) => api.get(`/rewards/campaigns/${id}/eligible`),
  select: (id: string) => api.post(`/rewards/campaigns/${id}/select`),
  reproduce: (id: string) => api.get(`/rewards/campaigns/${id}/reproduce`),
  approve: (id: string) => api.post(`/rewards/campaigns/${id}/approve`),
};

// ── Notifications (header bell) ──
export const notificationsApi = {
  list: (unreadOnly = false) => api.get('/notifications', { params: { unreadOnly } }),
  unreadCount: () => api.get('/notifications/unread-count'),
  markRead: (id: string) => api.patch(`/notifications/${id}/read`),
  markAllRead: () => api.patch('/notifications/read-all'),
};
