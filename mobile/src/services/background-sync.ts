import * as BackgroundTask from "expo-background-task";
import * as TaskManager from "expo-task-manager";
import { useAuthStore } from "../store/auth.store";
import { syncQueue } from "./sync-queue";

const TASK = "mayode-field-record-sync";
// Imported by the application entry point, including headless native launches.
TaskManager.defineTask(TASK, async () => {
  try {
    if (!useAuthStore.persist.hasHydrated())
      await useAuthStore.persist.rehydrate();
    if (!useAuthStore.getState().isAuthenticated)
      return BackgroundTask.BackgroundTaskResult.Success;
    await syncQueue.flush();
    return (await syncQueue.pending()).length
      ? BackgroundTask.BackgroundTaskResult.Failed
      : BackgroundTask.BackgroundTaskResult.Success;
  } catch {
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

export async function registerBackgroundSync() {
  if (!(await TaskManager.isAvailableAsync())) return;
  if (
    (await BackgroundTask.getStatusAsync()) ===
    BackgroundTask.BackgroundTaskStatus.Restricted
  )
    return;
  if (!(await TaskManager.isTaskRegisteredAsync(TASK)))
    await BackgroundTask.registerTaskAsync(TASK, { minimumInterval: 15 });
}
