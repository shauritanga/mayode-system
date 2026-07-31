import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';

const KEY = 'mayode.sync.queue.v1';
export type PendingMutation = { id: string; method: string; url: string; data?: unknown; params?: unknown; createdAt: string; attempts: number };
type Replay = (mutation: PendingMutation) => Promise<void>;
let replay: Replay | null = null;
let running = false;

async function read(): Promise<PendingMutation[]> { const raw = await AsyncStorage.getItem(KEY); return raw ? JSON.parse(raw) : []; }
async function write(queue: PendingMutation[]) { await AsyncStorage.setItem(KEY, JSON.stringify(queue)); }

export const syncQueue = {
  configure(handler: Replay) { replay = handler; },
  async enqueue(input: Omit<PendingMutation, 'id' | 'createdAt' | 'attempts'>) {
    const queue = await read();
    // Last-write-wins for repeated updates to exactly the same resource.
    const filtered = input.method.toUpperCase() === 'PATCH' ? queue.filter((item) => !(item.method.toUpperCase() === 'PATCH' && item.url === input.url)) : queue;
    const mutation = { ...input, id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, createdAt: new Date().toISOString(), attempts: 0 };
    await write([...filtered, mutation]); return mutation;
  },
  async pending() { return read(); },
  async flush() {
    if (running || !replay || !(await NetInfo.fetch()).isConnected) return;
    running = true;
    try { for (const mutation of await read()) { try { await replay(mutation); await write((await read()).filter((item) => item.id !== mutation.id)); } catch { await write((await read()).map((item) => item.id === mutation.id ? { ...item, attempts: item.attempts + 1 } : item)); break; } } } finally { running = false; }
  },
  start() { const unsubscribe = NetInfo.addEventListener((state) => { if (state.isConnected) this.flush().catch(() => undefined); }); this.flush().catch(() => undefined); return unsubscribe; },
};
