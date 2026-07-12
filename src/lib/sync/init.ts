import { initNetwork, refreshNetworkStatus } from "./network";
import { useSyncStore } from "./store";
import { drainOutbox, refreshPendingCount, scheduleSync, pullRemote } from "./engine";
import { installSessionMirror, restoreSession } from "./session-backup";
import { getLocalDB } from "@/lib/db/local-db";
import { supabase } from "@/integrations/supabase/client";
import { markOnlineAuthSuccess } from "@/lib/offline-auth";

let started = false;
let syncRetryTimer: ReturnType<typeof setInterval> | null = null;

const SYNC_RETRY_MS = 15_000;

/**
 * Reage a mudanças de conectividade puramente lendo o store. O
 * NetworkService é a única fonte de verdade — este módulo apenas orquestra
 * sync quando a combinação (deviceOnline && backendReachable) fica verdadeira.
 */
function handleConnectivityTransition(prev: {
  online: boolean;
  backendReachable: boolean;
}, next: { online: boolean; backendReachable: boolean }): void {
  const wasFullyOnline = prev.online && prev.backendReachable;
  const isFullyOnline = next.online && next.backendReachable;
  if (!wasFullyOnline && isFullyOnline) {
    scheduleSync();
    void pullRemote();
    void warmCatalogs();
  }
}

export async function startSync(): Promise<void> {
  if (started || typeof window === "undefined") return;
  started = true;

  await initNetwork();

  // Assina o store: é o único caminho de reação a conectividade.
  let prev = {
    online: useSyncStore.getState().online,
    backendReachable: useSyncStore.getState().backendReachable,
  };
  useSyncStore.subscribe((state) => {
    const next = { online: state.online, backendReachable: state.backendReachable };
    if (next.online === prev.online && next.backendReachable === prev.backendReachable) return;
    const before = prev;
    prev = next;
    handleConnectivityTransition(before, next);
  });

  // Sonda imediata (não bloqueia UI).
  void refreshNetworkStatus();

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
  await refreshPendingCount();

  // Foreground returns are the moment the user actually cares — refresh now.
  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        void refreshNetworkStatus();
      }
    });
  }

  if (typeof window !== "undefined") {
    window.addEventListener("focus", () => {
      void refreshNetworkStatus();
    });
  }

  // Warm the offline catalog cache whenever a session becomes available or the
  // device reconnects — so opening a shift offline never shows an empty grid.
  supabase.auth.onAuthStateChange((event) => {
    if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED" || event === "INITIAL_SESSION") {
      void warmCatalogs();
      // Revalidação online bem-sucedida — renova a janela de 30 dias do
      // acesso offline.
      void markOnlineAuthSuccess();
    }
  });

  // Rede de segurança: enquanto o SO informa online, continue tentando escoar
  // a outbox. Assim um único erro temporário não deixa o dia inteiro preso no
  // relatório local/offline.
  if (!syncRetryTimer) {
    syncRetryTimer = setInterval(() => {
      const st = useSyncStore.getState();
      if (st.online && st.backendReachable) void drainOutbox();
    }, SYNC_RETRY_MS);
  }

  // Initial drain + immediate network refresh.
  void drainOutbox();
  void warmCatalogs();
}

/**
 * Manual sync trigger (pull-to-refresh). Probes reachability, then drains
 * the outbox. Resolves when both steps complete (or fail).
 */
export async function manualSync(): Promise<void> {
  await refreshNetworkStatus();
  const st = useSyncStore.getState();
  if (st.online && st.backendReachable) {
    await drainOutbox();
  }
}

/**
 * Pre-fetches every catalog used by the "Add service" flow into Dexie kv so
 * the sheet works fully offline (Tipo de Serviço, Motivos, Complementos,
 * Impactos). Silently no-ops when offline or unauthenticated.
 */
async function warmCatalogs(): Promise<void> {
  if (typeof window === "undefined") return;
  const st = useSyncStore.getState();
  if (!st.online || !st.backendReachable) return;
  try {
    const { data } = await supabase.auth.getSession();
    if (!data.session) return;
  } catch {
    return;
  }
  const db = getLocalDB();
  const jobs: Array<Promise<unknown>> = [
    (async () => {
      const { data, error } = await supabase
        .from("tipos_servico")
        .select("id,name,is_negotiation,sort_order")
        .eq("active", true)
        .order("sort_order")
        .order("name");
      if (error || !data) return;
      await db.kv.put({ key: "cat:service_types:global", value: data });
    })(),
    (async () => {
      const { data, error } = await supabase
        .from("motivos_inviabilidade")
        .select("id,name")
        .eq("active", true)
        .order("name");
      if (error || !data) return;
      await db.kv.put({ key: "cat:inviability_reasons:global", value: data });
    })(),
    (async () => {
      const { data, error } = await supabase
        .from("complementos_servico")
        .select("id,name,sort_order")
        .eq("active", true)
        .order("sort_order")
        .order("name");
      if (error || !data) return;
      await db.kv.put({ key: "cat:service_complements:global", value: data });
    })(),
    (async () => {
      const { data, error } = await supabase
        .from("impactos")
        .select("id,name")
        .eq("active", true)
        .order("name");
      if (error || !data) return;
      await db.kv.put({ key: "cat:impacts:global", value: data });
    })(),
  ];
  await Promise.allSettled(jobs);
}