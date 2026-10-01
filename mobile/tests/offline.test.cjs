const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
function setup() {
  const disk = new Map();
  const storage = {
    getItem: async (k) => disk.get(k) ?? null,
    setItem: async (k, v) => {
      disk.set(k, v);
    },
    getAllKeys: async () => [...disk.keys()],
    multiRemove: async (keys) => keys.forEach((k) => disk.delete(k)),
  };
  let connected = true;
  const modules = new Map();
  const files = new Set(["file:///camera.jpg"]);
  class Directory {
    constructor(base, child) {
      this.uri = `${typeof base === "string" ? base : base.uri}/${child}`;
    }
    create() {}
  }
  class File {
    constructor(base, child) {
      this.uri = child ? `${base.uri}/${child}` : base;
    }
    copy(target) {
      if (!files.has(this.uri)) throw new Error("Missing file");
      files.add(target.uri);
    }
  }
  class NativeFormData {
    append() {}
  }
  const mocks = {
    "expo-constants": {
      expoConfig: { extra: { apiUrl: "https://field.test/api/v1" } },
    },
    "expo-file-system": {
      Directory,
      File,
      Paths: { document: "file:///documents" },
    },
    "@react-native-async-storage/async-storage": storage,
    "@react-native-community/netinfo": {
      fetch: async () => ({ isConnected: connected }),
      addEventListener: () => () => {},
    },
    react: { useEffect() {}, useState() {} },
    "react-native": { AppState: { addEventListener: () => ({ remove() {} }) } },
  };
  function load(file) {
    file = path.resolve(__dirname, "..", file);
    if (modules.has(file)) return modules.get(file).exports;
    const module = { exports: {} };
    modules.set(file, module);
    const source = ts.transpileModule(fs.readFileSync(file, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    }).outputText;
    const req = (name) =>
      mocks[name] ??
      (name.startsWith(".")
        ? load(path.resolve(path.dirname(file), name + ".ts"))
        : require(name));
    new Function("require", "module", "exports", "FormData", source)(
      req,
      module,
      module.exports,
      NativeFormData,
    );
    return module.exports;
  }
  const store = load("src/local/store.ts");
  const cache = load("src/services/offline-cache.ts");
  const { syncQueue: queue } = load("src/services/sync-queue.ts");
  const owner = (id) => {
    store.setStoreOwner(id);
    cache.setCacheOwner(id);
    queue.setOwner(id);
  };
  owner("officer");
  const stage = async (url, data, method = "POST") => {
    const mutation = await queue.enqueue({ url, data, method });
    return { mutation, record: await cache.stageOfflineMutation(mutation) };
  };
  return {
    load,
    files,
    store,
    cache,
    queue,
    disk,
    owner,
    stage,
    network: (value) => {
      connected = value;
    },
  };
}
test("offline farmer -> farm -> plot -> cycle -> activity/cost survives ID reconciliation", async () => {
  const { stage, cache, store } = setup();
  const farmer = await stage("/farmers", {
    firstName: "Asha",
    phone: "+255712345678",
    password: "secret",
  });
  assert.equal(farmer.record.password, undefined);
  const farm = await stage("/farms", {
    farmerId: farmer.record.id,
    name: "North",
  });
  const plot = await stage("/plots", {
    farmId: farm.record.id,
    photoUrls: ["file:///photo.jpg"],
  });
  const cycle = await stage("/crop-cycles", {
    farmId: farm.record.id,
    season: "2026",
  });
  await stage("/crop-cycles/activity", {
    cropCycleId: cycle.record.id,
    activityType: "PLANTING",
    inputsUsed: { items: [{ name: "Seed", quantity: 2, unit: "kg" }] },
  });
  await stage("/finance/cost", {
    cropCycleId: cycle.record.id,
    totalCost: 2000,
  });
  const detail = await cache.cachedRead(`/crop-cycles/${cycle.record.id}`);
  assert.equal(detail.activities.length, 1);
  assert.equal(detail.costs[0].totalCost, 2000);
  assert.equal(
    (await cache.cachedRead(`/farms/${farm.record.id}`)).plots[0].id,
    plot.record.id,
  );
  await cache.reconcileOfflineMutation(farmer.mutation, {
    id: "server-farmer",
    firstName: "Asha",
  });
  assert.equal(
    (await cache.resolveReplayData(farm.mutation.data)).farmerId,
    "server-farmer",
  );
  await cache.reconcileOfflineMutation(farm.mutation, {
    id: "server-farm",
    farmerId: "server-farmer",
  });
  assert.equal(
    await cache.resolveReplayUrl(`/farms/${farm.record.id}/boundary`),
    "/farms/server-farm/boundary",
  );
  assert.equal(
    (await store.db.findById("plots", plot.record.id)).farmId,
    "server-farm",
  );
});
test("online records and nested histories are available offline", async () => {
  const { cache } = setup();
  await cache.saveToReadCache(
    "/farmers",
    { data: [{ id: "farmer", firstName: "Asha", mamcosId: "co-op" }] },
    { page: 1 },
  );
  await cache.saveToReadCache("/crop-cycles/cycle", {
    id: "cycle",
    farmerId: "farmer",
    actualYieldKg: 50,
    activities: [{ id: "activity" }],
    costs: [{ id: "cost", totalCost: 700 }],
    revenues: [],
  });
  assert.equal(
    (await cache.cachedRead("/farmers", { search: "asha" })).data.length,
    1,
  );
  assert.equal(
    (await cache.cachedRead("/crop-cycles/cycle")).activities.length,
    1,
  );
  const summary = await cache.cachedRead("/farmers/farmer/production-summary");
  assert.equal(summary.totalActualYieldKg, 50);
  assert.equal(summary.totalCostsTzs, 700);
});
test("concurrent enqueue and local inserts do not lose records", async () => {
  const { queue, store } = setup();
  await Promise.all(
    Array.from({ length: 20 }, (_, i) =>
      queue.enqueue({ method: "PATCH", url: "/farms/farm", data: { [i]: i } }),
    ),
  );
  assert.equal((await queue.pending()).length, 20);
  await Promise.all(
    Array.from({ length: 20 }, (_, i) =>
      store.db.insert("plots", { id: String(i) }),
    ),
  );
  assert.equal((await store.db.all("plots")).length, 20);
});
test("queue and read cache are isolated by account and retained after sign out", async () => {
  const { queue, owner, stage, cache } = setup();
  await stage("/farmers", { firstName: "Asha" });
  await cache.saveToReadCache("/workspace/context", {
    mamcos: { id: "private" },
  });
  owner("different");
  assert.equal((await queue.pending()).length, 0);
  assert.equal(await cache.cachedRead("/workspace/context"), undefined);
  owner("officer");
  assert.equal((await queue.pending()).length, 1);
  assert.equal(
    (await cache.cachedRead("/workspace/context")).mamcos.id,
    "private",
  );
});
test("failed parent blocks dependent replay and retries preserve order", async () => {
  const { queue, stage, network } = setup();
  await stage("/farmers", {});
  await stage("/farms", {});
  const seen = [];
  let fail = true;
  queue.configure(async (m) => {
    seen.push(m.url);
    if (fail) throw new Error("Unavailable");
  });
  network(false);
  await queue.flush();
  assert.equal(seen.length, 0);
  network(true);
  await queue.flush();
  assert.deepEqual(seen, ["/farmers"]);
  assert.equal((await queue.pending())[0].attempts, 1);
  fail = false;
  await queue.flush();
  assert.deepEqual(seen, ["/farmers", "/farmers", "/farms"]);
  assert.equal((await queue.pending()).length, 0);
});

