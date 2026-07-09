import { initNetwork, onNetworkChange, getNetworkStatus } from "./network";
import { useSyncStore } from "./store";
import { drainOutbox, refreshPendingCount, scheduleSync, pullRemote } from "./engine";
import { installSessionMirror, restoreSession } from "./session-backup";
import { getLocalDB } from "@/lib/db/local-db";

let started = false;
let probing = false;
let probeTimer: ReturnType<typeof setTimeout> | null = null;
let syncRetryTimer: ReturnType<typeof setInterval> | null = null;

// Adaptive cadence: light polling online, exponential backoff offline.
// Real network events (@capacitor/network, visibilitychange) drive the
// instantaneous transitions; polling is just the safety net.
// Detecção quase instantânea: o estado visual online/offline vem dos eventos
// nativos (@capacitor/network + online/offline). O probe abaixo NÃO derruba o
// app para offline quando falha: em Android/Capacitor um endpoint de saúde pode
// falhar por CORS/DNS/captive network mesmo com internet suficiente para a API.
// Se usarmos essa falha como verdade, a outbox para de tentar enviar e a linha
// fica vermelha como padrão. O envio real é quem confirma se a nuvem aceitou.
const ONLINE_INTERVAL_MS = 3_000;
const OFFLINE_BACKOFF_MS = [1_500, 3_000, 5_000, 10_000] as const;
const PROBE_TIMEOUT_MS = 5_000;
const SYNC_RETRY_MS = 15_000;
let offlineStep = 0;

async function probeReachability(): Promise<boolean> {
  const base = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  if (!base) return typeof navigator !== "undefined" ? navigator.onLine : true;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), PROBE_TIMEOUT_MS);
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

function scheduleNextProbe(): void {
  if (probeTimer) clearTimeout(probeTimer);
  const online = useSyncStore.getState().online;
  const delay = online
    ? ONLINE_INTERVAL_MS
    : OFFLINE_BACKOFF_MS[Math.min(offlineStep, OFFLINE_BACKOFF_MS.length - 1)];
  probeTimer = setTimeout(() => void runProbe(), delay);
}

async function runProbe(): Promise<void> {
  if (probing) return Promise.resolve();
  probing = true;
  try {
    const browserOnline = typeof navigator !== "undefined" ? navigator.onLine : true;
    if (!browserOnline || !getNetworkStatus().connected) {
      useSyncStore.getState().setOnline(false);
      offlineStep = 0;
      return;
    }

    const reachable = await probeReachability();
    const prev = useSyncStore.getState().online;
    if (reachable) {
      if (!prev) useSyncStore.getState().setOnline(true);
      offlineStep = 0;
      scheduleSync();
      void pullRemote();
    } else {
      offlineStep = Math.min(offlineStep + 1, OFFLINE_BACKOFF_MS.length - 1);
      // Mantém o estado online quando o SO/WebView diz que há rede. A tentativa
      // periódica de drainOutbox registrará erro real se a API estiver fora.
      if (!prev) useSyncStore.getState().setOnline(true);
    }
  } finally {
    probing = false;
    scheduleNextProbe();
  }
}

export async function startSync(): Promise<void> {
  if (started || typeof window === "undefined") return;
  started = true;

  // One-shot cleanup: catálogos ficaram globais; apagar chaves antigas com
  // team_id no sufixo (podem ter arrays vazios em cache) para evitar UI vazia.
  try {
    const db = getLocalDB();
    const done = await db.kv.get("__catalog_cache_v2_cleared");
    if (!done) {
      const prefixes = [
        "cat:service_types:",
        "cat:inviability_reasons:",
        "cat:service_complements:",
        "cat:impacts:",
      ];
      const keys = await db.kv.toCollection().primaryKeys();
      const stale = (keys as string[]).filter(
        (k) => prefixes.some((p) => k.startsWith(p)) && !k.endsWith(":global"),
      );
      if (stale.length) await db.kv.bulkDelete(stale);
      await db.kv.put({ key: "__catalog_cache_v2_cleared", value: true });
    }
  } catch {
    /* ignore */
  }

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
      useSyncStore.getState().setOnline(true);
      scheduleSync();
      void pullRemote();
      void runProbe();
    }
  });

  // Foreground returns are the moment the user actually cares — probe now.
  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") void runProbe();
    });
  }

  // Rede de segurança: enquanto o SO informa online, continue tentando escoar
  // a outbox. Assim um único erro temporário não deixa o dia inteiro preso no
  // relatório local/offline.
  if (!syncRetryTimer) {
    syncRetryTimer = setInterval(() => {
      if (useSyncStore.getState().online) void drainOutbox();
    }, SYNC_RETRY_MS);
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
  if (!probing) await runProbe();
  if (useSyncStore.getState().online) {
    await drainOutbox();
  }
}