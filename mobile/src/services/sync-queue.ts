import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';

const QUEUE_KEY = 'mayode.sync.queue.v1';
const LAST_SYNC_KEY = 'mayode.sync.last.v1';

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

type Replay = (mutation: PendingMutation) => Promise<void>;
type Listener = (state: SyncState) => void;

let replay: Replay | null = null;
let running = false;
let isConnected = true;
let lastSyncedAt: string | null = null;
const listeners = new Set<Listener>();

async function readQueue(): Promise<PendingMutation[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function writeQueue(queue: PendingMutation[]): Promise<void> {
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  notify();
}

async function initLastSync(): Promise<void> {
  try {
    lastSyncedAt = await AsyncStorage.getItem(LAST_SYNC_KEY);
  } catch {
    lastSyncedAt = null;
  }
}
initLastSync();

function notify(): void {
  readQueue().then((queue) => {
    const errorCount = queue.filter((m) => m.attempts > 0).length;
    const state: SyncState = {
      isConnected,
      isSyncing: running,
      pendingCount: queue.length,
      lastSyncedAt,
      errorCount,
      pendingList: queue,
    };
    listeners.forEach((listener) => listener(state));
  });
}

export const syncQueue = {
  configure(handler: Replay) {
    replay = handler;
  },

  async enqueue(input: Omit<PendingMutation, 'id' | 'createdAt' | 'attempts'>) {
    const queue = await readQueue();
    // Last-write-wins for repeated updates to exactly the same resource.
    const filtered =
      input.method.toUpperCase() === 'PATCH'
        ? queue.filter(
            (item) =>
              !(
                item.method.toUpperCase() === 'PATCH' &&
                item.url === input.url
              ),
          )
        : queue;

    const mutation: PendingMutation = {
      ...input,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      createdAt: new Date().toISOString(),
      attempts: 0,
    };

    await writeQueue([...filtered, mutation]);
    return mutation;
  },

  async pending(): Promise<PendingMutation[]> {
    return readQueue();
  },

  async flush(): Promise<void> {
    if (running || !replay) return;
    const net = await NetInfo.fetch();
    if (!net.isConnected) {
      isConnected = false;
      notify();
      return;
    }
    isConnected = true;
    running = true;
    notify();

    try {
      const queue = await readQueue();
      for (const mutation of queue) {
        try {
          await replay(mutation);
          const current = await readQueue();
          await writeQueue(current.filter((item) => item.id !== mutation.id));
          lastSyncedAt = new Date().toISOString();
          await AsyncStorage.setItem(LAST_SYNC_KEY, lastSyncedAt);
        } catch (err: any) {
          const errMsg = err?.response?.data?.message || err?.message || 'Sync failed';
          const current = await readQueue();
          await writeQueue(
            current.map((item) =>
              item.id === mutation.id
                ? { ...item, attempts: item.attempts + 1, lastError: errMsg }
                : item,
            ),
          );
          break;
        }
      }
    } finally {
      running = false;
      notify();
    }
  },

  async retryItem(id: string): Promise<void> {
    if (!replay || running) return;
    const queue = await readQueue();
    const item = queue.find((m) => m.id === id);
    if (!item) return;

    running = true;
    notify();
    try {
      await replay(item);
      const current = await readQueue();
      await writeQueue(current.filter((m) => m.id !== id));
      lastSyncedAt = new Date().toISOString();
      await AsyncStorage.setItem(LAST_SYNC_KEY, lastSyncedAt);
    } catch (err: any) {
      const errMsg = err?.response?.data?.message || err?.message || 'Sync failed';
      const current = await readQueue();
      await writeQueue(
        current.map((m) =>
          m.id === id
            ? { ...m, attempts: m.attempts + 1, lastError: errMsg }
            : m,
        ),
      );
    } finally {
      running = false;
      notify();
    }
  },

  async discardItem(id: string): Promise<void> {
    const queue = await readQueue();
    await writeQueue(queue.filter((item) => item.id !== id));
  },

  async clearAll(): Promise<void> {
    await writeQueue([]);
  },

  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    // Emit current state immediately
    readQueue().then((queue) => {
      listener({
        isConnected,
        isSyncing: running,
        pendingCount: queue.length,
        lastSyncedAt,
        errorCount: queue.filter((m) => m.attempts > 0).length,
        pendingList: queue,
      });
    });
    return () => listeners.delete(listener);
  },

  start() {
    NetInfo.fetch().then((state) => {
      isConnected = !!state.isConnected;
      notify();
    });

    const unsubscribe = NetInfo.addEventListener((state) => {
      const connected = !!state.isConnected;
      const wasDisconnected = !isConnected && connected;
      isConnected = connected;
      notify();
      if (wasDisconnected) {
        this.flush().catch(() => undefined);
      }
    });

    this.flush().catch(() => undefined);
    return unsubscribe;
  },
};

/** React hook for real-time sync status observation and control. */
export function useSyncStatus() {
  const [state, setState] = useState<SyncState>({
    isConnected: true,
    isSyncing: false,
    pendingCount: 0,
    lastSyncedAt: null,
    errorCount: 0,
    pendingList: [],
  });

  useEffect(() => {
    return syncQueue.subscribe((updated) => setState(updated));
  }, []);

  return {
    ...state,
    flush: () => syncQueue.flush(),
    retryItem: (id: string) => syncQueue.retryItem(id),
    discardItem: (id: string) => syncQueue.discardItem(id),
    clearAll: () => syncQueue.clearAll(),
  };
}
