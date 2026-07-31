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

// Auto-refresh token on 401
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401 && typeof window !== 'undefined') {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
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
};

// ── Farmers ──
export const farmersApi = {
  getAll: (params?: object) => api.get('/farmers', { params }),
  getOne: (id: string) => api.get(`/farmers/${id}`),
  getMe: () => api.get('/farmers/me'),
  getByControlNumber: (controlNumber: string) => api.get(`/farmers/control-number/${encodeURIComponent(controlNumber)}`),
  update: (id: string, data: object) => api.patch(`/farmers/${id}`, data),
  financialProfile: (id: string) => api.get(`/farmers/${id}/financial-profile`),
  listConsents: (id: string) => api.get(`/farmers/${id}/consents`),
  captureConsent: (id: string, data: object) => api.post(`/farmers/${id}/consents`, data),
  listQuestionnaires: (id: string) => api.get(`/farmers/${id}/questionnaires`),
  createQuestionnaire: (id: string, data: object) => api.post(`/farmers/${id}/questionnaires`, data),
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

// ── Crop Cycles ──
export const cropCyclesApi = {
  getAll: (params?: object) => api.get('/crop-cycles', { params }),
  getOne: (id: string) => api.get(`/crop-cycles/${id}`),
  getByFarmId: (farmId: string) => api.get(`/crop-cycles/farm/${farmId}`),
  create: (data: object) => api.post('/crop-cycles', data),
  update: (id: string, data: object) => api.patch(`/crop-cycles/${id}`, data),
  logActivity: (data: object) => api.post('/crop-cycles/activity', data),
  calendar: (params?: object) => api.get('/crop-cycles/calendar', { params }),
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
};
export const accountingApi = {
  statements: (params?: object) => api.get('/accounting/statements', { params }),
  profitLoss: (params?: object) => api.get('/accounting/profit-loss', { params }),
  balanceSheet: (params?: object) => api.get('/accounting/balance-sheet', { params }),
  cashFlow: (params?: object) => api.get('/accounting/cash-flow', { params }),
  trialBalance: (params?: object) => api.get('/accounting/trial-balance', { params }),
  ratios: (params?: object) => api.get('/accounting/ratios', { params }),
};

export const reportsApi = {
  kpis: () => api.get('/reports/kpis'),
  impact: () => api.get('/reports/impact'),
  complianceSummary: () => api.get('/reports/compliance-summary'),
  farmerPayments: (params?: object) => api.get('/reports/farmer-payments', { params }),
  premiumFund: (params?: object) => api.get('/reports/premium-fund', { params }),
  flocertAuditPack: (params?: object) => api.get('/reports/flocert-audit-pack', { params }),
};
export const integrationsApi = {
  createAiRecord: (data: object) => api.post('/integrations/ai-records', data),
  aiRecords: (params?: object) => api.get('/integrations/ai-records', { params }),
};
export const buyerPortalApi = { profile: () => api.get('/buyer-portal/profile'), dashboard: () => api.get('/buyer-portal/dashboard'), traceability: (reference: string) => api.get(`/buyer-portal/traceability/${encodeURIComponent(reference)}`) };
export const governanceApi = {
  votes: () => api.get('/governance/votes'), createVote: (data: object) => api.post('/governance/votes', data),
  openVote: (id: string) => api.post(`/governance/votes/${id}/open`), closeVote: (id: string) => api.post(`/governance/votes/${id}/close`),
  respond: (voteId: string, optionId: string) => api.post(`/governance/votes/${voteId}/respond/${optionId}`),
  results: (id: string) => api.get(`/governance/votes/${id}/results`), projects: () => api.get('/governance/projects'), createProject: (data: object) => api.post('/governance/projects', data), updateProject: (id: string, data: object) => api.patch(`/governance/projects/${id}`, data), removeProject: (id: string) => api.delete(`/governance/projects/${id}`), meetings: () => api.get('/governance/meetings'), createMeeting: (data: object) => api.post('/governance/meetings', data), report: () => api.get('/governance/report'),
};
export const salesApi = { create: (data: object) => api.post('/sales', data), list: () => api.get('/sales'), settle: (id: string) => api.post(`/sales/${id}/settle`, {}), collect: (id: string, phoneNumber?: string) => api.post(`/sales/${id}/collect`, { phoneNumber }), approvePayouts: (id: string) => api.post(`/loans/sales/${id}/approve-payouts`), reconcilePayouts: (id: string) => api.post(`/loans/sales/${id}/reconcile-payouts`) };
export const buyersApi = { list: () => api.get('/buyers') };

// ── Inventory ──
export const inventoryApi = {
  getAll: (params?: object) => api.get('/inventory/records', { params }),
  receive: (data: object) => api.post('/inventory/records', data),
  createLot: (data: object) => api.post('/inventory/lots', data),
  lots: () => api.get('/inventory/lots'),
};

// ── Locations ──
export const locationsApi = {
  getRegions: () => api.get('/locations/regions'),
  getDistricts: (regionId: string) => api.get(`/locations/regions/${regionId}/districts`),
  getWards: (districtId: string) => api.get(`/locations/districts/${districtId}/wards`),
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
  approve: (id: string, data?: object) => api.post(`/memberships/${id}/approve`, data || {}),
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
