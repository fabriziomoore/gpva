import { initNetwork, onNetworkChange, getNetworkStatus } from "./network";
import { useSyncStore } from "./store";

let started = false;

export async function startSync(): Promise<void> {
  if (started || typeof window === "undefined") return;
  started = true;

  await initNetwork();
  useSyncStore.getState().setOnline(getNetworkStatus().connected);

  onNetworkChange((s) => {
    useSyncStore.getState().setOnline(s.connected);
    // Fase 3 wires the engine here.
  });
}