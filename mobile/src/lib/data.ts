/**
 * Single data-access entry point for the whole app.
 *
 * Screens import their API objects from here rather than importing the HTTP
 * client directly. Offline writes are handled by the sync queue in api.ts;
 * there is no separate all-local application mode.
 */
import * as remote from './api';
const impl = remote;

export const authApi = impl.authApi;
export const usersApi = impl.usersApi;
export const farmersApi = impl.farmersApi;
export const mamcosApi = impl.mamcosApi;
export const farmsApi = impl.farmsApi;
export const plotsApi = impl.plotsApi;
export const cropCyclesApi = impl.cropCyclesApi;
export const riceProtocolsApi = impl.riceProtocolsApi;
export const activitiesApi = impl.activitiesApi;
export const locationsApi = impl.locationsApi;
export const uploadsApi = impl.uploadsApi;
export const notificationsApi = impl.notificationsApi;
export const marketplaceApi = impl.marketplaceApi;
export const membershipsApi = impl.membershipsApi;
export const seasonsApi = impl.seasonsApi;
export const leasesApi = impl.leasesApi;
export const correctionsApi = impl.correctionsApi;
export const fieldSurveysApi = impl.fieldSurveysApi;
export const financeApi = impl.financeApi;
export const assignmentsApi = impl.assignmentsApi;
export const ownershipApi = impl.ownershipApi;
export const alertsApi = impl.alertsApi;
export const rewardsApi = impl.rewardsApi;
export const registryApi = impl.registryApi;
export const workspaceApi = impl.workspaceApi;
export const officerVisitsApi = impl.officerVisitsApi;

// Token setter is only meaningful for the remote backend; local is a no-op.
export const setApiToken = impl.setApiToken;
