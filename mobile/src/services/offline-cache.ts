import { COLLECTIONS, db, nowIso, uid } from '../local/store';
import type { PendingMutation } from './sync-queue';

/**
 * Small optimistic cache for the three field flows that must work without a
 * connection: farm registration, crop-cycle creation, and activity logging.
 * Local IDs are retained until the next online refresh; `serverId` maps queued
 * dependent writes to the server-created parent record during replay.
 */
const localId = () => `offline-${uid()}`;
const collectionFor = (url: string) => url === '/crop-cycles/activity' ? COLLECTIONS.activityLogs : /^\/farms(?:\/[^/]+)?$/.test(url) ? COLLECTIONS.farms : /^\/crop-cycles(?:\/[^/]+)?$/.test(url) ? COLLECTIONS.cropCycles : null;
const mutationData = (data: unknown): Record<string, any> => {
  if (typeof data === 'string') { try { return JSON.parse(data); } catch { return {}; } }
  return data && typeof data === 'object' ? data as Record<string, any> : {};
};

export async function stageOfflineMutation(mutation: PendingMutation) {
  const collection = collectionFor(mutation.url);
  const data = mutationData(mutation.data);
  if (!collection) return null;
  if (mutation.method.toUpperCase() === 'POST') {
    const id = localId();
    const record = await db.insert(collection, {
      ...data,
      id,
      ...(collection === COLLECTIONS.farms ? { farmCode: `PENDING-${id.slice(-6).toUpperCase()}`, grade: data.grade || 'C', isVerified: false } : {}),
      ...(collection === COLLECTIONS.cropCycles ? { status: 'PLANNED', _count: { activities: 0, costs: 0 } } : {}),
      __syncStatus: 'PENDING',
      __syncMutationId: mutation.id,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    });
    return record;
  }
  if (mutation.method.toUpperCase() === 'PATCH') {
    const id = mutation.url.split('/').pop();
    return id ? db.update(collection, id, { ...data, __syncStatus: 'PENDING', __syncMutationId: mutation.id }) : null;
  }
  return null;
}

async function serverId(id: unknown) {
  if (typeof id !== 'string' || !id.startsWith('offline-')) return id;
  for (const collection of [COLLECTIONS.farms, COLLECTIONS.cropCycles]) {
    const record = await db.findById(collection, id);
    if (record?.serverId) return record.serverId;
  }
  return id;
}

export async function resolveReplayData(data: unknown) {
  const copy = mutationData(data);
  for (const key of ['farmId', 'cropCycleId']) copy[key] = await serverId(copy[key]);
  return copy;
}

export async function discardOfflineMutation(mutation: PendingMutation) {
  const collection = collectionFor(mutation.url);
  if (!collection) return;
  const pending = await db.find(collection, (record) => record.__syncMutationId === mutation.id);
  if (pending) await db.update(collection, pending.id, { __syncStatus: 'SERVER_NEWER', syncConflictAt: nowIso() });
}

export async function reconcileOfflineMutation(mutation: PendingMutation, serverRecord: any) {
  const collection = collectionFor(mutation.url);
  if (!collection || !serverRecord?.id) return;
  const pending = await db.find(collection, (record) => record.__syncMutationId === mutation.id);
  if (!pending) return;
  await db.update(collection, pending.id, { serverId: serverRecord.id, __syncStatus: 'SYNCED', syncedAt: nowIso(), updatedAt: serverRecord.updatedAt ?? nowIso() });
}

export async function cachedRead(url: string, params?: Record<string, unknown>) {
  if (url === '/farms') return db.all(COLLECTIONS.farms);
  const farmById = url.match(/^\/farms\/(offline-[^/]+)$/);
  if (farmById) return db.findById(COLLECTIONS.farms, farmById[1]);
  const farmMatch = url.match(/^\/farms\/farmer\/(.+)$/);
  if (farmMatch) return db.where(COLLECTIONS.farms, (farm) => farm.farmerId === farmMatch[1]);
  const cycleMatch = url.match(/^\/crop-cycles\/farm\/(.+)$/);
  if (cycleMatch) return db.where(COLLECTIONS.cropCycles, (cycle) => cycle.farmId === cycleMatch[1]);
  const cycleById = url.match(/^\/crop-cycles\/(offline-[^/]+)$/);
  if (cycleById) return db.findById(COLLECTIONS.cropCycles, cycleById[1]);
  if (url === '/crop-cycles') {
    const cycles = await db.all(COLLECTIONS.cropCycles);
    return params?.farmId ? cycles.filter((cycle) => cycle.farmId === params.farmId) : cycles;
  }
  return undefined;
}
