import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Tiny AsyncStorage-backed document store. Each collection is one JSON array
 * under a namespaced key. An in-memory cache keeps reads synchronous-fast after
 * the first load. This mirrors the shape of the backend entities so the local
 * repositories can later be swapped for HTTP calls with no screen changes.
 */

const PREFIX = 'mayode.local.';
const cache: Record<string, any[]> = {};

export type Row = Record<string, any> & { id: string };

/** Short, sortable, collision-resistant local id. */
export function uid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

async function load(collection: string): Promise<Row[]> {
  if (cache[collection]) return cache[collection];
  const raw = await AsyncStorage.getItem(PREFIX + collection);
  const rows: Row[] = raw ? JSON.parse(raw) : [];
  cache[collection] = rows;
  return rows;
}

async function persist(collection: string, rows: Row[]): Promise<void> {
  cache[collection] = rows;
  await AsyncStorage.setItem(PREFIX + collection, JSON.stringify(rows));
}

export const db = {
  async all(collection: string): Promise<Row[]> {
    return [...(await load(collection))];
  },

  async where(collection: string, pred: (r: Row) => boolean): Promise<Row[]> {
    return (await load(collection)).filter(pred);
  },

  async find(collection: string, pred: (r: Row) => boolean): Promise<Row | undefined> {
    return (await load(collection)).find(pred);
  },

  async findById(collection: string, id: string): Promise<Row | undefined> {
    return (await load(collection)).find((r) => r.id === id);
  },

  async count(collection: string): Promise<number> {
    return (await load(collection)).length;
  },

  async insert(collection: string, row: Omit<Row, 'id'> & { id?: string }): Promise<Row> {
    const rows = await load(collection);
    const record: Row = { id: row.id || uid(), ...row } as Row;
    rows.push(record);
    await persist(collection, rows);
    return record;
  },

  async update(collection: string, id: string, patch: Partial<Row>): Promise<Row | undefined> {
    const rows = await load(collection);
    const idx = rows.findIndex((r) => r.id === id);
    if (idx === -1) return undefined;
    rows[idx] = { ...rows[idx], ...patch, updatedAt: nowIso() };
    await persist(collection, rows);
    return rows[idx];
  },

  async remove(collection: string, id: string): Promise<void> {
    const rows = (await load(collection)).filter((r) => r.id !== id);
    await persist(collection, rows);
  },

  /** Replace an entire collection (used by seeding). */
  async replaceAll(collection: string, rows: Row[]): Promise<void> {
    await persist(collection, rows);
  },

  /** Wipe everything (dev helper). */
  async reset(): Promise<void> {
    const keys = await AsyncStorage.getAllKeys();
    const mine = keys.filter((k) => k.startsWith(PREFIX));
    await AsyncStorage.multiRemove(mine);
    for (const k of Object.keys(cache)) delete cache[k];
  },
};

export const COLLECTIONS = {
  users: 'users',
  farmers: 'farmers',
  farms: 'farms',
  plots: 'plots',
  cropCycles: 'cropCycles',
  activityLogs: 'activityLogs',
  inputCosts: 'inputCosts',
  revenues: 'revenues',
  mamcos: 'mamcos',
  landListings: 'landListings',
  tractors: 'tractors',
  tractorOwners: 'tractorOwners',
  tractorBookings: 'tractorBookings',
  escrowPayments: 'escrowPayments',
  subLeases: 'subLeases',
  ownershipTransfers: 'ownershipTransfers',
  landListingOffers: 'landListingOffers',
  landListingImprovements: 'landListingImprovements',
  loanRecords: 'loanRecords',
  marketPrices: 'marketPrices',
  farmerVerifications: 'farmerVerifications',
  documents: 'documents',
  activities: 'activities',
} as const;
