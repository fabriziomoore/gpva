import { initNetwork, onNetworkChange, getNetworkStatus } from "./network";
import { useSyncStore } from "./store";
import { drainOutbox, refreshPendingCount, scheduleSync } from "./engine";
import { installSessionMirror, restoreSession } from "./session-backup";

let started = false;
let probing = false;
let probeTimer: ReturnType<typeof setTimeout> | null = null;

// Adaptive cadence: light polling online, exponential backoff offline.
// Real network events (@capacitor/network, visibilitychange) drive the
// instantaneous transitions; polling is just the safety net.
const ONLINE_INTERVAL_MS = 30_000; // 30 s when online
const OFFLINE_BACKOFF_MS = [2_000, 5_000, 10_000, 30_000] as const;
const PROBE_TIMEOUT_MS = 3_000;
let offlineStep = 0;

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
  const online = useSyncStore.getState().online;
  const delay = online
    ? ONLINE_INTERVAL_MS
    : OFFLINE_BACKOFF_MS[Math.min(offlineStep, OFFLINE_BACKOFF_MS.length - 1)];
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
      if (reachable) {
        offlineStep = 0;
        scheduleSync();
      } else {
        offlineStep = 0; // start backoff fresh on each fall
      }
    } else if (!reachable) {
      offlineStep = Math.min(offlineStep + 1, OFFLINE_BACKOFF_MS.length - 1);
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
      offlineStep = 0;
      scheduleNextProbe();
    } else {
      void runProbe();
    }
  });

  // Foreground returns are the moment the user actually cares — probe now.
  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") void runProbe();
    });
  }

  // Initial drain + adaptive reachability probe loop.
  void drainOutbox();
  void runProbe();
}

/**
 * Manual sync trigger (pull-to-refresh). Probes reachability, then drains
 * the outbox. Resolves when both steps complete (or fail).
 */
export async function manualSync(): Promise<void> {
  await runProbe();
  if (useSyncStore.getState().online) {
    await drainOutbox();
  }
}