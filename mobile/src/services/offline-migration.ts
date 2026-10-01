import AsyncStorage from "@react-native-async-storage/async-storage";
let migration: Promise<void> = Promise.resolve();
/** Adopt the previous single-account cache only for its persisted signed-in user. */
export function migrateLegacyOffline(id: string | null) {
  if (!id) return;
  migration = migration.then(async () => {
    const auth = JSON.parse(
      (await AsyncStorage.getItem("mayode-auth")) || "null",
    );
    if (auth?.state?.user?.id !== id) return;
    const marker = `mayode.offline.migrated.${id}`;
    if (await AsyncStorage.getItem(marker)) return;
    const keys = await AsyncStorage.getAllKeys();
    const legacyKeys = keys.filter((key) => /^mayode\.local\.[^.]+$/.test(key));
    const aliases = new Map<string, string>();
    const collections: { key: string; rows: any[] }[] = [];
    for (const key of legacyKeys) {
      const rows = JSON.parse((await AsyncStorage.getItem(key)) || "[]");
      collections.push({ key, rows });
      for (const row of rows) {
        if (row.__syncMutationId && row.id?.startsWith("offline-"))
          aliases.set(
            row.id,
            row.serverId || `offline-${row.__syncMutationId}`,
          );
      }
    }
    const remap = (value: any): any => {
      if (typeof value === "string") return aliases.get(value) ?? value;
      if (Array.isArray(value)) return value.map(remap);
      if (value && typeof value === "object")
        return Object.fromEntries(
          Object.entries(value).map(([key, v]) => [key, remap(v)]),
        );
      return value;
    };
    for (const { key, rows } of collections) {
      const target = key.replace("mayode.local.", `mayode.local.${id}.`);
      const current = JSON.parse((await AsyncStorage.getItem(target)) || "[]");
      const merged = new Map(
        [...rows.map(remap), ...current].map((row: any) => [row.id, row]),
      );
      await AsyncStorage.setItem(target, JSON.stringify([...merged.values()]));
    }
    const legacyQueue = JSON.parse(
      (await AsyncStorage.getItem("mayode.sync.queue.v1")) || "[]",
    );
    const target = `mayode.sync.v2.${id}`;
    const currentQueue = JSON.parse(
      (await AsyncStorage.getItem(target)) || "[]",
    );
    const queue = legacyQueue.map((m: any) => ({
      ...m,
      url: m.url
        .split("/")
        .map((s: string) => aliases.get(s) ?? s)
        .join("/"),
      data: remap(typeof m.data === "string" ? JSON.parse(m.data) : m.data),
    }));
    await AsyncStorage.setItem(
      target,
      JSON.stringify([
        ...new Map(
          [...queue, ...currentQueue].map((m: any) => [m.id, m]),
        ).values(),
      ]),
    );
    for (const [localId, serverId] of aliases)
      if (!serverId.startsWith("offline-"))
        await AsyncStorage.setItem(`mayode.ids.${id}.${localId}`, serverId);
    await AsyncStorage.setItem(marker, "1");
    await AsyncStorage.multiRemove([...legacyKeys, "mayode.sync.queue.v1"]);
  });
}
export function offlineMigrationReady() {
  return migration;
}
