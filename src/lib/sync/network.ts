// Thin wrapper around @capacitor/network with a browser fallback so the same
// API works in the Vite preview and in the native Capacitor WebView.

export type NetworkStatus = { connected: boolean };

type Listener = (status: NetworkStatus) => void;

const listeners = new Set<Listener>();
let initialized = false;
let lastStatus: NetworkStatus = { connected: true };
let monitorTimer: ReturnType<typeof setInterval> | null = null;
let probing = false;

const REACHABILITY_INTERVAL_MS = 1_000;
const REACHABILITY_TIMEOUT_MS = 1_500;

async function loadCapacitor() {
  try {
    // Dynamic import so the package is only resolved when present (it is, but
    // this keeps SSR safe).
    const mod = await import("@capacitor/network");
    return mod.Network;
  } catch {
    return null;
  }
}

async function isNative(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  try {
    const { Capacitor } = await import("@capacitor/core");
    return Capacitor.isNativePlatform();
  } catch {
    const w = window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } };
    return !!w.Capacitor?.isNativePlatform?.();
  }
}

export async function initNetwork(): Promise<void> {
  if (initialized || typeof window === "undefined") return;
  initialized = true;

  const startContinuousMonitor = () => {
    if (monitorTimer) return;
    const wake = () => void probeReachabilityAndEmit();
    monitorTimer = setInterval(wake, REACHABILITY_INTERVAL_MS);
    window.addEventListener("online", wake);
    window.addEventListener("offline", wake);
    window.addEventListener("focus", wake);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") wake();
    });
    void probeReachabilityAndEmit();
  };

  if (await isNative()) {
    const Network = await loadCapacitor();
    if (Network) {
      const status = await Network.getStatus();
      lastStatus = { connected: status.connected };
      emit(lastStatus);
      await Network.addListener("networkStatusChange", (s) => {
        lastStatus = { connected: s.connected };
        emit(lastStatus);
        void probeReachabilityAndEmit();
      });
      // Redundância: eventos online/offline do WebView também disparam
      // instantaneamente quando o SO detecta a mudança de rede.
      window.addEventListener("online", () => {
        emit((lastStatus = { connected: true }));
        void probeReachabilityAndEmit();
      });
      window.addEventListener("offline", () => emit((lastStatus = { connected: false })));
      startContinuousMonitor();
      return;
    }
  }

  // Web fallback
  lastStatus = { connected: navigator.onLine };
  emit(lastStatus);
  window.addEventListener("online", () => {
    emit((lastStatus = { connected: true }));
    void probeReachabilityAndEmit();
  });
  window.addEventListener("offline", () => emit((lastStatus = { connected: false })));
  startContinuousMonitor();
}

export function getNetworkStatus(): NetworkStatus {
  return lastStatus;
}

export function onNetworkChange(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit(s: NetworkStatus) {
  lastStatus = s;
  listeners.forEach((l) => l(s));
}

async function probeReachabilityAndEmit(): Promise<void> {
  if (probing || typeof window === "undefined") return;
  probing = true;
  try {
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      if (lastStatus.connected) emit({ connected: false });
      return;
    }
    const connected = await probeReachability();
    if (connected !== lastStatus.connected) emit({ connected });
  } finally {
    probing = false;
  }
}

async function probeReachability(): Promise<boolean> {
  const base = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  if (!base) return typeof navigator !== "undefined" ? navigator.onLine : true;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), REACHABILITY_TIMEOUT_MS);
  try {
    const res = await fetch(`${base}/auth/v1/health?_=${Date.now()}`, {
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