// Thin wrapper around @capacitor/network with a browser fallback so the same
// API works in the Vite preview and in the native Capacitor WebView.

export type NetworkStatus = { connected: boolean };

type Listener = (status: NetworkStatus) => void;

const listeners = new Set<Listener>();
let initialized = false;
let lastStatus: NetworkStatus = { connected: true };

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

function isNative(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } };
  return !!w.Capacitor?.isNativePlatform?.();
}

export async function initNetwork(): Promise<void> {
  if (initialized || typeof window === "undefined") return;
  initialized = true;

  if (isNative()) {
    const Network = await loadCapacitor();
    if (Network) {
      const status = await Network.getStatus();
      lastStatus = { connected: status.connected };
      emit(lastStatus);
      await Network.addListener("networkStatusChange", (s) => {
        lastStatus = { connected: s.connected };
        emit(lastStatus);
      });
      return;
    }
  }

  // Web fallback
  lastStatus = { connected: navigator.onLine };
  emit(lastStatus);
  window.addEventListener("online", () => emit((lastStatus = { connected: true })));
  window.addEventListener("offline", () => emit((lastStatus = { connected: false })));
}

export function getNetworkStatus(): NetworkStatus {
  return lastStatus;
}

export function onNetworkChange(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit(s: NetworkStatus) {
  listeners.forEach((l) => l(s));
}