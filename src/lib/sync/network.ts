// NetworkService — única fonte de verdade da conectividade.
//
// Separa dois estados independentes:
//   • deviceOnline    → o Android (via @capacitor/network) ou o navegador
//                       (navigator.onLine + eventos online/offline) diz que
//                       existe interface de rede ativa. Reage instantaneamente.
//   • backendReachable → resultado do ping ao backend. Nunca influencia
//                       deviceOnline; só serve para diferenciar "conectado
//                       mas servidor indisponível" de "sem internet".
//
// O engine de sincronização NUNCA escreve nesse módulo — ele apenas consome
// o estado do store.

import { useSyncStore } from "./store";

export type NetworkStatus = {
  /** @deprecated use deviceOnline; mantido por compat. */
  connected: boolean;
  deviceOnline: boolean;
  backendReachable: boolean;
};

type Listener = (status: NetworkStatus) => void;

const listeners = new Set<Listener>();
let initialized = false;
let lastStatus: NetworkStatus = {
  connected: true,
  deviceOnline: true,
  backendReachable: true,
};
let monitorTimer: ReturnType<typeof setInterval> | null = null;

type CapacitorNetworkApi = {
  getStatus: () => Promise<{ connected: boolean }>;
  addListener: (
    eventName: "networkStatusChange",
    listenerFunc: (status: { connected: boolean }) => void,
  ) => Promise<{ remove: () => Promise<void> }>;
};

const DB_PING_INTERVAL_MS = 1_000;
const DB_PING_TIMEOUT_MS = 1_000;
let capacitorNetwork: CapacitorNetworkApi | null = null;
let pingRunning = false;
let pingPromise: Promise<boolean> | null = null;

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

  // 1) Descobre estado inicial do dispositivo (Capacitor ou navegador).
  if (await isNative()) {
    capacitorNetwork = await loadCapacitor();
    if (capacitorNetwork) {
      try {
        const initial = await capacitorNetwork.getStatus();
        setDeviceOnline(initial.connected);
      } catch {
        setDeviceOnline(navigator?.onLine ?? true);
      }
      await capacitorNetwork.addListener("networkStatusChange", (s) => {
        setDeviceOnline(s.connected);
      });
    } else {
      setDeviceOnline(navigator?.onLine ?? true);
    }
  } else {
    setDeviceOnline(navigator?.onLine ?? true);
  }

  // 2) Eventos do WebView/navegador — instantâneos, sem esperar ping.
  window.addEventListener("online", () => setDeviceOnline(true));
  window.addEventListener("offline", () => setDeviceOnline(false));
  window.addEventListener("focus", () => {
    setDeviceOnline(navigator?.onLine ?? lastStatus.deviceOnline);
    void pingBackendIfOnline();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      setDeviceOnline(navigator?.onLine ?? lastStatus.deviceOnline);
      void pingBackendIfOnline();
    }
  });

  // 3) Monitor contínuo de alcance do backend (1s). NUNCA muda deviceOnline;
  //    apenas atualiza backendReachable.
  monitorTimer = setInterval(() => {
    void pingBackendIfOnline();
  }, DB_PING_INTERVAL_MS);

  void pingBackendIfOnline();
}

/**
 * Força um refresh imediato: reflete o estado atual do dispositivo e dispara
 * um ping ao backend. Usado por pull-to-refresh / boot.
 */
export async function refreshNetworkStatus(): Promise<NetworkStatus> {
  if (typeof window === "undefined") return lastStatus;
  if (capacitorNetwork) {
    try {
      const s = await capacitorNetwork.getStatus();
      setDeviceOnline(s.connected);
    } catch {
      /* ignore */
    }
  } else if (typeof navigator !== "undefined") {
    setDeviceOnline(navigator.onLine);
  }
  await pingBackendIfOnline();
  return lastStatus;
}

export function getNetworkStatus(): NetworkStatus {
  return lastStatus;
}

export function onNetworkChange(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function setDeviceOnline(deviceOnline: boolean): void {
  const backendReachable = deviceOnline ? lastStatus.backendReachable : false;
  commit({ deviceOnline, backendReachable });
}

function setBackendReachable(backendReachable: boolean): void {
  // O ping nunca deve alterar deviceOnline. Se, por qualquer motivo, o ping
  // rodou enquanto o dispositivo já estava offline, ignoramos o resultado.
  if (!lastStatus.deviceOnline) return;
  commit({ deviceOnline: true, backendReachable });
}

function commit(next: { deviceOnline: boolean; backendReachable: boolean }): void {
  const changed =
    next.deviceOnline !== lastStatus.deviceOnline ||
    next.backendReachable !== lastStatus.backendReachable;
  const status: NetworkStatus = {
    deviceOnline: next.deviceOnline,
    backendReachable: next.backendReachable,
    connected: next.deviceOnline, // compat com callers antigos
  };
  lastStatus = status;
  applyStatusToSyncStore(status);
  if (changed) listeners.forEach((l) => l(status));
}

function applyStatusToSyncStore(s: NetworkStatus): void {
  const store = useSyncStore.getState();
  if (store.online !== s.deviceOnline) store.setOnline(s.deviceOnline);
  if (store.backendReachable !== s.backendReachable)
    store.setBackendReachable(s.backendReachable);
  if (!s.deviceOnline && store.phase === "syncing") store.setPhase("idle");
  if (s.deviceOnline && s.backendReachable && store.phase === "error") {
    store.setPhase("idle");
    store.setLastError(null);
  }
}

async function pingBackendIfOnline(): Promise<void> {
  if (typeof window === "undefined") return;
  if (!lastStatus.deviceOnline) return;
  if (pingRunning && pingPromise) {
    await pingPromise;
    return;
  }
  pingRunning = true;
  pingPromise = pingDatabase();
  try {
    const reachable = await pingPromise;
    setBackendReachable(reachable);
  } finally {
    pingRunning = false;
    pingPromise = null;
  }
}

async function pingDatabase(): Promise<boolean> {
  const config = getBackendConfig();
  if (!config || typeof fetch === "undefined") return true;

  const endpoints = [
    `${config.url}/rest/v1/`,
    `${config.url}/rest/v1/setores?select=id&limit=1`,
  ];

  for (const endpoint of endpoints) {
    const reachable = await pingEndpoint(endpoint, config.key);
    if (reachable === true) return true;
  }

  return false;
}

async function pingEndpoint(endpoint: string, key: string): Promise<boolean | null> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), DB_PING_TIMEOUT_MS);

  try {
    const response = await fetch(endpoint, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
      headers: buildPingHeaders(key),
    });

    // Permission/auth/not-found responses still prove the database endpoint answered.
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