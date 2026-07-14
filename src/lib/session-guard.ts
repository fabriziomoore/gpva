import { supabase } from "@/integrations/supabase/client";
import { newId } from "@/lib/db/local-db";
import { pullRemote } from "@/lib/sync/engine";
import { getLocalDB, type LocalShift } from "@/lib/db/local-db";
import { clearRemembered } from "@/lib/remember-access";
import { getLastUserId } from "@/lib/offline-auth";
import { toast } from "sonner";

const LOGIN_TS_KEY = "gpva.loginAt";
const SESSION_ID_KEY = "gpva.sessionId";
const MAX_SESSION_MS = 12 * 60 * 60 * 1000; // 12h
const EXPIRY_CHECK_MS = 5 * 60 * 1000; // 5 min
const HEARTBEAT_MS = 60 * 1000; // 60 s — realtime cobre takeover instantâneo
const ACTIVE_CHECK_THROTTLE_MS = 10 * 1000; // 10 s
const AUTH_PROBE_TIMEOUT_MS = 2_500;

let started = false;
let expiryTimer: ReturnType<typeof setInterval> | null = null;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let globalSessionProbeTimer: ReturnType<typeof setInterval> | null = null;
let realtimeChannel: ReturnType<typeof supabase.channel> | null = null;
let shiftsChannel: ReturnType<typeof supabase.channel> | null = null;
let currentUserId: string | null = null;
let watchedUserId: string | null = null;
let signingOut = false;
let claimedAt = 0;
let lastActiveCheckAt = 0;
let activeCheckPromise: Promise<boolean> | null = null;
const CLAIM_GRACE_MS = 10_000;

function localSessionId(): string | null {
  try {
    return localStorage.getItem(SESSION_ID_KEY);
  } catch {
    return null;
  }
}

function setLocalSessionId(id: string): void {
  try {
    localStorage.setItem(SESSION_ID_KEY, id);
  } catch {
    /* ignore */
  }
}

function setLoginTs(ts: number): void {
  try {
    localStorage.setItem(LOGIN_TS_KEY, String(ts));
  } catch {
    /* ignore */
  }
}

function getLoginTs(): number | null {
  try {
    const v = localStorage.getItem(LOGIN_TS_KEY);
    return v ? Number(v) : null;
  } catch {
    return null;
  }
}

function isOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

function withAuthProbeTimeout<T>(promise: PromiseLike<T>): Promise<T | null> {
  if (typeof window === "undefined") return Promise.resolve(promise);
  return Promise.race([
    promise,
    new Promise<null>((resolve) => {
      window.setTimeout(() => resolve(null), AUTH_PROBE_TIMEOUT_MS);
    }),
  ]);
}

async function getAuthUserIdOfflineSafe(): Promise<string | null> {
  try {
    if (!isOffline()) {
      const result = await withAuthProbeTimeout(supabase.auth.getUser());
      if (!result?.error && result?.data.user?.id) return result.data.user.id;
    }
  } catch {
    /* rede indisponível — usa sessão local abaixo */
  }

  try {
    const { data } = await supabase.auth.getSession();
    if (data.session?.user.id) return data.session.user.id;
  } catch {
    /* segue para fallback persistente */
  }

  // Fallback offline: sem sessão Supabase, usa o último userId gravado em
  // Preferences no último login online bem-sucedido. Isso libera
  // assertActiveSession() e as escritas locais em modo offline após signOut.
  try {
    return await getLastUserId();
  } catch {
    return null;
  }
}

async function forceSignOut(reason: "expired" | "taken_over"): Promise<void> {
  if (signingOut) return;
  signingOut = true;
  try {
    stopPerUserWatchers();
    try {
      localStorage.removeItem(LOGIN_TS_KEY);
      localStorage.removeItem(SESSION_ID_KEY);
    } catch {
      /* ignore */
    }
    // Evita relogin automático offline após ser expulso.
    await clearRemembered().catch(() => undefined);
    // Escopo local: revogar apenas a sessão deste dispositivo. O padrão
    // ("global") invalidaria o refresh token em TODOS os dispositivos do
    // usuário — inclusive o novo device que acabou de logar — deixando-o
    // travado sem conseguir autenticar requisições.
    await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
    if (reason === "expired") {
      toast.error("Sessão expirada. Faça login novamente.");
    } else {
      toast.error("Sua conta foi acessada em outro dispositivo.");
    }
    if (typeof window !== "undefined" && window.location.pathname !== "/auth") {
      const event = new CustomEvent("gpva:force-auth", {
        cancelable: true,
        detail: { reason },
      });
      const shouldFallback = window.dispatchEvent(event);
      if (shouldFallback) window.location.replace("/auth");
    }
  } finally {
    signingOut = false;
  }
}