test("HTTP integration queues offline photos and replaces local IDs and media before replay", async () => {
  const env = setup();
  const client = env.load("src/lib/api.ts");
  client.setOfflineOwner("officer");
  client.setApiToken("token");
  env.network(false);
  const photo = await client.uploadsApi.uploadFile({
    uri: "file:///camera.jpg",
    name: "camera.jpg",
    type: "image/jpeg",
  });
  assert.match(photo.data.url, /^file:\/\/\/documents/);
  assert.ok(env.files.has(photo.data.url));
  const farmer = await client.farmersApi.create({
    firstName: "Asha",
    password: "secret",
  });
  const farm = await client.farmsApi.create({
    farmerId: farmer.data.id,
    name: "North",
  });
  const plot = await client.plotsApi.create({
    farmId: farm.data.id,
    photoUrls: [photo.data.url],
    centerLatitude: -8,
    centerLongitude: 34,
  });
  assert.equal(plot.data.queued, true);
  assert.equal(
    (await client.plotsApi.getOne(plot.data.id)).data.photoUrls[0],
    photo.data.url,
  );
  const received = [];
  client.api.defaults.adapter = async (config) => {
    received.push({
      url: config.url,
      data:
        typeof config.data === "string" ? JSON.parse(config.data) : config.data,
    });
    const data =
      config.url === "/uploads"
        ? { url: "/uploads/plot.jpg" }
        : { ...received.at(-1).data, id: `server-${config.url.slice(1)}` };
    return { data, status: 200, statusText: "OK", headers: {}, config };
  };
  env.network(true);
  await env.queue.flush();
  assert.equal((await env.queue.pending()).length, 0);
  const savedPlot = received.find((r) => r.url === "/plots");
  assert.equal(savedPlot.data.farmId, "server-farms");
  assert.deepEqual(savedPlot.data.photoUrls, ["/uploads/plot.jpg"]);
  assert.equal(
    received.find((r) => r.url === "/farms").data.farmerId,
    "server-farmers",
  );
});
test("lost HTTP responses reuse the original idempotency key on retry", async () => {
  const env = setup();
  const client = env.load("src/lib/api.ts");
  client.setOfflineOwner("officer");
  client.setApiToken("token");
  const keys = [];
  let fail = true;
  client.api.defaults.adapter = async (config) => {
    keys.push(config.headers["X-Idempotency-Key"]);
    if (fail) throw Object.assign(new Error("Connection lost"), { config });
    return {
      data: { id: "server-farm", name: "North" },
      status: 200,
      statusText: "OK",
      headers: {},
      config,
    };
  };
  const farm = await client.farmsApi.create({ name: "North" });
  assert.equal(farm.data.queued, true);
  fail = false;
  await env.queue.flush();
  assert.equal(keys.length, 2);
  assert.equal(keys[0], keys[1]);
});
test("legacy pending records migrate without losing their parent references", async () => {
  const env = setup();
  env.disk.set(
    "mayode-auth",
    JSON.stringify({ state: { user: { id: "officer" } } }),
  );
  env.disk.set(
    "mayode.local.farms",
    JSON.stringify([
      {
        id: "offline-old",
        farmerId: "farmer",
        __syncMutationId: "old-create",
        __syncStatus: "PENDING",
      },
    ]),
  );
  env.disk.set(
    "mayode.sync.queue.v1",
    JSON.stringify([
      {
        id: "old-create",
        method: "POST",
        url: "/farms",
        data: { farmerId: "farmer" },
        createdAt: "2026-09-30",
        attempts: 0,
      },
      {
        id: "old-cycle",
        method: "POST",
        url: "/crop-cycles",
        data: JSON.stringify({ farmId: "offline-old" }),
        attempts: 0,
      },
    ]),
  );
  const migration = env.load("src/services/offline-migration.ts");
  migration.migrateLegacyOffline("officer");
  await migration.offlineMigrationReady();
  const queue = await env.queue.pending();
  assert.equal(queue.length, 2);
  assert.equal(queue[1].data.farmId, "offline-old-create");
  assert.equal((await env.store.db.all("farms"))[0].id, "offline-old-create");
  assert.equal(env.disk.has("mayode.sync.queue.v1"), false);
});
test("discarding a queued parent is blocked until dependent records are removed", async () => {
  const env = setup();
  env.queue.onDiscard(env.cache.discardOfflineMutation);
  const farmer = await env.stage("/farmers", {});
  const farm = await env.stage("/farms", { farmerId: farmer.record.id });
  await assert.rejects(env.queue.discardItem(farmer.mutation.id), /dependent/);
  await env.queue.discardItem(farm.mutation.id);
  await env.queue.discardItem(farmer.mutation.id);
  assert.equal((await env.store.db.all("farmers")).length, 0);
  assert.equal((await env.store.db.all("farms")).length, 0);
});
