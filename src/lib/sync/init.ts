import { initNetwork, onNetworkChange, getNetworkStatus } from "./network";
import { useSyncStore } from "./store";
import { drainOutbox, refreshPendingCount, scheduleSync } from "./engine";
import { installSessionMirror, restoreSession } from "./session-backup";

let started = false;
let probing = false;
let probeTimer: ReturnType<typeof setTimeout> | null = null;

const ONLINE_INTERVAL_MS = 3 * 60 * 1000; // 3 min when online
const OFFLINE_INTERVAL_MS = 1_000; // 1 s when offline
const PROBE_TIMEOUT_MS = 4_000;

async function probeReachability(): Promise<boolean> {
  const base = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  if (!base) return typeof navigator !== "undefined" ? navigator.onLine : true;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), PROBE_TIMEOUT_MS);
  try {
    const res = await fetch(`${base}/auth/v1/health`, {
      method: "GET",
      cache: "no-store",
      signal: ctrl.signal,
    });
    return res.ok || res.status === 401 || res.status === 404;
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
}

function scheduleNextProbe(): void {
  if (probeTimer) clearTimeout(probeTimer);
  const delay = useSyncStore.getState().online ? ONLINE_INTERVAL_MS : OFFLINE_INTERVAL_MS;
  probeTimer = setTimeout(() => void runProbe(), delay);
}

async function runProbe(): Promise<void> {
  if (probing) return;
  probing = true;
  try {
    const navOnline = typeof navigator !== "undefined" ? navigator.onLine : true;
    const reachable = navOnline ? await probeReachability() : false;
    const prev = useSyncStore.getState().online;
    if (prev !== reachable) {
      useSyncStore.getState().setOnline(reachable);
      if (reachable) scheduleSync();
    } else if (reachable) {
      scheduleSync();
    }
  } finally {
    probing = false;
    scheduleNextProbe();
  }
}

export async function startSync(): Promise<void> {
  if (started || typeof window === "undefined") return;
  started = true;

  await restoreSession();
  installSessionMirror();
  await initNetwork();
  useSyncStore.getState().setOnline(getNetworkStatus().connected);
  await refreshPendingCount();

  onNetworkChange((s) => {
    if (!s.connected) {
      useSyncStore.getState().setOnline(false);
      scheduleNextProbe();
    } else {
      void runProbe();
    }
  });

  // Initial drain + adaptive reachability probe loop.
  void drainOutbox();
  void runProbe();
}