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
};

// ── Farmers ──
export const farmersApi = {
  getAll: (params?: object) => api.get('/farmers', { params }),
  getOne: (id: string) => api.get(`/farmers/${id}`),
  update: (id: string, data: object) => api.patch(`/farmers/${id}`, data),
};

// ── MAMCOS ──
export const mamcosApi = {
  getAll: () => api.get('/mamcos'),
  getOne: (id: string) => api.get(`/mamcos/${id}`),
  create: (data: object) => api.post('/mamcos', data),
  assignFarmer: (id: string, data: object) => api.post(`/mamcos/${id}/assign-farmer`, data),
  dashboard: () => api.get('/mamcos/secretary-dashboard'),
};

// ── Farms ──
export const farmsApi = {
  getAll: (params?: object) => api.get('/farms', { params }),
  getOne: (id: string) => api.get(`/farms/${id}`),
  create: (data: object) => api.post('/farms', data),
  updateBoundary: (id: string, data: object) => api.patch(`/farms/${id}/boundary`, data),
};

// ── Crop Cycles ──
export const cropCyclesApi = {
  getAll: (params?: object) => api.get('/crop-cycles', { params }),
  getOne: (id: string) => api.get(`/crop-cycles/${id}`),
  create: (data: object) => api.post('/crop-cycles', data),
  logActivity: (data: object) => api.post('/crop-cycles/activity', data),
};

// ── Finance ──
export const financeApi = {
  getCropCycleSummary: (id: string) => api.get(`/finance/crop-cycle/${id}/summary`),
  getFarmerSummary: (id: string) => api.get(`/finance/farmer/${id}/summary`),
  addCost: (data: object) => api.post('/finance/costs', data),
  addRevenue: (data: object) => api.post('/finance/revenue', data),
};

// ── Inventory ──
export const inventoryApi = {
  getAll: (params?: object) => api.get('/inventory', { params }),
  receive: (data: object) => api.post('/inventory/receive', data),
  createLot: (data: object) => api.post('/inventory/lots', data),
};

// ── Locations ──
export const locationsApi = {
  getRegions: () => api.get('/locations/regions'),
  getDistricts: (regionId: string) => api.get(`/locations/regions/${regionId}/districts`),
  getWards: (districtId: string) => api.get(`/locations/districts/${districtId}/wards`),
};

// ── Marketplace ──
export const marketplaceApi = {
  getLandListings: (params?: object) => api.get('/marketplace/land', { params }),
  createLandListing: (data: object) => api.post('/marketplace/land', data),
  getTractors: (params?: object) => api.get('/marketplace/tractors', { params }),
  bookTractor: (data: object) => api.post('/marketplace/tractors/book', data),
  getMarketPrices: (params?: object) => api.get('/marketplace/prices', { params }),
};

// ── AMCOS-first farm registry ──
export const registryApi = {
  list: (params?: object) => api.get('/farm-registry', { params }),
  preRegister: (data: object) => api.post('/farm-registry', data),
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
  listPlans: () => api.get('/memberships/plans'),
  createPlan: (data: object) => api.post('/memberships/plans', data),
  approve: (id: string, data?: object) => api.post(`/memberships/${id}/approve`, data || {}),
};

// ── Farm alerts ──
export const farmAlertsApi = {
  getAll: () => api.get('/farm-alerts'),
  generateAll: () => api.post('/farm-alerts/generate'),
};

// ── Rewards ──
export const rewardsApi = {
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
