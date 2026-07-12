// Thin wrapper around @capacitor/network with a browser fallback so the same
// API works in the Vite preview and in the native Capacitor WebView.

export type NetworkStatus = { connected: boolean };

type Listener = (status: NetworkStatus) => void;

const listeners = new Set<Listener>();
let initialized = false;
let lastStatus: NetworkStatus = { connected: true };
let monitorTimer: ReturnType<typeof setInterval> | null = null;

type CapacitorNetworkApi = {
  getStatus: () => Promise<{ connected: boolean }>;
  addListener: (
    eventName: "networkStatusChange",
    listenerFunc: (status: { connected: boolean }) => void,
  ) => Promise<{ remove: () => Promise<void> }>;
};

const DB_PING_INTERVAL_MS = 1_000;
const DB_PING_TIMEOUT_MS = 900;
let capacitorNetwork: CapacitorNetworkApi | null = null;
let refreshRunning = false;
let refreshPromise: Promise<NetworkStatus> | null = null;

async function loadCapacitor() {
  try {
    // Dynamic import so the package is only resolved when present (it is, but
    // this keeps SSR safe).
    const mod = await import("@capacitor/network");
    return mod.Network as CapacitorNetworkApi;
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
    const wake = () => void refreshNetworkStatus();
    const markOfflineThenProbe = () => {
      emitIfChanged({ connected: false });
      wake();
    };
    monitorTimer = setInterval(wake, DB_PING_INTERVAL_MS);
    window.addEventListener("online", wake);
    window.addEventListener("offline", markOfflineThenProbe);
    window.addEventListener("focus", wake);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") wake();
    });
    void refreshNetworkStatus();
  };

  if (await isNative()) {
    capacitorNetwork = await loadCapacitor();
    if (capacitorNetwork) {
      const status = await refreshNetworkStatus();
      emit(status);
      await capacitorNetwork.addListener("networkStatusChange", (s) => {
        if (!s.connected) emitIfChanged({ connected: false });
        void refreshNetworkStatus();
      });
      // Redundância: eventos online/offline do WebView também disparam
      // instantaneamente quando o SO detecta a mudança de rede.
      window.addEventListener("online", () => void refreshNetworkStatus());
      window.addEventListener("offline", () => {
        emitIfChanged({ connected: false });
        void refreshNetworkStatus();
      });
      startContinuousMonitor();
      return;
    }
  }

  // Web fallback
  await refreshNetworkStatus();
  window.addEventListener("online", () => void refreshNetworkStatus());
  window.addEventListener("offline", () => {
    emitIfChanged({ connected: false });
    void refreshNetworkStatus();
  });
  startContinuousMonitor();
}

export async function refreshNetworkStatus(): Promise<NetworkStatus> {
  if (typeof window === "undefined") return lastStatus;
  if (refreshRunning && refreshPromise) return refreshPromise;
  refreshRunning = true;
  refreshPromise = (async () => {
    try {
      const status = await readDeviceNetworkStatus();
      emitIfChanged(status);
      return status;
    } finally {
      refreshRunning = false;
      refreshPromise = null;
    }
  })();
  return refreshPromise;
}

/**
 * A successful database write/read is stronger evidence than navigator status.
 * Use this to clear the offline UI immediately after the outbox drains.
 */
export function reportDatabaseReachable(): void {
  emitIfChanged({ connected: true });
}

/**
 * Network-level write/read failures should flip the UI to offline even when
 * Android's WebView keeps navigator.onLine as true.
 */
export function reportDatabaseUnreachable(): void {
  emitIfChanged({ connected: false });
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

function emitIfChanged(s: NetworkStatus): void {
  if (s.connected === lastStatus.connected) {
    lastStatus = s;
    return;
  }
  emit(s);
}

async function readDeviceNetworkStatus(): Promise<NetworkStatus> {
  const databaseReachable = await pingDatabase();
  return { connected: databaseReachable };
}

async function pingDatabase(): Promise<boolean> {
  const config = getBackendConfig();
  if (!config || typeof fetch === "undefined") return true;

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), DB_PING_TIMEOUT_MS);

  try {
    const response = await fetch(`${config.url}/rest/v1/setores?select=id&limit=1`, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
      headers: buildPingHeaders(config.key),
    });

    // Permission/auth responses still prove the database endpoint answered.
    // Network failures, timeouts and backend 5xx responses put the app offline.
    return response.status < 500;
  } catch {
    return false;
  } finally {
    window.clearTimeout(timeout);
  }
}

function buildPingHeaders(key: string): HeadersInit {
  const headers: Record<string, string> = { apikey: key };
  if (!isOpaquePublishableKey(key)) headers.Authorization = `Bearer ${key}`;
  return headers;
}

function isOpaquePublishableKey(value: string): boolean {
  return value.startsWith("sb_publishable_") || value.startsWith("sb_secret_");
}

function getBackendConfig(): { url: string; key: string } | null {
  const env = import.meta.env as Record<string, string | undefined>;
  const nodeEnv = typeof process === "undefined" ? {} : process.env;
  const rawUrl = env.VITE_SUPABASE_URL ?? nodeEnv.SUPABASE_URL;
  const key =
    env.VITE_SUPABASE_PUBLISHABLE_KEY ??
    env.VITE_SUPABASE_ANON_KEY ??
    nodeEnv.SUPABASE_PUBLISHABLE_KEY ??
    nodeEnv.SUPABASE_ANON_KEY;

  if (!rawUrl || !key) return null;
  return { url: rawUrl.replace(/\/$/, ""), key };
}