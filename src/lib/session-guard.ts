import { supabase } from "@/integrations/supabase/client";
import { newId } from "@/lib/db/local-db";
import { pullRemote } from "@/lib/sync/engine";
import { getLocalDB, type LocalShift } from "@/lib/db/local-db";
import { clearRemembered } from "@/lib/remember-access";
import { toast } from "sonner";

const LOGIN_TS_KEY = "gpva.loginAt";
const SESSION_ID_KEY = "gpva.sessionId";
const MAX_SESSION_MS = 12 * 60 * 60 * 1000; // 12h
const EXPIRY_CHECK_MS = 5 * 60 * 1000; // 5 min
const HEARTBEAT_MS = 60 * 1000; // 60 s

let started = false;
let expiryTimer: ReturnType<typeof setInterval> | null = null;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let realtimeChannel: ReturnType<typeof supabase.channel> | null = null;
let shiftsChannel: ReturnType<typeof supabase.channel> | null = null;
let currentUserId: string | null = null;
let signingOut = false;

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
    await supabase.auth.signOut().catch(() => undefined);
    if (reason === "expired") {
      toast.error("Sessão expirada. Faça login novamente.");
    } else {
      toast.error("Sua conta foi acessada em outro dispositivo.");
    }
    if (typeof window !== "undefined" && window.location.pathname !== "/auth") {
      window.location.replace("/auth");
    }
  } finally {
    signingOut = false;
  }
}

async function claimSession(userId: string): Promise<void> {
  const sessionId = newId();
  setLocalSessionId(sessionId);
  setLoginTs(Date.now());
  currentUserId = userId;
  const { error } = await supabase
    .from("active_sessions")
    .upsert(
      { user_id: userId, session_id: sessionId, updated_at: new Date().toISOString() },
      { onConflict: "user_id" },
    );
  if (error) console.warn("[session-guard] claim failed", error);
  startPerUserWatchers(userId);
  void pullRemote();
}

function startPerUserWatchers(userId: string): void {
  stopPerUserWatchers();

  realtimeChannel = supabase
    .channel(`active_sessions:${userId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "active_sessions", filter: `user_id=eq.${userId}` },
      (payload) => {
        const row = (payload.new ?? payload.old) as { session_id?: string } | null;
        if (!row?.session_id) return;
        const mine = localSessionId();
        if (mine && row.session_id !== mine) void forceSignOut("taken_over");
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
    void (async () => {
      const mine = localSessionId();
      if (!mine) return;
      const { data, error } = await supabase
        .from("active_sessions")
        .select("session_id")
        .eq("user_id", userId)
        .maybeSingle();
      if (error || !data) return;
      if (data.session_id !== mine) void forceSignOut("taken_over");
    })();
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
}

function checkExpiration(): void {
  const ts = getLoginTs();
  if (!ts) return;
  if (Date.now() - ts > MAX_SESSION_MS) void forceSignOut("expired");
}

export function startSessionGuard(): void {
  if (started || typeof window === "undefined") return;
  started = true;

  // Bootstrap para sessão já ativa (refresh de página).
  void (async () => {
    const { data } = await supabase.auth.getUser();
    if (data.user) {
      if (!getLoginTs()) setLoginTs(Date.now());
      // Se ainda não temos session_id local, reivindicamos agora (equivalente
      // a "novo login" — o dispositivo anterior será expulso). Caso contrário,
      // só religamos o watcher.
      if (!localSessionId()) {
        await claimSession(data.user.id);
      } else {
        currentUserId = data.user.id;
        startPerUserWatchers(data.user.id);
        void pullRemote();
      }
      checkExpiration();
    }
  })();

  supabase.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_IN" && session?.user) {
      // Só reivindica se for troca de usuário ou primeira vez; ignora refresh de token.
      if (currentUserId !== session.user.id || !localSessionId()) {
        void claimSession(session.user.id);
      }
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

  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        checkExpiration();
        if (currentUserId) {
          void pullRemote();
          // Ao voltar ao primeiro plano, valida imediatamente se ainda somos a
          // sessão ativa — evita continuar operando após "takeover".
          void (async () => {
            const mine = localSessionId();
            if (!mine || !currentUserId) return;
            const { data } = await supabase
              .from("active_sessions")
              .select("session_id")
              .eq("user_id", currentUserId)
              .maybeSingle();
            if (data && data.session_id !== mine) void forceSignOut("taken_over");
          })();
        }
      }
    });
  }
  void expiryTimer;
}