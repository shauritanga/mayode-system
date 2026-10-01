import AsyncStorage from "@react-native-async-storage/async-storage";
import { COLLECTIONS, db, nowIso } from "../local/store";
import type { PendingMutation } from "./sync-queue";
let owner = "anonymous";
const assertOwner = (expected: string) => {
  if (owner !== expected) throw new Error("Account changed.");
};
export function setCacheOwner(id: string | null) {
  owner = id ?? "anonymous";
}
const collections = {
  farmers: COLLECTIONS.farmers,
  farms: COLLECTIONS.farms,
  plots: COLLECTIONS.plots,
  "crop-cycles": COLLECTIONS.cropCycles,
};
const responseKey = (url: string, params?: unknown) =>
  `mayode.responses.${owner}.${url}.${JSON.stringify(params ?? {})}`;
const collectionFor = (url: string) =>
  url.startsWith("/field-officer-visits")
    ? "fieldVisits"
    : /\/field-surveys/.test(url)
      ? COLLECTIONS.fieldSurveys
      : url.endsWith("/photos")
        ? "farmPhotos"
        : url === "/crop-cycles/activity"
          ? COLLECTIONS.activityLogs
          : url === "/finance/cost"
            ? COLLECTIONS.inputCosts
            : url === "/finance/revenue"
              ? COLLECTIONS.revenues
              : collections[url.split("/")[1] as keyof typeof collections];
const dataObject = (data: any) =>
  typeof data === "string" ? JSON.parse(data) : { ...data };