export async function verifyActiveSession(opts: { force?: boolean } = {}): Promise<boolean> {
  if (typeof window === "undefined" || signingOut) return !signingOut;

  const now = Date.now();
  if (!opts.force && activeCheckPromise && now - lastActiveCheckAt < ACTIVE_CHECK_THROTTLE_MS) {
    return activeCheckPromise;
  }
  if (!opts.force && now - lastActiveCheckAt < ACTIVE_CHECK_THROTTLE_MS) return true;

  lastActiveCheckAt = now;
  activeCheckPromise = (async () => {
    const mine = localSessionId();
    let userId = currentUserId;
    if (!userId) {
      userId = await getAuthUserIdOfflineSafe();
    }
    if (!userId) return false;
    if (!mine) {
      await claimSession(userId);
      return true;
    }

    const result = await withAuthProbeTimeout(
      supabase
        .from("active_sessions")
        .select("session_id")
        .eq("user_id", userId)
        .maybeSingle(),
    );

    // Se estiver sem rede ou a leitura falhar, não bloqueia o modo offline.
    if (!result) return true;
    const { data, error } = result;
    if (error || !data) return true;
    if (data.session_id === mine) {
      // touch last_seen_at — barato e útil para o painel admin de dispositivos.
      void supabase
        .from("active_sessions")
        .update({ last_seen_at: new Date().toISOString() })
        .eq("user_id", userId);
      return true;
    }
    if (Date.now() - claimedAt < CLAIM_GRACE_MS) return true;

    await forceSignOut("taken_over");
    return false;
  })().finally(() => {
    activeCheckPromise = null;
  });

  return activeCheckPromise;
}

async function attachSessionForUser(userId: string, opts: { claim: boolean }): Promise<void> {
  if (opts.claim || !localSessionId()) {
    if (isOffline() && !opts.claim) {
      currentUserId = userId;
      return;
    }
    await claimSession(userId);
    return;
  }

  currentUserId = userId;
  // Só re-cria os canais realtime se o usuário mudou. Reassinar a cada
  // INITIAL_SESSION/SIGNED_IN (dispara em foco/refresh de token) abre uma
  // janela em que o evento de takeover do outro dispositivo é perdido.
  if (watchedUserId !== userId) {
    startPerUserWatchers(userId);
    void pullRemote();
  }
  void verifyActiveSession({ force: true });
}

export async function assertActiveSession(): Promise<void> {
  const ok = await verifyActiveSession({ force: true });
  if (!ok) throw new Error("Sua conta foi acessada em outro dispositivo. Faça login novamente.");
}

async function claimSession(userId: string): Promise<void> {
  const sessionId = newId();
  setLocalSessionId(sessionId);
  setLoginTs(Date.now());
  currentUserId = userId;
  if (isOffline()) return;
  const { error } = await supabase
    .from("active_sessions")
    .upsert(
      {
        user_id: userId,
        session_id: sessionId,
        updated_at: new Date().toISOString(),
        last_seen_at: new Date().toISOString(),
        user_agent: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 500) : null,
      },
      { onConflict: "user_id" },
    );
  if (error) console.warn("[session-guard] claim failed", error);
  claimedAt = Date.now();
  startPerUserWatchers(userId);
  void pullRemote();
}

export async function claimCurrentSession(): Promise<void> {
  if (typeof window === "undefined") return;
  const userId = await getAuthUserIdOfflineSafe();
  if (!userId) return;
  await claimSession(userId);
}

function startPerUserWatchers(userId: string): void {
  stopPerUserWatchers();
  currentUserId = userId;
  watchedUserId = userId;

  realtimeChannel = supabase
    .channel(`active_sessions:${userId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "active_sessions", filter: `user_id=eq.${userId}` },
      (payload) => {
        const row = (payload.new ?? payload.old) as { session_id?: string } | null;
        if (!row?.session_id) return;
        const mine = localSessionId();
        if (!mine || row.session_id === mine) return;
        // Ignora eventos ecoados enquanto o próprio claim está propagando.
        if (Date.now() - claimedAt < CLAIM_GRACE_MS) return;
        void forceSignOut("taken_over");
      },
    )
    .subscribe();

  // Espelha em tempo real o fechamento remoto do expediente para o Dexie local,
  // evitando duplicação quando outro dispositivo finaliza antes.
  shiftsChannel = supabase
    .channel(`expedientes:${userId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "expedientes", filter: `team_id=eq.${userId}` },
      (payload) => {
        const row = (payload.new ?? payload.old) as
          | { id: string; status: string; ended_at: string | null; report_text: string | null; variable_rate_snapshot: number | null; started_at: string; team_id: string }
          | null;
        if (!row) return;
        void mirrorRemoteShift(row);
      },
    )
    .subscribe();

  heartbeatTimer = setInterval(() => {
    void verifyActiveSession({ force: true });
  }, HEARTBEAT_MS);
}

