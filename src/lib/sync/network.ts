// Thin wrapper around @capacitor/network with a browser fallback so the same
// API works in the Vite preview and in the native Capacitor WebView.

export type NetworkStatus = { connected: boolean };

type Listener = (status: NetworkStatus) => void;

const listeners = new Set<Listener>();
let initialized = false;
let lastStatus: NetworkStatus = { connected: true };
let monitorTimer: ReturnType<typeof setInterval> | null = null;
let removeNativeListener: (() => void) | null = null;

type CapacitorNetworkApi = {
  getStatus: () => Promise<{ connected: boolean }>;
  addListener: (
    eventName: "networkStatusChange",
    listenerFunc: (status: { connected: boolean }) => void,
  ) => Promise<{ remove: () => Promise<void> }>;
};

const STATUS_POLL_INTERVAL_MS = 500;
let capacitorNetwork: CapacitorNetworkApi | null = null;

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
    monitorTimer = setInterval(wake, STATUS_POLL_INTERVAL_MS);
    window.addEventListener("online", wake);
    window.addEventListener("offline", wake);
    window.addEventListener("focus", wake);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") wake();
    });
    void refreshNetworkStatus();
  };

  if (await isNative()) {
    capacitorNetwork = await loadCapacitor();
    if (capacitorNetwork) {
      const status = await capacitorNetwork.getStatus();
      lastStatus = normalizeStatus(status.connected);
      emit(lastStatus);
      const handle = await capacitorNetwork.addListener("networkStatusChange", (s) => {
        emitIfChanged(normalizeStatus(s.connected));
      });
      removeNativeListener = () => void handle.remove();
      // Redundância: eventos online/offline do WebView também disparam
      // instantaneamente quando o SO detecta a mudança de rede.
      window.addEventListener("online", () => void refreshNetworkStatus());
      window.addEventListener("offline", () => void refreshNetworkStatus());
      startContinuousMonitor();
      return;
    }
  }

  // Web fallback
  lastStatus = normalizeStatus();
  emit(lastStatus);
  window.addEventListener("online", () => emitIfChanged({ connected: true }));
  window.addEventListener("offline", () => emitIfChanged({ connected: false }));
  startContinuousMonitor();
}

export async function refreshNetworkStatus(): Promise<NetworkStatus> {
  if (typeof window === "undefined") return lastStatus;
  const status = await readDeviceNetworkStatus();
  emitIfChanged(status);
  return status;
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

function normalizeStatus(nativeConnected?: boolean): NetworkStatus {
  const webConnected = typeof navigator === "undefined" ? true : navigator.onLine !== false;
  return { connected: nativeConnected === undefined ? webConnected : nativeConnected && webConnected };
}

async function readDeviceNetworkStatus(): Promise<NetworkStatus> {
  if (capacitorNetwork) {
    try {
      const status = await capacitorNetwork.getStatus();
      return normalizeStatus(status.connected);
    } catch {
      // Fall back to the WebView signal below.
    }
  }

  return normalizeStatus();
}