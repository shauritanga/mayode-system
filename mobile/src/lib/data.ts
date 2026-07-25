/**
 * Single data-access entry point for the whole app.
 *
 * Screens import their API objects from here (not from ./api or ../local
 * directly). Flip USE_LOCAL_DATA in ./config to switch the entire app between
 * on-device local storage and the remote backend — no screen changes needed.
 */
import { USE_LOCAL_DATA } from './config';

import * as remote from './api';
import * as local from '../local/repositories';

const impl = USE_LOCAL_DATA ? local : remote;

export const authApi = impl.authApi;
export const usersApi = impl.usersApi;
export const farmersApi = impl.farmersApi;
export const mamcosApi = impl.mamcosApi;
export const farmsApi = impl.farmsApi;
export const plotsApi = impl.plotsApi;
export const cropCyclesApi = impl.cropCyclesApi;
export const activitiesApi = impl.activitiesApi;
export const locationsApi = impl.locationsApi;
export const uploadsApi = impl.uploadsApi;
export const notificationsApi = impl.notificationsApi;
export const marketplaceApi = impl.marketplaceApi;
export const membershipsApi = impl.membershipsApi;
export const seasonsApi = impl.seasonsApi;
export const leasesApi = impl.leasesApi;
export const assignmentsApi = impl.assignmentsApi;
export const ownershipApi = impl.ownershipApi;
export const alertsApi = impl.alertsApi;
export const rewardsApi = impl.rewardsApi;
export const registryApi = impl.registryApi;

// Token setter is only meaningful for the remote backend; local is a no-op.
export const setApiToken = impl.setApiToken;
