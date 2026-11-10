import axios from 'axios';
import { APP_MODE } from '@/lib/app-mode';

// NOTE: the Nest backend mounts every route under the `api/v1` global
// prefix (see backend/src/main.ts), so NEXT_PUBLIC_API_URL must include it,
// e.g. http://localhost:3001/api/v1 — bare-host values 404 every call.
export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';

export const api = axios.create({
  baseURL: API_BASE_URL,
  // X-App-Mode tells the API which portal this is, so a farmer who is also staff acts as the right one.
  headers: { 'Content-Type': 'application/json', 'X-App-Mode': APP_MODE },
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
      const res = await axios.post(`${API_BASE_URL}/auth/refresh`, { refreshToken }, { headers: { 'X-App-Mode': APP_MODE } });
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
  /** Super Admin: register the administrator who manages one cooperative's roles and staff. */
  createCooperativeAdmin: (data: object) => api.post('/auth/cooperative-admin', data),
  /** Current-session profile: role, custom role, flattened permissions. */
  me: () => api.get('/auth/me'),
  changePassword: (currentPassword: string, newPassword: string) =>
    api.post('/auth/change-password', { currentPassword, newPassword }),
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
  myStatement: () => api.get('/farmers/me/statement'),
  getByControlNumber: (controlNumber: string) => api.get(`/farmers/control-number/${encodeURIComponent(controlNumber)}`),
  create: (data: object) => api.post('/farmers', data),
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
export const fieldOfficersApi = {
  list: () => api.get('/field-officers'),
  getOne: (id: string) => api.get(`/field-officers/${id}`),
  create: (data: object) => api.post('/field-officers', data),
  resendCredentials: (id: string) => api.post(`/field-officers/${id}/resend-credentials`),
  update: (id: string, data: object) => api.patch(`/field-officers/${id}`, data),
  assign: (id: string, data: { farmerIds?: string[]; farmIds?: string[]; unassign?: boolean }) => api.post(`/field-officers/${id}/assign`, data),
  unassigned: () => api.get('/field-officers/unassigned'),
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
  deletePhoto: (photoId: string) => api.delete(`/farms/photos/${photoId}`),
};
export const plotsApi = {
  byFarm: (farmId: string) => api.get(`/plots/farm/${farmId}`),
  create: (data: object) => api.post('/plots', data),
  update: (id: string, data: object) => api.patch(`/plots/${id}`, data),
  remove: (id: string) => api.delete(`/plots/${id}`),
};
export const uploadsApi = {
  upload: (file: File) => {
    const body = new FormData();
    body.append('file', file);
    return api.post<{ url: string }>('/uploads', body);
  },
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
  farmingHistory: (id: string) => api.get(`/crop-cycles/${id}/farming-history`),
  getByFarmId: (farmId: string) => api.get(`/crop-cycles/farm/${farmId}`),
  create: (data: object) => api.post('/crop-cycles', data),
  update: (id: string, data: object) => api.patch(`/crop-cycles/${id}`, data),
  logActivity: (data: object) => api.post('/crop-cycles/activity', data),
  calendar: (params?: object) => api.get('/crop-cycles/calendar', { params }),
  activityLogs: (params?: object) => api.get('/crop-cycles/activity-logs', { params }),
  getActivityLog: (id: string) => api.get(`/crop-cycles/activity/${id}`),
  updateActivityLog: (id: string, data: object) => api.patch(`/crop-cycles/activity/${id}`, data),
  deleteActivityLog: (id: string) => api.delete(`/crop-cycles/activity/${id}`),
};
export const riceProtocolsApi = {
  platformActive: (varietyId?: string) => api.get('/rice-protocols/platform/active', { params: varietyId ? { varietyId } : undefined }),
  /** `varietyId` omitted = the default calendar used by varieties that have none of their own. */
  platformVersions: (varietyId?: string) => api.get('/rice-protocols/platform', { params: varietyId ? { varietyId } : undefined }),
  platformBootstrap: (varietyId?: string, copyFrom?: string) =>
    api.post('/rice-protocols/platform/bootstrap', undefined, { params: { ...(varietyId ? { varietyId } : {}), ...(copyFrom ? { copyFrom } : {}) } }),
  upcoming: (mamcosId: string) => api.get(`/rice-protocols/mamcos/${mamcosId}/upcoming`),
  bootstrap: (mamcosId: string) => api.post(`/rice-protocols/mamcos/${mamcosId}/bootstrap`),
  list: (mamcosId: string) => api.get(`/rice-protocols/mamcos/${mamcosId}`),
  update: (id: string, data: object) => api.patch(`/rice-protocols/${id}`, data),
  tasks: (cropCycleId: string) => api.get(`/rice-protocols/crop-cycles/${cropCycleId}/tasks`),
  readiness: (cropCycleId: string, params?: { includeWarehouse?: boolean }) => api.get(`/rice-protocols/crop-cycles/${cropCycleId}/readiness`, { params }),
  rescheduleTask: (id: string, data: { dueDate: string; reason?: string }) => api.patch(`/rice-protocols/tasks/${id}/schedule`, data),
  completeTask: (id: string, data: object) => api.post(`/rice-protocols/tasks/${id}/complete`, data),
};

export const riceVarietiesApi = {
  list: (includeInactive = false) => api.get('/rice-varieties', { params: includeInactive ? { includeInactive: true } : undefined }),
  create: (data: object) => api.post('/rice-varieties', data),
  update: (id: string, data: object) => api.patch(`/rice-varieties/${id}`, data),
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
  generateReport: (data: object) => api.post('/accounting/report-exports', data),
  reportArchive: (params?: object) => api.get('/accounting/report-exports', { params }),
  downloadReport: (id: string) => api.get(`/accounting/report-exports/${id}/download`, { responseType: 'blob' }),
  profitLoss: (params?: object) => api.get('/accounting/profit-loss', { params }),
  balanceSheet: (params?: object) => api.get('/accounting/balance-sheet', { params }),
  cashFlow: (params?: object) => api.get('/accounting/cash-flow', { params }),
  trialBalance: (params?: object) => api.get('/accounting/trial-balance', { params }),
  accountBalances: (params?: object) => api.get('/accounting/account-balances', { params }),
  journalEntries: (params?: object) => api.get('/accounting/journal-entries', { params }),
  reverseJournal: (journalId: string, data: { reason: string; date?: string }) => api.post(`/accounting/journal-entries/${journalId}/reverse`, data),
  createJournalEntry: (data: object) => api.post('/accounting/journal-entries', data),
  ratios: (params?: object) => api.get('/accounting/ratios', { params }),
  accounts: () => api.get('/accounting/accounts'),
  farmerLiabilities: () => api.get('/accounting/farmer-liabilities'),
  farmerOwed: () => api.get('/accounting/farmer-accounts'),
  farmerStatement: (params: { farmerId?: string; seller?: string }) => api.get('/accounting/farmer-accounts/statement', { params }),
  farmerPayouts: () => api.get('/accounting/farmer-payouts'),
  payFarmer: (data: object) => api.post('/accounting/farmer-payouts', data),
  voidFarmerPayout: (id: string, reason: string) => api.post(`/accounting/farmer-payouts/${id}/void`, { reason }),
  memberContributions: () => api.get('/accounting/member-contributions'),
  createMemberContribution: (data: object) => api.post('/accounting/member-contributions', data),
  reserves: () => api.get('/accounting/reserves'),
  createReserveAllocation: (data: object) => api.post('/accounting/reserves', data),
  createInvoice: (data: object) => api.post('/accounting/invoices', data),
  createBill: (data: object) => api.post('/accounting/bills', data),
  payBill: (id: string, cashAccountId?: string) => api.post(`/accounting/bills/${id}/pay`, { cashAccountId }),
  voidBill: (id: string) => api.post(`/accounting/bills/${id}/void`),
  payInvoice: (id: string, cashAccountId?: string) => api.post(`/accounting/invoices/${id}/pay`, { cashAccountId }),
  voidInvoice: (id: string) => api.post(`/accounting/invoices/${id}/void`),
  // Closing the books
  periodLock: () => api.get('/accounting/period-lock'),
  periodLockCheck: (through: string) => api.get('/accounting/period-lock/check', { params: { through } }),
  closeBooks: (through: string) => api.post('/accounting/period-lock/close', { through }),
  reopenBooks: (data: { to?: string; reason: string }) => api.post('/accounting/period-lock/reopen', data),
  // Bank and mobile-money reconciliation
  reconciliationSummary: (asOf?: string) => api.get('/accounting/reconciliation/summary', { params: { asOf } }),
  bankStatements: () => api.get('/accounting/reconciliation/statements'),
  createBankStatement: (data: object) => api.post('/accounting/reconciliation/statements', data),
  bankStatement: (id: string) => api.get(`/accounting/reconciliation/statements/${id}`),
  autoMatchStatement: (id: string) => api.post(`/accounting/reconciliation/statements/${id}/auto-match`),
  reconcileStatement: (id: string) => api.post(`/accounting/reconciliation/statements/${id}/reconcile`),
  reopenStatement: (id: string) => api.post(`/accounting/reconciliation/statements/${id}/reopen`),
  deleteStatement: (id: string) => api.delete(`/accounting/reconciliation/statements/${id}`),
  matchLine: (lineId: string, ledgerEntryId: string) => api.post(`/accounting/reconciliation/lines/${lineId}/match`, { ledgerEntryId }),
  unmatchLine: (lineId: string) => api.post(`/accounting/reconciliation/lines/${lineId}/unmatch`),
  adjustLine: (lineId: string, data: { accountId: string; description?: string }) => api.post(`/accounting/reconciliation/lines/${lineId}/adjust`, data),
  // Everyday expenses and income
  cashAccounts: (params?: object) => api.get('/accounting/cash-accounts', { params }),
  createCashAccount: (data: object) => api.post('/accounting/cash-accounts', data),
  updateCashAccount: (id: string, data: object) => api.patch(`/accounting/cash-accounts/${id}`, data),
  cashTransfers: () => api.get('/accounting/cash-accounts/transfers'),
  createCashTransfer: (data: object) => api.post('/accounting/cash-accounts/transfers', data),
  cancelCashTransfer: (id: string, reason: string) => api.post(`/accounting/cash-accounts/transfers/${id}/cancel`, { reason }),
  cashBook: (params?: object) => api.get('/accounting/cash-book', { params }),
  cashTransactions: (params?: object) => api.get('/accounting/cash-transactions', { params }),
  cashCategories: (kind: 'EXPENSE' | 'INCOME') => api.get('/accounting/cash-transactions/categories', { params: { kind } }),
  createCashTransaction: (data: object) => api.post('/accounting/cash-transactions', data),
  voidCashTransaction: (id: string, reason: string) => api.post(`/accounting/cash-transactions/${id}/void`, { reason }),
  // VAT and withholding tax
  taxSettings: () => api.get('/accounting/tax/settings'),
  updateTaxSettings: (data: object) => api.patch('/accounting/tax/settings', data),
  vatReturn: (from: string, to: string) => api.get('/accounting/tax/vat-return', { params: { from, to } }),
  settleVat: (data: object) => api.post('/accounting/tax/vat-settlement', data),
  remitWithholding: (data: object) => api.post('/accounting/tax/withholding-remittance', data),
  receivables: () => api.get('/accounting/receivables'),
  payables: () => api.get('/accounting/payables'),
  createBudget: (data: object) => api.post('/accounting/budgets', data),
  listBudgets: () => api.get('/accounting/budgets'),
  getBudget: (id: string) => api.get(`/accounting/budgets/${id}`),
  budgetActual: (id: string) => api.get(`/accounting/budgets/${id}/actual`),
  approveBudget: (id: string) => api.post(`/accounting/budgets/${id}/approve`),
  approvedAllocations: () => api.get('/accounting/approved-allocations'),
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
  farmingHistoryForClaim: (id: string) => api.get(`/insurance/claims/${id}/farming-history`),
  coverageSummary: () => api.get('/insurance/coverage-summary'),
  recordPolicyPremium: (id: string, data: object) => api.post(`/insurance/policies/${id}/premium`, data),
  decideClaim: (id: string, data: object) => api.patch(`/insurance/claims/${id}/decision`, data),
  products: () => api.get('/insurance/products'),
  insurers: () => api.get('/insurance/insurers'),
  risk: (params: object) => api.get('/insurance/risk', { params }),
  suggestion: (params: object) => api.get('/insurance/suggestion', { params }),
  applications: (params?: object) => api.get('/insurance/applications', { params }),
  application: (id: string) => api.get(`/insurance/applications/${id}`),
  submitApplication: (data: object) => api.post('/insurance/applications', data),
  withdrawApplication: (id: string) => api.patch(`/insurance/applications/${id}/withdraw`),
  reviewApplication: (id: string) => api.patch(`/insurance/applications/${id}/review`),
  approveApplication: (id: string, data: object) => api.patch(`/insurance/applications/${id}/approve`, data),
  rejectApplication: (id: string, note: string) => api.patch(`/insurance/applications/${id}/reject`, { note }),
  recordApplicationPremium: (id: string, data: object) => api.post(`/insurance/applications/${id}/premium`, data),
  deskMe: () => api.get('/insurance/desk/me'),
  deskPolicies: () => api.get('/insurance/desk/policies'),
  deskClaims: () => api.get('/insurance/desk/claims'),
  deskSummary: () => api.get('/insurance/desk/summary'),
};
export const weatherApi = {
  forecast: (lat: number, lon: number) => api.get('/weather/forecast', { params: { lat, lon } }),
  getAlerts: () => api.get('/weather/alerts'),
  createAlert: (data: object) => api.post('/weather/alerts', data),
  alerts: (params?: object) => api.get('/weather/alerts', { params }),
  updateAlert: (id: string, data: object) => api.patch(`/weather/alerts/${id}`, data),
  sendAlert: (id: string) => api.post(`/weather/alerts/${id}/send`),
  dismissAlert: (id: string) => api.post(`/weather/alerts/${id}/dismiss`),
  deliveries: (id: string) => api.get(`/weather/alerts/${id}/deliveries`),
  areas: () => api.get('/weather/areas'),
  rainfall: (lat: number, lon: number) => api.get('/weather/rainfall', { params: { lat, lon } }),
  runCheck: () => api.post('/weather/check'),
  advice: () => api.get('/weather/advice/me'),
  preferences: () => api.get('/weather/preferences/me'),
  setWhatsapp: (whatsappOptIn: boolean) => api.patch('/weather/preferences/me', { whatsappOptIn }),
  setFarmerWhatsapp: (farmerId: string, whatsappOptIn: boolean) => api.patch(`/weather/preferences/farmer/${farmerId}`, { whatsappOptIn }),
};
export const reportsApi = {
  kpis: () => api.get('/reports/kpis'),
  riceOverview: () => api.get('/reports/rice-overview'),
  impact: () => api.get('/reports/impact'),
  complianceSummary: () => api.get('/reports/compliance-summary'),
  farmerPayments: (params?: object) => api.get('/reports/farmer-payments', { params }),
  createPremiumExpense: (data: object) => api.post('/reports/premium-fund/entries', { ...data, entryType: 'EXPENSE' }),
  premiumFund: (params?: object) => api.get('/reports/premium-fund', { params }),
  flocertAuditPack: (params?: object) => api.get('/reports/flocert-audit-pack', { params }),
  farmers: (params?: object) => api.get('/reports/farmers', { params }),
  cropCycles: (params?: object) => api.get('/reports/crop-cycles', { params }),
  fieldOfficerPerformance: (params?: object) => api.get('/reports/field-officer-performance', { params }),
  insuranceCoverage: (params?: object) => api.get('/reports/insurance-coverage', { params }),
  genderYouthInclusion: (params?: object) => api.get('/reports/gender-youth-inclusion', { params }),
  catalog: () => api.get('/reports/catalog'),
  filterOptions: () => api.get('/reports/filter-options'),
  analytics: (key: string, params?: object) => api.get(`/reports/analytics/${key}`, { params }),
  downloadAnalytics: (key: string, params?: object) => api.get(`/reports/analytics/${key}`, { params, responseType: 'blob' }),
  builderSchema: () => api.get('/reports/builder/schema'),
  runBuilder: (payload: object) => api.post('/reports/builder', payload),
  downloadBuilder: (payload: object) => api.post('/reports/builder', payload, { responseType: 'blob' }),
  download: (path: string, params?: object) => api.get(path, { params, responseType: 'blob' }),
};
export const integrationsApi = {
  catalog: () => api.get('/integrations/ai-catalog'),
  insights: () => api.get('/integrations/insights'),
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
export const warehousesApi = {
  list: () => api.get('/warehouses'),
  create: (data: object) => api.post('/warehouses', data),
  update: (id: string, data: object) => api.patch(`/warehouses/${id}`, data),
  assignKeeper: (id: string, userId: string) => api.post(`/warehouses/${id}/keepers`, { userId }),
  removeKeeper: (id: string, userId: string) => api.delete(`/warehouses/${id}/keepers/${userId}`),
  receive: (id: string, data: object) => api.post(`/warehouses/${id}/receive`, data),
  adjust: (id: string, data: object) => api.post(`/warehouses/${id}/adjust`, data),
  makeLot: (id: string, data: object) => api.post(`/warehouses/${id}/lots`, data),
  movements: (id: string) => api.get(`/warehouses/${id}/movements`),
  unreceived: () => api.get('/warehouses/unreceived-records'),
};
export const saleOrdersApi = {
  list: (params?: { status?: string; q?: string }) => api.get('/sale-orders', { params }),
  lots: (warehouseId: string) => api.get('/sale-orders/lots', { params: { warehouseId } }),
  get: (id: string) => api.get(`/sale-orders/${id}`),
  lookup: (reference: string) => api.get(`/sale-orders/lookup/${encodeURIComponent(reference.trim())}`),
  reserve: (data: object) => api.post('/sale-orders', data),
  cancel: (id: string, reason: string) => api.post(`/sale-orders/${id}/cancel`, { reason }),
  confirm: (id: string, note?: string) => api.post(`/sale-orders/${id}/confirm`, { note }),
  approve: (id: string, data: object) => api.post(`/sale-orders/${id}/approve`, data),
  loadTruck: (id: string, data: object) => api.post(`/sale-orders/${id}/loads`, data),
  loadStatus: (id: string, loadId: string, data: object) => api.post(`/sale-orders/${id}/loads/${loadId}/status`, data),
  closeShort: (id: string, reason: string) => api.post(`/sale-orders/${id}/close-short`, { reason }),
  complete: (id: string) => api.post(`/sale-orders/${id}/complete`, {}),
};
export const auditLogsApi = {
  list: (params?: object) => api.get('/audit-logs', { params }),
};
export const buyersApi = {
  list: () => api.get('/buyers'),
  create: (data: object) => api.post('/buyers', data),
  update: (id: string, data: object) => api.patch(`/buyers/${id}`, data),
  remove: (id: string) => api.delete(`/buyers/${id}`),
};
export const buyerOrdersApi = {
  getAll: () => api.get('/buyer-orders'),
  getForBuyer: (buyerId: string) => api.get(`/buyer-orders/buyer/${buyerId}`),
  create: (data: object) => api.post('/buyer-orders', data),
  update: (id: string, data: object) => api.patch(`/buyer-orders/${id}`, data),
  updateStatus: (id: string, status: string) => api.patch(`/buyer-orders/${id}/status`, { status }),
  remove: (id: string) => api.delete(`/buyer-orders/${id}`),
};
export const agreementsApi = {
  list: (params?: object) => api.get('/purchase-agreements', { params }),
  create: (data: object) => api.post('/purchase-agreements', data),
  update: (id: string, data: object) => api.patch(`/purchase-agreements/${id}`, data),
  setStatus: (id: string, status: string) => api.patch(`/purchase-agreements/${id}/status`, { status }),
  remove: (id: string) => api.delete(`/purchase-agreements/${id}`),
};
export const creditApi = {
  lenders: () => api.get('/credit/lenders'),
  summary: () => api.get('/credit/summary'),
  applications: (params?: object) => api.get('/credit/applications', { params }),
  application: (id: string) => api.get(`/credit/applications/${id}`),
  applicationProfile: (id: string) => api.get(`/credit/applications/${id}/profile`),
  farmerProfile: (farmerId: string) => api.get(`/credit/farmers/${farmerId}/profile`),
  submit: (data: object) => api.post('/credit/applications', data),
  withdraw: (id: string) => api.patch(`/credit/applications/${id}/withdraw`),
  review: (id: string) => api.patch(`/credit/applications/${id}/review`),
  approve: (id: string, data: object) => api.patch(`/credit/applications/${id}/approve`, data),
  reject: (id: string, note: string) => api.patch(`/credit/applications/${id}/reject`, { note }),
  disburse: (id: string, data: object) => api.patch(`/credit/applications/${id}/disburse`, data),
  loans: () => api.get('/credit/loans'),
  schedule: (loanId: string) => api.get(`/credit/loans/${loanId}/schedule`),
};
export const opsApi = {
  // catalogue and customers
  products: (params?: object) => api.get('/ops/products', { params }),
  saveProduct: (data: object, id?: string) => (id ? api.patch(`/ops/products/${id}`, data) : api.post('/ops/products', data)),
  customers: (params?: object) => api.get('/ops/customers', { params }),
  customer: (id: string) => api.get(`/ops/customers/${id}`),
  saveCustomer: (data: object, id?: string) => (id ? api.patch(`/ops/customers/${id}`, data) : api.post('/ops/customers', data)),
  // sales
  deliveryFee: () => api.get('/ops/sales/delivery-fee'),
  availability: (productIds: string[]) => api.get('/ops/sales/availability', { params: { productIds: productIds.join(',') } }),
  quotations: (params?: object) => api.get('/ops/sales/quotations', { params }),
  quotation: (id: string) => api.get(`/ops/sales/quotations/${id}`),
  saveQuotation: (data: object, id?: string) => (id ? api.patch(`/ops/sales/quotations/${id}`, data) : api.post('/ops/sales/quotations', data)),
  quotationStatus: (id: string, status: string) => api.post(`/ops/sales/quotations/${id}/status`, { status }),
  orders: (params?: object) => api.get('/ops/sales/orders', { params }),
  order: (id: string) => api.get(`/ops/sales/orders/${id}`),
  createOrder: (data: object) => api.post('/ops/sales/orders', data),
  updateOrder: (id: string, data: object) => api.patch(`/ops/sales/orders/${id}`, data),
  resubmitOrder: (id: string) => api.post(`/ops/sales/orders/${id}/resubmit`),
  cancelOrder: (id: string, reason: string) => api.post(`/ops/sales/orders/${id}/cancel`, { reason }),
  reviewOrder: (id: string, decision: 'APPROVE' | 'RETURN', comment?: string) => api.post(`/ops/sales/orders/${id}/review`, { decision, comment }),
  // billing
  invoices: (params?: object) => api.get('/ops/billing/invoices', { params }),
  invoice: (id: string) => api.get(`/ops/billing/invoices/${id}`),
  issueInvoice: (orderId: string, data: object) => api.post(`/ops/billing/orders/${orderId}/invoice`, data),
  voidInvoice: (id: string, reason: string) => api.post(`/ops/billing/invoices/${id}/void`, { reason }),
  invoiceShared: (id: string) => api.post(`/ops/billing/invoices/${id}/shared`),
  invoicePdf: (id: string) => api.get(`/ops/billing/invoices/${id}/pdf`, { responseType: 'blob' }),
  setControlNumber: (id: string, controlNumber: string) => api.post(`/ops/billing/invoices/${id}/control-number`, { controlNumber }),
  requestControlNumber: (id: string) => api.post(`/ops/billing/invoices/${id}/control-number/request`),
  payments: (params?: object) => api.get('/ops/billing/payments', { params }),
  recordPayment: (invoiceId: string, data: object) => api.post(`/ops/billing/invoices/${invoiceId}/payments`, data),
  mobilePayment: (invoiceId: string, data: object) => api.post(`/ops/billing/invoices/${invoiceId}/mobile-payment`, data),
  reconcilePayment: (id: string) => api.post(`/ops/billing/payments/${id}/reconcile`),
  confirmPayment: (id: string) => api.post(`/ops/billing/payments/${id}/confirm`),
  rejectPayment: (id: string, reason: string) => api.post(`/ops/billing/payments/${id}/reject`, { reason }),
  authorize: (orderId: string, overrideReason?: string) => api.post(`/ops/billing/orders/${orderId}/authorize`, { overrideReason }),
  revoke: (orderId: string, reason: string) => api.post(`/ops/billing/orders/${orderId}/revoke`, { reason }),
  // warehouse
  lookups: () => api.get('/ops/warehouse/lookups'),
  searchFarmers: (q: string) => api.get('/ops/warehouse/farmers', { params: { q } }),
  farmerRecords: (id: string) => api.get(`/ops/warehouse/farmers/${id}/records`),
  harvestOptions: (farmId?: string) => api.get('/ops/warehouse/harvest-options', { params: { farmId } }),
  receipts: (params?: object) => api.get('/ops/warehouse/receipts', { params }),
  receipt: (id: string) => api.get(`/ops/warehouse/receipts/${id}`),
  createReceipt: (data: object) => api.post('/ops/warehouse/receipts', data),
  confirmReceipt: (id: string) => api.post(`/ops/warehouse/receipts/${id}/confirm`),
  cancelReceipt: (id: string, reason: string) => api.post(`/ops/warehouse/receipts/${id}/cancel`, { reason }),
  batches: (params?: object) => api.get('/ops/warehouse/stock/batches', { params }),
  position: (params?: object) => api.get('/ops/warehouse/stock/position', { params }),
  stockSummary: () => api.get('/ops/warehouse/stock/summary'),
  ledger: (params?: object) => api.get('/ops/warehouse/stock/ledger', { params }),
  adjustStock: (data: object) => api.post('/ops/warehouse/stock/adjust', data),
  valuation: () => api.get('/ops/warehouse/stock/valuation'),
  setOpeningValue: (batchId: string, unitCost: number) => api.post(`/ops/warehouse/stock/batches/${batchId}/opening-value`, { unitCost }),
  setBatchStatus: (id: string, data: object) => api.post(`/ops/warehouse/stock/batches/${id}/status`, data),
  stockCounts: () => api.get('/ops/warehouse/stock/counts'),
  stockCount: (id: string) => api.get(`/ops/warehouse/stock/counts/${id}`),
  createStockCount: (data: object) => api.post('/ops/warehouse/stock/counts', data),
  updateStockCountLine: (id: string, lineId: string, data: object) => api.patch(`/ops/warehouse/stock/counts/${id}/lines/${lineId}`, data),
  submitStockCount: (id: string) => api.post(`/ops/warehouse/stock/counts/${id}/submit`),
  approveStockCount: (id: string) => api.post(`/ops/warehouse/stock/counts/${id}/approve`),
  reverseEntry: (id: string, reason: string) => api.post(`/ops/warehouse/stock/ledger/${id}/reverse`, { reason }),
  transfers: () => api.get('/ops/warehouse/stock/transfers'),
  sendTransfer: (data: object) => api.post('/ops/warehouse/stock/transfers', data),
  receiveTransfer: (id: string, receivedKg: number, note?: string) => api.post(`/ops/warehouse/stock/transfers/${id}/receive`, { receivedKg, note }),
  runs: (params?: object) => api.get('/ops/warehouse/processing', { params }),
  run: (id: string) => api.get(`/ops/warehouse/processing/${id}`),
  createRun: (data: object) => api.post('/ops/warehouse/processing', data),
  reverseRun: (id: string, reason: string) => api.post(`/ops/warehouse/processing/${id}/reverse`, { reason }),
  yieldReport: (params?: object) => api.get('/ops/warehouse/processing/yield', { params }),
  trace: (ref: string) => api.get('/ops/warehouse/trace', { params: { ref } }),
  // dispatch
  dispatchQueue: () => api.get('/ops/dispatch/queue'),
  prepareView: (orderId: string) => api.get(`/ops/dispatch/orders/${orderId}`),
  allocate: (orderId: string, data: object) => api.post(`/ops/dispatch/orders/${orderId}/allocate`, data),
  releaseAllocation: (id: string) => api.post(`/ops/dispatch/allocations/${id}/release`),
  reportShortage: (orderId: string, note: string) => api.post(`/ops/dispatch/orders/${orderId}/shortage`, { note }),
  closeShort: (orderId: string, reason: string) => api.post(`/ops/dispatch/orders/${orderId}/close-short`, { reason }),
  prepareDispatch: (orderId: string, data: object) => api.post(`/ops/dispatch/orders/${orderId}/prepare`, data),
  dispatches: (params?: object) => api.get('/ops/dispatch/dispatches', { params }),
  dispatch: (id: string) => api.get(`/ops/dispatch/dispatches/${id}`),
  releaseDispatch: (id: string) => api.post(`/ops/dispatch/dispatches/${id}/release`),
  cancelDispatch: (id: string, reason: string) => api.post(`/ops/dispatch/dispatches/${id}/cancel`, { reason }),
  recordDelivery: (id: string, data: object) => api.post(`/ops/dispatch/dispatches/${id}/delivery`, data),
  releaseNotePdf: (id: string) => api.get(`/ops/dispatch/dispatches/${id}/release-note.pdf`, { responseType: 'blob' }),
  shareDispatch: (id: string) => api.get(`/ops/dispatch/dispatches/${id}/share`),
  // farm
  farms: (params?: object) => api.get('/ops/farm/farms', { params }),
  farm: (id: string) => api.get(`/ops/farm/farms/${id}`),
  createFarm: (data: object) => api.post('/ops/farm/farms', data),
  updateFarm: (id: string, data: object) => api.patch(`/ops/farm/farms/${id}`, data),
  addPlot: (farmId: string, data: object) => api.post(`/ops/farm/farms/${farmId}/plots`, data),
  newCropCycle: (data: object) => api.post('/ops/farm/crop-cycles', data),
  assignees: () => api.get('/ops/farm/assignees'),
  tasks: (params?: object) => api.get('/ops/farm/tasks', { params }),
  task: (id: string) => api.get(`/ops/farm/tasks/${id}`),
  createTask: (data: object) => api.post('/ops/farm/tasks', data),
  createInspection: (data: object) => api.post('/ops/farm/inspections', data),
  cancelTask: (id: string, reason: string) => api.post(`/ops/farm/tasks/${id}/cancel`, { reason }),
  reviewTask: (id: string, data: object) => api.post(`/ops/farm/tasks/${id}/review`, data),
  attendance: (params?: object) => api.get('/ops/farm/attendance', { params }),
  employeeSummary: (params?: object) => api.get('/ops/farm/employee-summary', { params }),
  myTasks: (params?: object) => api.get('/ops/farm/my-tasks', { params }),
  myTask: (id: string) => api.get(`/ops/farm/my-tasks/${id}`),
  myInputs: () => api.get('/ops/farm/my-tasks/inputs'),
  acknowledgeTask: (id: string) => api.post(`/ops/farm/my-tasks/${id}/acknowledge`),
  checkIn: (id: string, data: object) => api.post(`/ops/farm/my-tasks/${id}/check-in`, data),
  startWithoutGps: (id: string, reason: string) => api.post(`/ops/farm/my-tasks/${id}/start-without-gps`, { reason }),
  submitReport: (id: string, data: object) => api.post(`/ops/farm/my-tasks/${id}/report`, data),
  submitInspection: (id: string, data: object) => api.post(`/ops/farm/my-tasks/${id}/inspection`, data),
  inputs: () => api.get('/ops/farm/inputs'),
  saveInput: (data: object, id?: string) => (id ? api.patch(`/ops/farm/inputs/${id}`, data) : api.post('/ops/farm/inputs', data)),
  stockInInput: (id: string, quantity: number, note?: string) => api.post(`/ops/farm/inputs/${id}/stock-in`, { quantity, note }),
  adjustInput: (id: string, quantity: number, reason: string) => api.post(`/ops/farm/inputs/${id}/adjust`, { quantity, reason }),
  inputMovements: (params?: object) => api.get('/ops/farm/input-movements', { params }),
  harvests: (params?: object) => api.get('/ops/farm/harvests', { params }),
  createHarvest: (data: object) => api.post('/ops/farm/harvests', data),
  declareTransport: (id: string, transportedKg: number, note?: string) => api.post(`/ops/farm/harvests/${id}/transport`, { transportedKg, note }),
  // dashboards, reports, setup
  reportCatalog: () => api.get('/ops/reports/catalog'),
  commercialDashboard: (params?: object) => api.get('/ops/reports/dashboard/commercial', { params }),
  farmDashboard: (params?: object) => api.get('/ops/reports/dashboard/farm', { params }),
  runReport: (key: string, params?: object) => api.get(`/ops/reports/run/${key}`, { params }),
  downloadReport: (key: string, params?: object) => api.get(`/ops/reports/run/${key}`, { params, responseType: 'blob' }),
};
export const marketApi = {
  overview: (params?: object) => api.get('/market/overview', { params }),
  deliveries: (params?: object) => api.get('/market/deliveries', { params }),
  farmerSales: (params?: object) => api.get('/market/farmer-sales', { params }),
  prices: (params?: object) => api.get('/market/prices', { params }),
  recordPrice: (data: object) => api.post('/market/prices', data),
};

// ── Inventory ──
export const inventoryApi = {
  mine: () => api.get('/inventory/records/mine'),
  mySummary: () => api.get('/inventory/summary/mine'),
  reportDelivery: (data: object) => api.post('/inventory/records/mine', data),
  getAll: (params?: object) => api.get('/inventory/records', { params }),
  receive: (data: object) => api.post('/inventory/records', data),
  updateStatus: (id: string, data: object) => api.patch(`/inventory/records/${id}/status`, data),
  createLot: (data: object) => api.post('/inventory/lots', data),
  lots: () => api.get('/inventory/lots'),
  getLot: (lotNumber: string) => api.get(`/inventory/lots/${encodeURIComponent(lotNumber)}`),
  dashboardSummary: (params?: object) => api.get('/inventory/dashboard-summary', { params }),
  getRecord: (id: string) => api.get(`/inventory/records/${id}`),
  updateRecord: (id: string, data: object) => api.patch(`/inventory/records/${id}`, data),
  recordPayment: (id: string, data: { amount: number }) => api.post(`/inventory/records/${id}/payments`, data),
  centres: () => api.get('/inventory/centres'),
  createCentre: (data: object) => api.post('/inventory/centres', data),
  updateCentre: (id: string, data: object) => api.patch(`/inventory/centres/${id}`, data),
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
  getSales: () => api.get('/settings/sales'),
  updateSales: (data: object) => api.put('/settings/sales', data),
  getCalendar: () => api.get('/settings/calendar'),
  updateCalendar: (data: object) => api.put('/settings/calendar', data),
  getTemplates: () => api.get('/settings/notification-templates'),
  createTemplate: (data: object) => api.post('/settings/notification-templates', data),
  updateTemplate: (id: string, data: object) => api.patch(`/settings/notification-templates/${id}`, data),
  removeTemplate: (id: string) => api.delete(`/settings/notification-templates/${id}`),
};

// ── Marketplace ──
export const marketplaceApi = {
  depositQuote: (id: string) => api.get(`/marketplace/land/${id}/quote`),
  /** Private deals: can I take this listing? OPEN, OWNER, GRANTED, NEEDS_CODE or EXPIRED_OR_TAKEN. */
  accessFor: (id: string) => api.get(`/marketplace/land/${id}/access`),
  redeemCode: (id: string, code: string) => api.post(`/marketplace/land/${id}/redeem-code`, { code }),
  regenerateCode: (id: string) => api.post(`/marketplace/land/${id}/regenerate-code`),
  managedListings: () => api.get('/marketplace/land/manage'),
  myTractorBookings: () => api.get('/marketplace/tractors/bookings/mine'),
  respondToCounter: (listingId: string, offerId: string, data: object) => api.patch(`/marketplace/land/${listingId}/offers/${offerId}/counter-response`, data),
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
  importSpreadsheet: (formData: FormData) =>
    api.post('/farm-registry/import', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
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
// ── Harvest fees: per-hectare rates (Manager-approved), opening a harvest for a block, and the clearance list ──
export const harvestApi = {
  structure: () => api.get('/harvest/structure'),
  rates: () => api.get('/harvest/rates'),
  proposeRate: (data: object) => api.post('/harvest/rates', data),
  decideRate: (id: string, data: object) => api.patch(`/harvest/rates/${id}/decision`, data),
  open: (data: object) => api.post('/harvest/open', data),
  clearance: (blockId: string, typeId?: string) => api.get(`/harvest/blocks/${blockId}/clearance`, { params: typeId ? { typeId } : undefined }),
  canalSummary: (canalId: string) => api.get(`/harvest/canals/${canalId}/summary`),
  // the gate: passes, arrivals, incidents
  lookupPass: (code: string) => api.get('/harvest/passes/lookup', { params: { code } }),
  usePass: (data: object) => api.post('/harvest/passes/use', data),
  holdPass: (id: string, reason: string) => api.post(`/harvest/passes/${id}/hold`, { reason }),
  releasePass: (id: string) => api.post(`/harvest/passes/${id}/release`),
  arrivals: (params?: object) => api.get('/harvest/arrivals', { params }),
  logArrival: (data: object) => api.post('/harvest/arrivals', data),
  depart: (id: string) => api.post(`/harvest/arrivals/${id}/depart`),
  incidents: (params?: object) => api.get('/harvest/incidents', { params }),
  reportIncident: (data: object) => api.post('/harvest/incidents', data),
  resolveIncident: (id: string, resolution: string) => api.post(`/harvest/incidents/${id}/resolve`, { resolution }),
  // ring-fencing and the daily reconciliation
  split: () => api.get('/harvest/fund-split'),
  setSplit: (maintenancePercent: number) => api.put('/harvest/fund-split', { maintenancePercent }),
  reconciliation: (day?: string) => api.get('/harvest/reconciliation', { params: day ? { day } : undefined }),
  reconcile: (day: string, note?: string) => api.post('/harvest/reconciliation', { day, note }),
};

// ── The cooperative's record of farms rented through M-LAX (never carries prices) ──
export const amcosRentalsApi = {
  list: (params?: object) => api.get('/amcos-rentals', { params }),
  get: (id: string) => api.get(`/amcos-rentals/${id}`),
  forHectare: (hectareId: string) => api.get(`/amcos-rentals/hectare/${hectareId}`),
  saveWitnessNote: (id: string, note: string) => api.put(`/amcos-rentals/${id}/witness-note`, { note }),
  raiseDispute: (id: string, data: object) => api.post(`/amcos-rentals/${id}/disputes`, data),
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

export const irrigationApi = {
  overview: (params?: object) => api.get('/irrigation/overview', { params }),
  allocationOverview: (params?: object) => api.get('/irrigation/allocation-overview', { params }),
  leadershipOverview: (params?: object) => api.get('/irrigation/leadership-overview', { params }),
  schemes: (params?: object) => api.get('/irrigation/schemes', { params }),
  scheme: (id: string) => api.get(`/irrigation/schemes/${id}`),
  createScheme: (data: object) => api.post('/irrigation/schemes', data),
  updateScheme: (id: string, data: object) => api.patch(`/irrigation/schemes/${id}`, data),
  schemeHistory: (id: string) => api.get(`/irrigation/schemes/${id}/history`),
  canals: (params?: object) => api.get('/irrigation/canals', { params }),
  canal: (id: string) => api.get(`/irrigation/canals/${id}`),
  createCanal: (data: object) => api.post('/irrigation/canals', data),
  updateCanal: (id: string, data: object) => api.patch(`/irrigation/canals/${id}`, data),
  archiveCanal: (id: string) => api.post(`/irrigation/canals/${id}/archive`),
  restoreCanal: (id: string) => api.post(`/irrigation/canals/${id}/restore`),
  canalHistory: (id: string) => api.get(`/irrigation/canals/${id}/history`),
  blocks: (params?: object) => api.get('/irrigation/blocks', { params }),
  block: (id: string) => api.get(`/irrigation/blocks/${id}`),
  createBlock: (data: object) => api.post('/irrigation/blocks', data),
  updateBlock: (id: string, data: object) => api.patch(`/irrigation/blocks/${id}`, data),
  archiveBlock: (id: string) => api.post(`/irrigation/blocks/${id}/archive`),
  restoreBlock: (id: string) => api.post(`/irrigation/blocks/${id}/restore`),
  initializeHectares: (id: string) => api.post(`/irrigation/blocks/${id}/initialize-hectares`),
  blockHistory: (id: string) => api.get(`/irrigation/blocks/${id}/history`),
  hectares: (params?: object) => api.get('/irrigation/hectares', { params }),
  hectare: (id: string) => api.get(`/irrigation/hectares/${id}`),
  emancipations: (params?: object) => api.get('/irrigation/emancipations', { params }),
  requestEmancipation: (data: object) => api.post('/irrigation/emancipations', data),
  approveEmancipation: (id: string, data: object = {}) => api.post(`/irrigation/emancipations/${id}/approve`, data),
  rejectEmancipation: (id: string, data: object) => api.post(`/irrigation/emancipations/${id}/reject`, data),
  allocations: (params?: object) => api.get('/irrigation/allocations', { params }),
  allocate: (data: object) => api.post('/irrigation/allocations', data),
  approveAllocation: (id: string) => api.post(`/irrigation/allocations/${id}/approve`),
  verifyAllocation: (id: string, data: object = {}) => api.post(`/irrigation/allocations/${id}/verify`, data),
  chairmanRejectAllocation: (id: string, data: object) => api.post(`/irrigation/allocations/${id}/chairman-reject`, data),
  rejectAllocation: (id: string, data: object) => api.post(`/irrigation/allocations/${id}/reject`, data),
  releaseAllocation: (id: string, data: object) => api.post(`/irrigation/allocations/${id}/release`, data),
  setGuardian: (id: string, data: object) => api.post(`/irrigation/allocations/${id}/guardian`, data),
  endGuardian: (id: string, data: object) => api.post(`/irrigation/allocations/${id}/guardian/end`, data),
  members: (params: object) => api.get('/irrigation/allocation-members', { params }),
  leadershipMembers: (params: object) => api.get('/irrigation/leadership-members', { params }),
  farmer: (id: string) => api.get(`/irrigation/farmers/${id}`),
  transfers: (params?: object) => api.get('/irrigation/transfers', { params }),
  createTransfer: (data: object) => api.post('/irrigation/transfers', data),
  approveTransfer: (id: string) => api.post(`/irrigation/transfers/${id}/approve`),
  rejectTransfer: (id: string, data: object) => api.post(`/irrigation/transfers/${id}/reject`, data),
  cancelTransfer: (id: string, data: object) => api.post(`/irrigation/transfers/${id}/cancel`, data),
  leadership: (params?: object) => api.get('/irrigation/leadership', { params }),
  appoint: (data: object) => api.post('/irrigation/leadership', data),
  endLeadership: (id: string, data: object) => api.post(`/irrigation/leadership/${id}/end`, data),
  documents: (params?: object) => api.get('/irrigation/documents', { params }),
  createDocument: (data: object) => api.post('/irrigation/documents', data),
  archiveDocument: (id: string) => api.post(`/irrigation/documents/${id}/archive`),
  installRoles: () => api.post('/irrigation/setup/roles'),
};

export const staffApi = {
  list: (params?: object) => api.get('/staff', { params }),
  roleOptions: () => api.get('/staff/role-options'),
  farmerCandidates: (q: string) => api.get('/staff/farmer-candidates', { params: { q } }),
  create: (data: object) => api.post('/staff', data),
  removeAccess: (id: string) => api.post(`/staff/${id}/remove-access`),
  resetCredentials: (id: string) => api.post(`/staff/${id}/reset-credentials`),
};

export const joinRequestsApi = {
  list: (params?: object) => api.get('/join-requests', { params }),
  approve: (id: string) => api.post(`/join-requests/${id}/approve`),
  reject: (id: string, reason: string) => api.post(`/join-requests/${id}/reject`, { reason }),
};

export const machineryApi = {
  equipment: (params?: object) => api.get('/machinery/equipment', { params }),
  createEquipment: (data: object) => api.post('/machinery/equipment', data),
  updateEquipment: (id: string, data: object) => api.patch(`/machinery/equipment/${id}`, data),
  activities: (params?: object) => api.get('/machinery/activities', { params }),
  createActivity: (data: object) => api.post('/machinery/activities', data),
  updateActivity: (id: string, data: object) => api.patch(`/machinery/activities/${id}`, data),
  feePaid: (id: string, paidOn?: string) => api.post(`/machinery/activities/${id}/fee-paid`, { paidOn }),
  registrationFeePaid: (id: string, paidOn?: string) => api.post(`/machinery/equipment/${id}/registration-fee-paid`, { paidOn }),
  types: (params?: object) => api.get('/machinery/equipment-types', { params }),
  createType: (name: string) => api.post('/machinery/equipment-types', { name }),
  updateType: (id: string, data: object) => api.patch(`/machinery/equipment-types/${id}`, data),
  rates: () => api.get('/machinery/rates'),
  updateRates: (data: object) => api.patch('/machinery/rates', data),
};

export const assetsApi = {
  list: (params?: object) => api.get('/assets', { params }),
  get: (id: string) => api.get(`/assets/${id}`),
  create: (data: object) => api.post('/assets', data),
  update: (id: string, data: object) => api.patch(`/assets/${id}`, data),
  archive: (id: string) => api.delete(`/assets/${id}`),
  due: (params?: object) => api.get('/assets/due', { params }),
  addMaintenance: (id: string, data: object) => api.post(`/assets/${id}/maintenance`, data),
  reassign: (id: string, data: object) => api.post(`/assets/${id}/custody`, data),
  dispose: (id: string, data: object) => api.post(`/assets/${id}/dispose`, data),
  disposals: () => api.get('/assets/disposals'),
  depreciationRuns: () => api.get('/assets/depreciation/runs'),
  depreciationPreview: (period: string) => api.get('/assets/depreciation/preview', { params: { period } }),
  runDepreciation: (period: string) => api.post('/assets/depreciation/run', null, { params: { period } }),
};

export const payrollApi = {
  titles: () => api.get('/payroll/titles'),
  createTitle: (data: object) => api.post('/payroll/titles', data),
  payees: () => api.get('/payroll/payees'),
  candidates: () => api.get('/payroll/candidates'),
  addPayee: (data: object) => api.post('/payroll/payees', data),
  updatePayee: (id: string, data: object) => api.patch(`/payroll/payees/${id}`, data),
  verifyPayee: (id: string) => api.post(`/payroll/payees/${id}/verify`),
  history: (id: string) => api.get(`/payroll/payees/${id}/history`),
  attendance: (params?: object) => api.get('/payroll/attendance', { params }),
  markAttendance: (data: object) => api.post('/payroll/attendance', data),
  markDay: (data: object) => api.post('/payroll/attendance/day', data),
  removeAttendance: (id: string) => api.delete(`/payroll/attendance/${id}`),
  outputs: (params?: object) => api.get('/payroll/output', { params }),
  addOutput: (data: object) => api.post('/payroll/output', data),
  budgets: () => api.get('/payroll/budgets'),
  setBudget: (costCenter: string, monthlyLimit: number) => api.put(`/payroll/budgets/${costCenter}`, { monthlyLimit }),
  runs: () => api.get('/payroll/runs'),
  createRun: (data: object) => api.post('/payroll/runs', data),
  run: (id: string) => api.get(`/payroll/runs/${id}`),
  deleteRun: (id: string) => api.delete(`/payroll/runs/${id}`),
  recompile: (id: string) => api.post(`/payroll/runs/${id}/recompile`),
  updateLine: (id: string, lineId: string, data: object) => api.patch(`/payroll/runs/${id}/lines/${lineId}`, data),
  submit: (id: string, data: object = {}) => api.post(`/payroll/runs/${id}/submit`, data),
  returnRun: (id: string, reason: string) => api.post(`/payroll/runs/${id}/return`, { reason }),
  approve: (id: string, data: object) => api.post(`/payroll/runs/${id}/approve`, data),
  post: (id: string, data: object) => api.post(`/payroll/runs/${id}/post`, data),
  payslip: (id: string, lineId: string) => api.get(`/payroll/runs/${id}/payslips/${lineId}`),
};

/** Staff task tools: the cashier's day close, inputs handed to farmers, purchase orders, maintenance schedules and the compliance checklist. */
export const cashDrawerApi = {
  today: (day?: string) => api.get('/cash-drawer/today', { params: { day } }),
  close: (data: object) => api.post('/cash-drawer/close', data),
  list: (params?: object) => api.get('/cash-drawer', { params }),
  receive: (id: string, note?: string) => api.post(`/cash-drawer/${id}/receive`, { note }),
};
export const inputDistributionApi = {
  items: () => api.get('/input-distribution/items'),
  list: (params?: object) => api.get('/input-distribution', { params }),
  issue: (data: object) => api.post('/input-distribution', data),
  acknowledge: (id: string, code: string) => api.post(`/input-distribution/${id}/acknowledge`, { code }),
  resend: (id: string) => api.post(`/input-distribution/${id}/resend`),
};
export const purchaseOrdersApi = {
  list: (params?: object) => api.get('/purchase-orders', { params }),
  get: (id: string) => api.get(`/purchase-orders/${id}`),
  create: (data: object) => api.post('/purchase-orders', data),
  approve: (id: string) => api.post(`/purchase-orders/${id}/approve`),
  cancel: (id: string, reason: string) => api.post(`/purchase-orders/${id}/cancel`, { reason }),
  receive: (id: string, data: object) => api.post(`/purchase-orders/${id}/receive`, data),
};
export const maintenanceApi = {
  structure: () => api.get('/maintenance/structure'),
  list: () => api.get('/maintenance'),
  create: (data: object) => api.post('/maintenance', data),
  done: (id: string, data: object) => api.post(`/maintenance/${id}/done`, data),
  update: (id: string, data: object) => api.patch(`/maintenance/${id}`, data),
};
/** Combine harvesters and the harvest payments collected for them. */
export const harvestCollectionsApi = {
  settings: () => api.get('/harvest-collections/settings'),
  saveSettings: (data: object) => api.put('/harvest-collections/settings', data),
  combines: () => api.get('/harvest-collections/combines'),
  lookupCombine: (registration: string) => api.get('/harvest-collections/combines/lookup', { params: { registration } }),
  createCombine: (data: object) => api.post('/harvest-collections/combines', data),
  updateCombine: (id: string, data: object) => api.patch(`/harvest-collections/combines/${id}`, data),
  context: (farmId: string) => api.get('/harvest-collections/context', { params: { farmId } }),
  list: (params?: object) => api.get('/harvest-collections', { params }),
  create: (data: object) => api.post('/harvest-collections', data),
  receipt: (id: string) => api.get(`/harvest-collections/${id}`),
  collect: (id: string, collectorFarmerId?: string) => api.post(`/harvest-collections/${id}/collect`, { collectorFarmerId }),
  void: (id: string, reason: string) => api.post(`/harvest-collections/${id}/void`, { reason }),
  byCombine: (params?: object) => api.get('/harvest-collections/report/by-combine', { params }),
  pendingPayments: () => api.get('/harvest-collections/pending-payments'),
};
export const complianceReportApi = { get: () => api.get('/compliance-report') };

/** Water schedules, the daily water log and water issues. */
export const waterApi = {
  structure: () => api.get('/water/structure'),
  overview: () => api.get('/water/overview'),
  schedules: () => api.get('/water/schedules'),
  createSchedule: (data: object) => api.post('/water/schedules', data),
  updateSchedule: (id: string, data: object) => api.patch(`/water/schedules/${id}`, data),
  logs: (params?: object) => api.get('/water/logs', { params }),
  log: (data: object) => api.post('/water/logs', data),
  resolve: (id: string, resolution: string) => api.post(`/water/logs/${id}/resolve`, { resolution }),
};

export const duesApi = {
  list: (params?: object) => api.get('/dues', { params }),
  get: (id: string) => api.get(`/dues/${id}`),
  create: (data: object) => api.post('/dues', data),
  types: (params?: object) => api.get('/dues/types', { params }),
  createType: (data: object) => api.post('/dues/types', data),
  updateType: (id: string, data: object) => api.patch(`/dues/types/${id}`, data),
  previewCharge: (id: string) => api.get(`/dues/types/${id}/preview`),
  charge: (id: string, data: object = {}) => api.post(`/dues/types/${id}/charge`, data),
  issueFertiliser: (data: object) => api.post('/dues/fertiliser', data),
  farmers: (q: string) => api.get('/dues/farmers', { params: { q } }),
  statement: (farmerId: string) => api.get(`/dues/farmers/${farmerId}`),
  arrears: (params?: object) => api.get('/dues/arrears', { params }),
  pay: (id: string, data: object) => api.post(`/dues/${id}/payments`, data),
  voidPayment: (paymentId: string, reason: string) => api.post(`/dues/payments/${paymentId}/void`, { reason }),
  waive: (id: string, data: object) => api.post(`/dues/${id}/waive`, data),
  cancel: (id: string, reason: string) => api.post(`/dues/${id}/cancel`, { reason }),
};

export const chargesApi = {
  list: () => api.get('/charges'),
  update: (code: string, data: object) => api.patch(`/charges/${code}`, data),
  previewPenalties: () => api.get('/charges/penalties/preview'),
  applyPenalties: () => api.post('/charges/penalties/apply'),
  previewStorage: (month: string) => api.get('/charges/storage/preview', { params: { month } }),
  applyStorage: (month: string) => api.post('/charges/storage/apply', { month }),
};

export const communicationsApi = {
  channels: () => api.get('/communications/channels'),
  farmers: (params?: object) => api.get('/communications/farmers', { params }),
  targets: () => api.get('/communications/targets'),
  preview: (data: object) => api.post('/communications/preview', data),
  send: (data: object) => api.post('/communications', data),
  list: (params?: object) => api.get('/communications', { params }),
  get: (id: string, params?: object) => api.get(`/communications/${id}`, { params }),
};

export const boardApi = {
  list: (params?: object) => api.get('/board-members', { params }),
  candidates: (params?: object) => api.get('/board-members/candidates', { params }),
  add: (data: object) => api.post('/board-members', data),
  update: (id: string, data: object) => api.patch(`/board-members/${id}`, data),
  end: (id: string, data: object) => api.post(`/board-members/${id}/end`, data),
};

export const meetingsApi = {
  list: (params?: object) => api.get('/meetings', { params }),
  resolutions: (params?: object) => api.get('/meetings/resolutions', { params }),
  create: (data: object) => api.post('/meetings', data),
  get: (id: string) => api.get(`/meetings/${id}`),
  update: (id: string, data: object) => api.patch(`/meetings/${id}`, data),
  cancel: (id: string, data: object) => api.post(`/meetings/${id}/cancel`, data),
  openCheckIn: (id: string) => api.post(`/meetings/${id}/open-check-in`),
  markPresent: (id: string, farmerId: string) => api.post(`/meetings/${id}/attendance`, { farmerId }),
  start: (id: string) => api.post(`/meetings/${id}/start`),
  addResolution: (id: string, data: object) => api.post(`/meetings/${id}/resolutions`, data),
  close: (id: string, data: object) => api.post(`/meetings/${id}/close`, data),
};

export const tendersApi = {
  structure: () => api.get('/tenders/structure'),
  list: (params?: object) => api.get('/tenders', { params }),
  create: (data: object) => api.post('/tenders', data),
  get: (id: string) => api.get(`/tenders/${id}`),
  publish: (id: string) => api.post(`/tenders/${id}/publish`),
  cancel: (id: string, reason: string) => api.post(`/tenders/${id}/cancel`, { reason }),
  openBids: (id: string) => api.post(`/tenders/${id}/open-bids`),
  recommend: (id: string, bidId: string, note?: string) => api.post(`/tenders/${id}/recommend`, { bidId, note }),
  returnRecommendation: (id: string, reason: string) => api.post(`/tenders/${id}/return`, { reason }),
  approve: (id: string) => api.post(`/tenders/${id}/approve`),
  rate: (id: string, rating: number) => api.post(`/tenders/${id}/rate`, { rating }),
  contractors: (params?: object) => api.get('/tenders/contractors', { params }),
  vet: (id: string, data: object) => api.post(`/tenders/contractors/${id}/vet`, data),
  inspections: () => api.get('/tenders/milestones/mine'),
  signOff: (id: string, note: string) => api.post(`/tenders/milestones/${id}/sign-off`, { note }),
  rework: (id: string, note: string) => api.post(`/tenders/milestones/${id}/rework`, { note }),
  approvePayment: (id: string) => api.post(`/tenders/milestones/${id}/approve-payment`),
  pay: (id: string, data: object) => api.post(`/tenders/milestones/${id}/pay`, data),
};

/** The contractor's own portal. */
export const contractorApi = {
  me: () => api.get('/contractor/me'),
  update: (data: object) => api.put('/contractor/me', data),
  tenders: () => api.get('/contractor/tenders'),
  bids: () => api.get('/contractor/bids'),
  contracts: () => api.get('/contractor/contracts'),
  bid: (tenderId: string, data: object) => api.put(`/contractor/tenders/${tenderId}/bid`, data),
  withdraw: (tenderId: string) => api.post(`/contractor/tenders/${tenderId}/withdraw`),
  submitMilestone: (id: string, data: object) => api.post(`/contractor/milestones/${id}/submit`, data),
};

/** No sign-in needed. */
export const publicTendersApi = {
  list: () => api.get('/public/tenders'),
  registerContractor: (data: object) => api.post('/public/contractors/register', data),
};

export const farmDefaultsApi = {
  list: (params?: object) => api.get('/farm-defaults', { params }),
  check: () => api.post('/farm-defaults/check'),
  payers: (params?: object) => api.get('/farm-defaults/payers', { params }),
  forFarmer: (farmerId: string) => api.get(`/farm-defaults/farmer/${farmerId}`),
  me: () => api.get('/farm-defaults/me'),
  takeOver: (id: string, data: object) => api.post(`/farm-defaults/${id}/take-over`, data),
  release: (id: string, data: object) => api.post(`/farm-defaults/${id}/release`, data),
};
