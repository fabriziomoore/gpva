import { initNetwork, onNetworkChange, getNetworkStatus } from "./network";
import { useSyncStore } from "./store";
import { drainOutbox, refreshPendingCount, scheduleSync } from "./engine";
import { installSessionMirror, restoreSession } from "./session-backup";

let started = false;

export async function startSync(): Promise<void> {
  if (started || typeof window === "undefined") return;
  started = true;

  await restoreSession();
  installSessionMirror();
  await initNetwork();
  useSyncStore.getState().setOnline(getNetworkStatus().connected);
  await refreshPendingCount();

  onNetworkChange((s) => {
    useSyncStore.getState().setOnline(s.connected);
    if (s.connected) scheduleSync();
  });

  // Initial drain + periodic background sweep
  void drainOutbox();
  setInterval(() => {
    if (useSyncStore.getState().online) void drainOutbox();
  }, 30_000);
}