async function mirrorRemoteShift(remote: {
  id: string;
  status: string;
  ended_at: string | null;
  report_text: string | null;
  variable_rate_snapshot: number | null;
  started_at: string;
  team_id: string;
}): Promise<void> {
  try {
    const db = getLocalDB();
    const local = await db.shifts.get(remote.id);
    // Ignora se local ainda tem escrita pendente (sync se encarrega).
    if (local?.sync_state === "pending") return;
    const merged: LocalShift = {
      id: remote.id,
      team_id: remote.team_id,
      started_at: remote.started_at,
      ended_at: remote.ended_at,
      status: remote.status as "open" | "closed",
      report_text: remote.report_text,
      variable_rate_snapshot: remote.variable_rate_snapshot,
      updated_at: new Date().toISOString(),
      sync_state: "synced",
    };
    await db.shifts.put(merged);
    if (remote.status === "closed" && local?.status === "open") {
      toast.message("Expediente finalizado em outro dispositivo.");
      if (typeof window !== "undefined" && window.location.pathname.startsWith("/shift")) {
        window.location.replace("/");
      }
    }
  } catch (err) {
    console.warn("[session-guard] mirrorRemoteShift failed", err);
  }
}

function stopPerUserWatchers(): void {
  if (realtimeChannel) {
    supabase.removeChannel(realtimeChannel);
    realtimeChannel = null;
  }
  if (shiftsChannel) {
    supabase.removeChannel(shiftsChannel);
    shiftsChannel = null;
  }
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
  currentUserId = null;
  watchedUserId = null;
}

function checkExpiration(): void {
  const ts = getLoginTs();
  if (!ts) return;
  if (isOffline()) return;
  if (Date.now() - ts > MAX_SESSION_MS) void forceSignOut("expired");
}

export function startSessionGuard(): void {
  if (started || typeof window === "undefined") return;
  started = true;

  // Bootstrap para sessão já ativa (refresh de página).
  void (async () => {
    const userId = await getAuthUserIdOfflineSafe();
    if (userId) {
      if (!getLoginTs()) setLoginTs(Date.now());
      // Sessão já existente ao abrir/recarregar o app: religamos os watchers
      // globais em qualquer tela, sem depender da tela inicial montar.
      await attachSessionForUser(userId, { claim: false });
      checkExpiration();
    }
  })();

  supabase.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_IN" && session?.user) {
      // Login manual (transição de auth). Sempre re-claima para este device
      // se tornar o ativo — ignora qualquer sessionId antigo em localStorage
      // (lixo de logon anterior no mesmo browser, ou takeover feito por outro
      // device enquanto este estava offline). Sem isso, o próprio novo login
      // é expulso pelo guard antes de `signInTeam` chamar `claimCurrentSession`.
      setLoginTs(Date.now());
      void attachSessionForUser(session.user.id, { claim: true });
    } else if (event === "INITIAL_SESSION" && session?.user) {
      // Reidratação (refresh de página / retomada de foco). Preserva o
      // sessionId local — se este device ainda é o ativo no DB, segue; se
      // outro device tomou a sessão, verifyActiveSession() faz o logout.
      if (!getLoginTs()) setLoginTs(Date.now());
      void attachSessionForUser(session.user.id, { claim: false });
    } else if (event === "SIGNED_OUT") {
      stopPerUserWatchers();
      try {
        localStorage.removeItem(LOGIN_TS_KEY);
        localStorage.removeItem(SESSION_ID_KEY);
      } catch {
        /* ignore */
      }
    } else if (event === "TOKEN_REFRESHED") {
      checkExpiration();
    }
  });

  expiryTimer = setInterval(checkExpiration, EXPIRY_CHECK_MS);
  // Rede de segurança periódica caso o realtime caia. Fica em background,
  // com throttle, e não duplica o heartbeat por-usuário.
  globalSessionProbeTimer = setInterval(() => {
    checkExpiration();
    void verifyActiveSession();
  }, HEARTBEAT_MS);
  void globalSessionProbeTimer;

  if (typeof document !== "undefined") {
    const probeOnInteraction = () => {
      void verifyActiveSession();
    };
    document.addEventListener("pointerdown", probeOnInteraction, { capture: true, passive: true });
    document.addEventListener("touchstart", probeOnInteraction, { capture: true, passive: true });
    document.addEventListener("keydown", probeOnInteraction, { capture: true });

    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        checkExpiration();
        if (currentUserId) {
          void pullRemote();
          // Ao voltar ao primeiro plano, valida imediatamente se ainda somos a
          // sessão ativa — evita continuar operando após "takeover".
          void verifyActiveSession({ force: true });
        }
      }
    });
  }
  void expiryTimer;
}