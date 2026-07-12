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
import { netLog, useNetDiag } from "./diagnostics";
import { Network as CapNetwork } from "@capacitor/network";

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

// Timing baseline para provar reatividade do NetworkService (Regressão 2).
const NET_T0 = typeof performance !== "undefined" ? performance.now() : Date.now();
function nowMs(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

type CapacitorNetworkApi = {
  getStatus: () => Promise<{ connected: boolean; connectionType?: string }>;
  addListener: (
    eventName: "networkStatusChange",
    listenerFunc: (status: { connected: boolean; connectionType?: string }) => void,
  ) => Promise<{ remove: () => Promise<void> }>;
};

const DB_PING_INTERVAL_MS = 1_000;
const DB_PING_TIMEOUT_MS = 1_000;
let capacitorNetwork: CapacitorNetworkApi | null = null;
let pingRunning = false;
let pingPromise: Promise<boolean> | null = null;

async function loadCapacitor() {
  try {
    // Prefer the already-registered global (Capacitor injects plugins on
    // native at boot). Avoids relying on async chunk resolution under
    // file:// which can hang silently on some Android WebView builds.
    const w = window as unknown as {
      Capacitor?: { Plugins?: { Network?: CapacitorNetworkApi } };
    };
    const fromGlobal = w.Capacitor?.Plugins?.Network;
    if (fromGlobal) {
      netLog("loadCapacitor", "from-global", { has: true });
      return fromGlobal;
    }
    netLog("loadCapacitor", "from-static-import", { has: !!CapNetwork });
    return (CapNetwork as unknown as CapacitorNetworkApi) ?? null;
  } catch (err) {
    netLog("loadCapacitor", "error", String(err));
    return null;
  }
}

function isNative(): boolean {
  if (typeof window === "undefined") return false;
  // Synchronous detection via the Capacitor global (present on native at
  // boot; absent on the web). Avoids awaiting a dynamic import that can
  // hang under file:// on Android.
  const w = window as unknown as {
    Capacitor?: {
      isNativePlatform?: () => boolean;
      getPlatform?: () => string;
      platform?: string;
    };
  };
  const cap = w.Capacitor;
  if (!cap) return false;
  if (typeof cap.isNativePlatform === "function") return !!cap.isNativePlatform();
  const platform = cap.getPlatform?.() ?? cap.platform;
  return platform === "android" || platform === "ios";
}

export async function initNetwork(): Promise<void> {
  if (initialized || typeof window === "undefined") {
    netLog("initNetwork", "skip", { initialized, hasWindow: typeof window !== "undefined" });
    return;
  }
  initialized = true;
  useNetDiag.getState().bump("initCalls");
  netLog("initNetwork", "start");

  // 1) Descobre estado inicial do dispositivo (Capacitor ou navegador).
  const native = isNative();
  netLog("initNetwork", "isNative", { native });
  useNetDiag.getState().setIsNative(native);
  if (native) {
    capacitorNetwork = await loadCapacitor();
    netLog("initNetwork", "loadCapacitor", { loaded: !!capacitorNetwork });
    useNetDiag.getState().setPluginLoaded(!!capacitorNetwork);
    if (capacitorNetwork) {
      try {
        useNetDiag.getState().markGetStatus();
        const initial = await capacitorNetwork.getStatus();
        netLog("Network.getStatus", "resolved", initial);
        useNetDiag.getState().setNative({
          connected: initial.connected,
          connectionType: initial.connectionType ?? null,
        });
        setDeviceOnline(initial.connected);
      } catch (err) {
        netLog("Network.getStatus", "error", String(err));
        setDeviceOnline(navigator?.onLine ?? true);
      }
      useNetDiag.getState().bump("addListenerCalls");
      netLog("Network.addListener", "registering");
      try {
        await capacitorNetwork.addListener("networkStatusChange", (s) => {
          useNetDiag.getState().bump("networkStatusChangeEvents");
          useNetDiag.getState().setNative({
            connected: s.connected,
            connectionType: s.connectionType ?? null,
          });
          netLog("Network.event", "networkStatusChange", s);
          setDeviceOnline(s.connected);
        });
        useNetDiag.getState().bump("listenersRegistered");
        netLog("Network.addListener", "registered");
      } catch (err) {
        netLog("Network.addListener", "error", String(err));
      }
    } else {
      netLog("initNetwork", "capacitorNetwork missing, using navigator");
      setDeviceOnline(navigator?.onLine ?? true);
    }
  } else {
    netLog("initNetwork", "not native, navigator only", { onLine: navigator?.onLine });
    useNetDiag.getState().setPluginLoaded(false);
    setDeviceOnline(navigator?.onLine ?? true);
  }

  // 2) Eventos do WebView/navegador — instantâneos, sem esperar ping.
  window.addEventListener("online", () => {
    netLog("window", "online");
    setDeviceOnline(true);
  });
  window.addEventListener("offline", () => {
    netLog("window", "offline");
    setDeviceOnline(false);
  });
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
      useNetDiag.getState().markGetStatus();
      const s = await capacitorNetwork.getStatus();
      netLog("Network.getStatus", "refresh", s);
      useNetDiag.getState().setNative({
        connected: s.connected,
        connectionType: s.connectionType ?? null,
      });
      setDeviceOnline(s.connected);
    } catch (err) {
      netLog("Network.getStatus", "refresh-error", String(err));
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
  netLog("network", "setDeviceOnline", { deviceOnline, prev: lastStatus.deviceOnline });
  const backendReachable = deviceOnline ? lastStatus.backendReachable : false;
  commit({ deviceOnline, backendReachable });
}

function setBackendReachable(backendReachable: boolean): void {
  if (!lastStatus.deviceOnline) {
    netLog("network", "setBackendReachable-ignored (device offline)", { backendReachable });
    return;
  }
  netLog("network", "setBackendReachable", { backendReachable, prev: lastStatus.backendReachable });
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
  if (store.online !== s.deviceOnline) {
    useNetDiag.getState().bump("storeSetOnlineCalls");
    netLog("store", "setOnline", { value: s.deviceOnline });
    store.setOnline(s.deviceOnline);
  }
  if (store.backendReachable !== s.backendReachable) {
    useNetDiag.getState().bump("storeSetBackendReachableCalls");
    netLog("store", "setBackendReachable", { value: s.backendReachable });
    store.setBackendReachable(s.backendReachable);
  }
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
  const started = Date.now();
  pingPromise = pingDatabase();
  try {
    const reachable = await pingPromise;
    useNetDiag.getState().recordPing({
      ok: reachable,
      durationMs: Date.now() - started,
      error: reachable ? null : "unreachable",
    });
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