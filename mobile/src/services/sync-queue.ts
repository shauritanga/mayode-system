import { offlineMigrationReady } from "./offline-migration";
import { useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import { AppState } from "react-native";

export type PendingMutation = {
  id: string;
  method: string;
  url: string;
  data?: unknown;
  params?: unknown;
  createdAt: string;
  attempts: number;
  lastError?: string;
};
export type SyncState = {
  isConnected: boolean;
  isSyncing: boolean;
  pendingCount: number;
  lastSyncedAt: string | null;
  errorCount: number;
  pendingList: PendingMutation[];
};
let owner: string | null = null;
let replay: ((mutation: PendingMutation) => Promise<void>) | null = null;
let running = false;
let discard: ((mutation: PendingMutation) => Promise<void>) | null = null;
let connected = true;
let lock: Promise<unknown> = Promise.resolve();
const listeners = new Set<(state: SyncState) => void>();
const key = (id: string) => `mayode.sync.v2.${id}`;
async function read(id = owner): Promise<PendingMutation[]> {
  await offlineMigrationReady();
  return id ? JSON.parse((await AsyncStorage.getItem(key(id))) || "[]") : [];
}
async function change(
  id: string,
  edit: (queue: PendingMutation[]) => PendingMutation[],
) {
  const operation = lock.then(async () => {
    await AsyncStorage.setItem(key(id), JSON.stringify(edit(await read(id))));
  });
  lock = operation.catch(() => {});
  await operation;
  await notify();
}
async function notify() {
  const id = owner;
  const queue = await read(id);
  const lastSyncedAt = id
    ? await AsyncStorage.getItem(`${key(id)}.last`)
    : null;
  if (id !== owner) return;
  const state = {
    isConnected: connected,
    isSyncing: running,
    pendingCount: queue.length,
    lastSyncedAt,
    errorCount: queue.filter((m) => m.attempts > 0).length,
    pendingList: queue,
  };
  listeners.forEach((listener) => listener(state));
}
export const syncQueue = {
  setOwner(id: string | null) {
    owner = id;
    void notify();
  },
  onDiscard(handler: (mutation: PendingMutation) => Promise<void>) {
    discard = handler;
  },
  configure(handler: (mutation: PendingMutation) => Promise<void>) {
    replay = handler;
  },
  async enqueue(
    input: Omit<PendingMutation, "id" | "createdAt" | "attempts"> & {
      id?: string;
    },
  ) {
    if (!owner) throw new Error("Sign in before saving field records.");
    const mutation: PendingMutation = {
      ...input,
      id: input.id || `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      createdAt: new Date().toISOString(),
      attempts: 0,
    };
    // Preserve every ordered write: replacing PATCHes loses independent fields.
    await change(owner, (queue) =>
      queue.some((m) => m.id === mutation.id) ? queue : [...queue, mutation],
    );
    return mutation;
  },
  pending: () => read(),
  async flush() {
    if (running || !replay || !owner) return;
    running = true;
    const id = owner;
    try {
      const network = await NetInfo.fetch();
      connected =
        !!network.isConnected && network.isInternetReachable !== false;
      if (!connected) return;
      await notify();
      for (const mutation of await read(id)) {
        if (owner !== id) break;
        try {
          await replay(mutation);
          await change(id, (queue) =>
            queue.filter((m) => m.id !== mutation.id),
          );
          await AsyncStorage.setItem(
            `${key(id)}.last`,
            new Date().toISOString(),
          );
        } catch (error: any) {
          await change(id, (queue) =>
            queue.map((m) =>
              m.id === mutation.id
                ? {
                    ...m,
                    attempts: m.attempts + 1,
                    lastError: String(
                      error?.response?.data?.message || error.message,
                    ),
                  }
                : m,
            ),
          );
          // Keep dependent records behind the failed parent until corrected/retried.
          break;
        }
      }
    } finally {
      running = false;
      await notify();
    }
  },
  async retryItem(_id: string) {
    await this.flush();
  },
  async discardItem(id: string) {
    if (!owner || running)
      throw new Error("Wait for synchronization to finish.");
    const queue = await read();
    const item = queue.find((m) => m.id === id);
    if (!item) return;
    const reference = `offline-${id}`;
    if (
      queue.some(
        (m) =>
          m.id !== id &&
          (m.url.includes(reference) ||
            JSON.stringify(m.data ?? {}).includes(reference)),
      )
    )
      throw new Error("Discard dependent records first.");
    await discard?.(item);
    await change(owner, (rows) => rows.filter((m) => m.id !== id));
  },
  async clearAll() {
    if (!owner || running)
      throw new Error("Wait for synchronization to finish.");
    for (const item of (await read()).reverse()) await discard?.(item);
    await change(owner, () => []);
  },
  subscribe(listener: (state: SyncState) => void) {
    listeners.add(listener);
    void notify();
    return () => {
      listeners.delete(listener);
    };
  },
  start() {
    const unsubscribe = NetInfo.addEventListener((state) => {
      connected = !!state.isConnected && state.isInternetReachable !== false;
      void notify();
      if (connected) void this.flush();
    });
    const app = AppState.addEventListener("change", (state) => {
      if (state === "active") void this.flush();
    });
    const timer = setInterval(() => {
      void this.flush();
    }, 30000);
    void this.flush();
    return () => {
      unsubscribe();
      app.remove();
      clearInterval(timer);
    };
  },
};
export function useSyncStatus() {
  const [state, setState] = useState<SyncState>({
    isConnected: true,
    isSyncing: false,
    pendingCount: 0,
    lastSyncedAt: null,
    errorCount: 0,
    pendingList: [],
  });
  useEffect(() => syncQueue.subscribe(setState), []);
  return {
    ...state,
    flush: () => syncQueue.flush(),
    retryItem: (id: string) => syncQueue.retryItem(id),
    discardItem: (id: string) => syncQueue.discardItem(id),
    clearAll: () => syncQueue.clearAll(),
  };
}
