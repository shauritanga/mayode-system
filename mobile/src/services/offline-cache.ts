import { COLLECTIONS, db, nowIso, uid } from '../local/store';
import type { PendingMutation } from './sync-queue';

/**
 * Optimistic offline cache for field workflows:
 * - Farm registration
 * - Crop-cycle creation
 * - Activity logging
 * - Field surveys (GPS, soil, water & road observations)
 * - Read-caches for Rice GAP protocols & Market price intelligence
 */
const localId = () => `offline-${uid()}`;

const collectionFor = (url: string) => {
  if (url === '/crop-cycles/activity') return COLLECTIONS.activityLogs;
  if (/^\/farms(?:\/[^/]+)?$/.test(url)) return COLLECTIONS.farms;
  if (/^\/crop-cycles(?:\/[^/]+)?$/.test(url)) return COLLECTIONS.cropCycles;
  if (/^\/farms\/[^/]+\/field-surveys$/.test(url) || url === '/field-surveys') return COLLECTIONS.fieldSurveys;
  return null;
};

const mutationData = (data: unknown): Record<string, any> => {
  if (typeof data === 'string') {
    try {
      return JSON.parse(data);
    } catch {
      return {};
    }
  }
  return data && typeof data === 'object' ? (data as Record<string, any>) : {};
};

export async function stageOfflineMutation(mutation: PendingMutation) {
  const collection = collectionFor(mutation.url);
  const data = mutationData(mutation.data);
  if (!collection) return null;

  if (mutation.method.toUpperCase() === 'POST') {
    const id = localId();
    const farmSurveyMatch = mutation.url.match(/^\/farms\/([^/]+)\/field-surveys$/);
    const urlFarmId = farmSurveyMatch ? farmSurveyMatch[1] : undefined;

    const record = await db.insert(collection, {
      ...data,
      id,
      ...(urlFarmId ? { farmId: urlFarmId } : {}),
      ...(collection === COLLECTIONS.farms
        ? {
            farmCode: `PENDING-${id.slice(-6).toUpperCase()}`,
            grade: data.grade || 'C',
            isVerified: false,
          }
        : {}),
      ...(collection === COLLECTIONS.cropCycles
        ? { status: 'PLANNED', _count: { activities: 0, costs: 0 } }
        : {}),
      ...(collection === COLLECTIONS.fieldSurveys
        ? { status: 'PENDING_SYNC', surveyDate: nowIso() }
        : {}),
      __syncStatus: 'PENDING',
      __syncMutationId: mutation.id,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    });
    return record;
  }

  if (mutation.method.toUpperCase() === 'PATCH') {
    const id = mutation.url.split('/').pop();
    return id
      ? db.update(collection, id, {
          ...data,
          __syncStatus: 'PENDING',
          __syncMutationId: mutation.id,
        })
      : null;
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
  for (const key of ['farmId', 'cropCycleId']) {
    copy[key] = await serverId(copy[key]);
  }
  return copy;
}

export async function discardOfflineMutation(mutation: PendingMutation) {
  const collection = collectionFor(mutation.url);
  if (!collection) return;
  const pending = await db.find(
    collection,
    (record) => record.__syncMutationId === mutation.id,
  );
  if (pending) {
    await db.update(collection, pending.id, {
      __syncStatus: 'SERVER_NEWER',
      syncConflictAt: nowIso(),
    });
  }
}

export async function reconcileOfflineMutation(
  mutation: PendingMutation,
  serverRecord: any,
) {
  const collection = collectionFor(mutation.url);
  if (!collection || !serverRecord?.id) return;
  const pending = await db.find(
    collection,
    (record) => record.__syncMutationId === mutation.id,
  );
  if (!pending) return;
  await db.update(collection, pending.id, {
    serverId: serverRecord.id,
    __syncStatus: 'SYNCED',
    syncedAt: nowIso(),
    updatedAt: serverRecord.updatedAt ?? nowIso(),
  });
}

/** Cache incoming successful online responses for offline read availability. */
export async function saveToReadCache(url: string, data: any) {
  try {
    if (url.includes('/rice-protocols') && Array.isArray(data)) {
      await db.replaceAll(COLLECTIONS.riceProtocols, data);
    } else if (url.includes('/marketplace/prices') && Array.isArray(data)) {
      await db.replaceAll(COLLECTIONS.marketPrices, data);
    } else if (url === '/farms' && Array.isArray(data)) {
      const pendingFarms = await db.where(
        COLLECTIONS.farms,
        (f) => f.__syncStatus === 'PENDING',
      );
      await db.replaceAll(COLLECTIONS.farms, [...data, ...pendingFarms]);
    }
  } catch {
    /* non-blocking */
  }
}

export async function cachedRead(
  url: string,
  params?: Record<string, unknown>,
) {
  if (url === '/farms') return db.all(COLLECTIONS.farms);
  const farmById = url.match(/^\/farms\/(offline-[^/]+)$/);
  if (farmById) return db.findById(COLLECTIONS.farms, farmById[1]);
  const farmMatch = url.match(/^\/farms\/farmer\/(.+)$/);
  if (farmMatch) {
    return db.where(COLLECTIONS.farms, (farm) => farm.farmerId === farmMatch[1]);
  }
  const cycleMatch = url.match(/^\/crop-cycles\/farm\/(.+)$/);
  if (cycleMatch) {
    return db.where(
      COLLECTIONS.cropCycles,
      (cycle) => cycle.farmId === cycleMatch[1],
    );
  }
  const cycleById = url.match(/^\/crop-cycles\/(offline-[^/]+)$/);
  if (cycleById) return db.findById(COLLECTIONS.cropCycles, cycleById[1]);
  if (url === '/crop-cycles') {
    const cycles = await db.all(COLLECTIONS.cropCycles);
    return params?.farmId
      ? cycles.filter((cycle) => cycle.farmId === params.farmId)
      : cycles;
  }

  // Field surveys cached read
  const surveyMatch = url.match(/^\/farms\/([^/]+)\/field-surveys$/);
  if (surveyMatch) {
    const surveys = await db.where(
      COLLECTIONS.fieldSurveys,
      (s) => s.farmId === surveyMatch[1],
    );
    return surveys.length > 0 ? surveys : undefined;
  }

  // Rice GAP Protocols cached read
  if (url.includes('/rice-protocols')) {
    const protocols = await db.all(COLLECTIONS.riceProtocols);
    return protocols.length > 0 ? protocols : undefined;
  }

  // Market prices cached read
  if (url.includes('/marketplace/prices')) {
    const prices = await db.all(COLLECTIONS.marketPrices);
    return prices.length > 0 ? prices : undefined;
  }

  return undefined;
}
