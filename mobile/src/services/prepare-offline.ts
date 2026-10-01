import NetInfo from "@react-native-community/netinfo";
import { api } from "../lib/api";
import { useAuthStore } from "../store/auth.store";

let preparation: Promise<void> | null = null;
/** Download the authenticated user's field records before a field trip. */
export function prepareOfflineRecords() {
  if (!preparation)
    preparation = downloadRecords().finally(() => {
      preparation = null;
    });
  return preparation;
}
async function downloadRecords() {
  const auth = useAuthStore.getState();
  const owner = auth.user?.id;
  if (!owner) return;
  const network = await NetInfo.fetch();
  if (!network.isConnected || network.isInternetReachable === false)
    throw new Error("Connect to download field records.");
  const get = async (url: string, params?: object) => {
    if (useAuthStore.getState().user?.id !== owner)
      throw new Error("Account changed.");
    const response = await api.get(url, { params });
    if (response.statusText === "Offline cache")
      throw new Error(
        "Connection lost. Reconnect to finish downloading field records.",
      );
    return response.data;
  };
  {
    await get("/workspace/context");
    await get("/mamcos").catch(() => {});
    const farmers: any[] = [];
    if (auth.user?.role === "FARMER") farmers.push(await get("/farmers/me"));
    else {
      let page = 1;
      while (true) {
        const result = await get("/farmers", { page, pageSize: 100 });
        const rows = result.data ?? result;
        farmers.push(...rows);
        if (rows.length < 100) break;
        page++;
      }
    }
    for (const farmer of farmers) {
      await get(`/farmers/${farmer.id}`);
      await get(`/farmers/${farmer.id}/production-summary`);
      if (auth.user?.role !== "FARMER")
        await get(`/field-officer-visits/farmer/${farmer.id}`);
      const result = await get(`/farms/farmer/${farmer.id}`);
      for (const farm of result.data ?? result) {
        await get(`/farms/${farm.id}`);
        await get(`/plots/farm/${farm.id}`);
        const cycles = await get(`/crop-cycles/farm/${farm.id}`);
        for (const cycle of cycles.data ?? cycles)
          await get(`/crop-cycles/${cycle.id}`);
      }
    }
  }
}