export async function resolveId(id: string): Promise<string> {
  if (!id.startsWith("offline-")) return id;
  const mapped = await AsyncStorage.getItem(`mayode.ids.${owner}.${id}`);
  return mapped ?? id;
}
export async function resolveReplayUrl(url: string) {
  return (await Promise.all(url.split("/").map(resolveId))).join("/");
}
export function hasPendingReferences(data: any): boolean {
  if (typeof data === "string") {
    try {
      data = JSON.parse(data);
    } catch {
      return false;
    }
  }
  if (!data || typeof data !== "object") return false;
  return Object.entries(data).some(
    ([key, value]) =>
      key.endsWith("Id") &&
      typeof value === "string" &&
      value.startsWith("offline-"),
  );
}
export async function resolveReplayData(data: unknown): Promise<any> {
  if (data == null) return data;
  const source = typeof data === "string" ? dataObject(data) : data;
  if (Array.isArray(source)) return Promise.all(source.map(resolveReplayData));
  if (typeof source !== "object") return source;
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(source))
    result[key] =
      key.endsWith("Id") && typeof value === "string"
        ? await resolveId(value)
        : value;
  return result;
}
export async function stageOfflineMutation(mutation: PendingMutation) {
  const collection = collectionFor(mutation.url);
  if (!collection) return null;
  if (
    !/^\/(farmers|farms|plots|crop-cycles)(\/[^/]+(\/boundary)?)?$/.test(
      mutation.url,
    ) &&
    !/^\/(finance\/(cost|revenue)|field-officer-visits)$/.test(mutation.url) &&
    !/\/(photos|field-surveys)$/.test(mutation.url)
  )
    return null;
  const data = dataObject(mutation.data ?? {});
  if (/\/(photos|field-surveys)$/.test(mutation.url))
    data.farmId = mutation.url.split("/")[2];
  // Credentials belong only to the private pending request, never to profile caches.
  const { password: _password, ...safeData } = data;
  if (mutation.method.toUpperCase() === "POST") {
    const id = `offline-${mutation.id}`;
    const existing = await db.findById(collection, id);
    if (existing) return existing;
    const farm = data.farmId
      ? await db.findById(COLLECTIONS.farms, data.farmId)
      : null;
    return db.insert(collection, {
      ...safeData,
      id,
      farmerId: data.farmerId ?? farm?.farmerId,
      farm: farm ?? undefined,
      farmCode: `PENDING-${id.slice(-6)}`,
      plotCode: `PENDING-${id.slice(-6)}`,
      controlNumber: "PENDING",
      user: data.phone ? { phone: data.phone } : undefined,
      status: "PLANNED",
      verificationStatus: "PENDING",
      activities: [],
      costs: [],
      revenues: [],
      _count: { activities: 0, costs: 0 },
      __syncStatus: "PENDING",
      __syncMutationId: mutation.id,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    });
  }
  const segments = mutation.url.split("/");
  const id = segments[2];
  const patch = {
    ...safeData,
    ...(segments[3] === "boundary"
      ? { centerLatitude: data.centerLat, centerLongitude: data.centerLng }
      : {}),
    __syncStatus: "PENDING",
    __syncMutationId: mutation.id,
  };
  if (await db.findById(collection, id))
    return db.update(collection, id, patch);
  return db.insert(collection, { id, ...patch });
}
export async function discardOfflineMutation(mutation: PendingMutation) {
  const collection = collectionFor(mutation.url);
  if (!collection) return;
  const id =
    mutation.method.toUpperCase() === "POST"
      ? `offline-${mutation.id}`
      : mutation.url.split("/")[2];
  const row = await db.findById(collection, id);
  if (row?.__syncMutationId === mutation.id) await db.remove(collection, id);
}
export async function reconcileOfflineMutation(
  mutation: PendingMutation,
  record: any,
) {
  const collection = collectionFor(mutation.url);
  if (!collection || !record?.id) return;
  const localId =
    mutation.method.toUpperCase() === "POST"
      ? `offline-${mutation.id}`
      : mutation.url.split("/")[2];
  await AsyncStorage.setItem(`mayode.ids.${owner}.${localId}`, record.id);
  const pending = await db.findById(collection, localId);
  if (pending) await db.remove(collection, localId);
  const existing = await db.findById(collection, record.id);
  if (existing)
    await db.update(collection, record.id, {
      ...record,
      __syncStatus: "SYNCED",
    });
  else await db.insert(collection, { ...record, __syncStatus: "SYNCED" });
  // Rewrite all children so pending farmer -> farm -> plot -> cycle remains navigable.
  for (const name of Object.values(COLLECTIONS)) {
    for (const row of await db.all(name)) {
      const patch: Record<string, string> = {};
      for (const field of ["farmerId", "farmId", "plotId", "cropCycleId"])
        if (row[field] === localId) patch[field] = record.id;
      if (Object.keys(patch).length) await db.update(name, row.id, patch);
    }
  }
}
async function upsert(collection: string, record: any) {
  const context = owner;
  if (!record?.id) return;
  const existing = await db.findById(collection, record.id);
  assertOwner(context);
  if (existing?.__syncStatus === "PENDING") return;
  if (existing) await db.update(collection, record.id, record);
  else await db.insert(collection, record);
  if (collection === COLLECTIONS.farms) {
    for (const plot of record.plots ?? [])
      await upsert(COLLECTIONS.plots, { ...plot, farmId: record.id });
    for (const cycle of record.cropCycles ?? [])
      await upsert(COLLECTIONS.cropCycles, {
        ...cycle,
        farmId: record.id,
        farmerId: record.farmerId,
      });
  }
  if (collection === COLLECTIONS.cropCycles) {
    for (const [field, child] of [
      ["activities", COLLECTIONS.activityLogs],
      ["costs", COLLECTIONS.inputCosts],
      ["revenues", COLLECTIONS.revenues],
    ]) {
      for (const row of record[field] ?? [])
        await upsert(child, { ...row, cropCycleId: record.id });
    }
  }
}
export async function saveToReadCache(
  url: string,
  data: any,
  params?: unknown,
) {
  const context = owner;
  await AsyncStorage.setItem(responseKey(url, params), JSON.stringify(data));
  assertOwner(context);
  const collection = collectionFor(url);
  if (!collection || /summary|overview|productivity|report/.test(url)) return;
  const rows = Array.isArray(data)
    ? data
    : Array.isArray(data?.data)
      ? data.data
      : [data];
  for (const row of rows) {
    assertOwner(context);
    await upsert(
      collection,
      /\/(photos|field-surveys)$/.test(url)
        ? { ...row, farmId: url.split("/")[2] }
        : row,
    );
  }
}
export async function cachedRead(
  url: string,
  params?: Record<string, any>,
): Promise<any> {
  url = await resolveReplayUrl(url);
  const parts = url.split("/");
  const collection = collectionFor(url);
  const raw = await AsyncStorage.getItem(responseKey(url, params));
  const saved = raw ? JSON.parse(raw) : undefined;
  if (!collection) return saved;
  if (parts[1] === "field-officer-visits" && parts[2] === "farmer") {
    const pending = await db.where(
      "fieldVisits",
      (r) => r.farmerId === parts[3],
    );
    return pending.length ? pending : (saved ?? []);
  }
  if (parts[1] === "farms" && parts[3] === "photos")
    return db.where("farmPhotos", (r) => r.farmId === parts[2]);
  const rows = await db.all(collection);
  const id = parts[2];
  if (parts[1] === "farmers" && parts[3] === "production-summary") {
    const cycles = await db.where(
      COLLECTIONS.cropCycles,
      (c) => c.farmerId === id,
    );
    if (!cycles.length && saved) return saved;
    const costs = await db.all(COLLECTIONS.inputCosts);
    const history = cycles.map((c) => ({
      ...c,
      actualYieldKg: c.actualYieldKg,
      farmCode: c.farm?.farmCode,
      totalCostsTzs: costs
        .filter((cost) => cost.cropCycleId === c.id)
        .reduce((sum, cost) => sum + Number(cost.totalCost || 0), 0),
    }));
    return {
      cycles: history,
      totalActualYieldKg: history.reduce(
        (sum, c) => sum + Number(c.actualYieldKg || 0),
        0,
      ),
      totalCostsTzs: history.reduce((sum, c) => sum + c.totalCostsTzs, 0),
    };
  }
  if (!id || ["farm", "farmer"].includes(id)) {
    const field =
      id === "farm" ? "farmId" : id === "farmer" ? "farmerId" : null;
    let filtered = rows.filter((r) => !field || r[field] === parts[3]);
    for (const key of ["farmId", "farmerId", "mamcosId"])
      if (params?.[key])
        filtered = filtered.filter((r) => r[key] === params[key]);
    if (params?.search)
      filtered = filtered.filter((r) =>
        `${r.firstName} ${r.lastName} ${r.controlNumber}`
          .toLowerCase()
          .includes(params.search.toLowerCase()),
      );
    return parts[1] === "farmers"
      ? { data: filtered, total: filtered.length }
      : filtered;
  }
  if (parts.length === 3) {
    const row = rows.find((r) => r.id === id);
    if (!row) return saved;
    if (collection === COLLECTIONS.cropCycles)
      return {
        ...row,
        activities: await db.where(
          COLLECTIONS.activityLogs,
          (a) => a.cropCycleId === id,
        ),
        costs: await db.where(
          COLLECTIONS.inputCosts,
          (a) => a.cropCycleId === id,
        ),
        revenues: await db.where(
          COLLECTIONS.revenues,
          (a) => a.cropCycleId === id,
        ),
      };
    if (collection === COLLECTIONS.farms)
      return {
        ...row,
        plots: await db.where(COLLECTIONS.plots, (p) => p.farmId === id),
      };
    return row;
  }
  return saved;
}
