import { offlineMigrationReady } from "../services/offline-migration";
import AsyncStorage from "@react-native-async-storage/async-storage";

/** Account-scoped persistent field records. Writes are serialized to prevent
 * concurrent requests from overwriting each other's rows. */

let owner = "anonymous";
export function setStoreOwner(id: string | null) {
  owner = id ?? "anonymous";
}
export type Row = Record<string, any> & { id: string };
export function uid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
export function nowIso(): string {
  return new Date().toISOString();
}
const keyFor = (collection: string) => `mayode.local.${owner}.${collection}`;
let writes: Promise<unknown> = Promise.resolve();
async function load(key: string): Promise<Row[]> {
  await offlineMigrationReady();
  return JSON.parse((await AsyncStorage.getItem(key)) || "[]");
}
async function read(collection: string) {
  const key = keyFor(collection);
  await writes;
  return load(key);
}
async function mutate<T>(
  collection: string,
  edit: (rows: Row[]) => { rows: Row[]; result: T },
): Promise<T> {
  const key = keyFor(collection);
  const operation = writes.then(async () => {
    const { rows, result } = edit(await load(key));
    await AsyncStorage.setItem(key, JSON.stringify(rows));
    return result;
  });
  writes = operation.catch(() => {});
  return operation;
}
export const db = {
  all: read,
  async where(collection: string, pred: (row: Row) => boolean) {
    return (await read(collection)).filter(pred);
  },
  async find(collection: string, pred: (row: Row) => boolean) {
    return (await read(collection)).find(pred);
  },
  async findById(collection: string, id: string) {
    return (await read(collection)).find((row) => row.id === id);
  },
  async count(collection: string) {
    return (await read(collection)).length;
  },
  async insert(collection: string, row: Omit<Row, "id"> & { id?: string }) {
    return mutate(collection, (rows) => {
      const record = { ...row, id: row.id || uid() } as Row;
      return {
        rows: [...rows.filter((r) => r.id !== record.id), record],
        result: record,
      };
    });
  },
  async update(collection: string, id: string, patch: Partial<Row>) {
    return mutate(collection, (rows) => {
      const index = rows.findIndex((row) => row.id === id);
      if (index < 0) return { rows, result: undefined as Row | undefined };
      rows[index] = { ...rows[index], ...patch, updatedAt: nowIso() };
      return { rows, result: rows[index] };
    });
  },
  async remove(collection: string, id: string) {
    await mutate(collection, (rows) => ({
      rows: rows.filter((row) => row.id !== id),
      result: undefined,
    }));
  },
  async replaceAll(collection: string, rows: Row[]) {
    await mutate(collection, () => ({ rows, result: undefined }));
  },
  async reset() {
    const prefix = `mayode.local.${owner}.`;
    await writes;
    const keys = await AsyncStorage.getAllKeys();
    await AsyncStorage.multiRemove(
      keys.filter((key) => key.startsWith(prefix)),
    );
  },
};

export const COLLECTIONS = {
  users: "users",
  farmers: "farmers",
  farms: "farms",
  plots: "plots",
  cropCycles: "cropCycles",
  activityLogs: "activityLogs",
  inputCosts: "inputCosts",
  revenues: "revenues",
  mamcos: "mamcos",
  landListings: "landListings",
  tractors: "tractors",
  tractorOwners: "tractorOwners",
  tractorBookings: "tractorBookings",
  escrowPayments: "escrowPayments",
  subLeases: "subLeases",
  ownershipTransfers: "ownershipTransfers",
  landListingOffers: "landListingOffers",
  landListingImprovements: "landListingImprovements",
  loanRecords: "loanRecords",
  marketPrices: "marketPrices",
  farmerVerifications: "farmerVerifications",
  documents: "documents",
  activities: "activities",
  fieldSurveys: "fieldSurveys",
  riceProtocols: "riceProtocols",
} as const;
