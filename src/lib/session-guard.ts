import { supabase } from "@/integrations/supabase/client";
import { newId } from "@/lib/db/local-db";
import { pullRemote } from "@/lib/sync/engine";
import { getLocalDB, type LocalShift } from "@/lib/db/local-db";
import { clearRemembered } from "@/lib/remember-access";
import { clearOfflineUnlock, getLastUserId } from "@/lib/offline-auth";
import { clearSessionBackup } from "@/lib/sync/session-backup";
import { reportDeviceVersion } from "@/lib/ota/device-info";
import { toast } from "sonner";

const LOGIN_TS_KEY = "gpva.loginAt";
const IDLE_TS_KEY = "gpva.lastActivityAt";
const SESSION_ID_KEY = "gpva.sessionId";
const EJECTED_KEY = "gpva.ejected";
const FORCE_SIGNED_OUT_KEY = "gpva.forceSignedOut";
const MAX_SESSION_MS = 10 * 60 * 60 * 1000; // 10h — sessão absoluta
const IDLE_MAX_MS = 2.5 * 60 * 60 * 1000; // 2h30 sem interação
const EXPIRY_CHECK_MS = 5 * 60 * 1000; // 5 min
const IDLE_WRITE_THROTTLE_MS = 5_000; // evita gravar a cada pointerdown
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
let claimStartedAt = 0;
let claimInProgress = false;
let claimTail: Promise<void> = Promise.resolve();
let lastActiveCheckAt = 0;
let activeCheckPromise: Promise<boolean> | null = null;
const CLAIM_GRACE_MS = 10_000;
let ejectionHandled = false;
let lastIdleWriteAt = 0;

type EjectReason = "expired" | "idle" | "taken_over" | "admin_disconnect";

function getEjected(): EjectReason | null {
  try {
    return (localStorage.getItem(EJECTED_KEY) as EjectReason | null) || null;
  } catch {
    return null;
  }
}

function setEjected(reason: EjectReason): void {
  ejectionHandled = true;
  try {
    localStorage.setItem(EJECTED_KEY, reason);
    sessionStorage.setItem(FORCE_SIGNED_OUT_KEY, "1");
  } catch {
    /* ignore */
  }
}

function clearEjected(): void {
  ejectionHandled = false;
  try {
    localStorage.removeItem(EJECTED_KEY);
  } catch {
    /* ignore */
  }
}

export function hasSessionEjection(): boolean {
  return ejectionHandled || !!getEjected();
}

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

function setIdleTs(ts: number): void {
  try {
    localStorage.setItem(IDLE_TS_KEY, String(ts));
  } catch {
    /* ignore */
  }
}

function getIdleTs(): number | null {
  try {
    const v = localStorage.getItem(IDLE_TS_KEY);
    return v ? Number(v) : null;
  } catch {
    return null;
  }
}

// Chamado a cada interação real (toque/clique/tecla) para resetar o relógio
// de inatividade. Throttlado — não precisa gravar a cada pointerdown.
function touchIdle(): void {
  const now = Date.now();
  if (now - lastIdleWriteAt < IDLE_WRITE_THROTTLE_MS) return;
  lastIdleWriteAt = now;
  setIdleTs(now);
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

async function forceSignOut(reason: EjectReason): Promise<void> {
  if (signingOut) return;
  if (ejectionHandled || getEjected()) return;
  setEjected(reason);
  signingOut = true;
  try {
    stopPerUserWatchers();
    try {
      localStorage.removeItem(LOGIN_TS_KEY);
      localStorage.removeItem(IDLE_TS_KEY);
      localStorage.removeItem(SESSION_ID_KEY);
    } catch {
      /* ignore */
    }
    // Evita relogin automático offline após ser expulso.
    await clearRemembered().catch(() => undefined);
    await clearOfflineUnlock().catch(() => undefined);
    await clearSessionBackup().catch(() => undefined);
    // Escopo local: revogar apenas a sessão deste dispositivo. O padrão
    // ("global") invalidaria o refresh token em TODOS os dispositivos do
    // usuário — inclusive o novo device que acabou de logar — deixando-o
    // travado sem conseguir autenticar requisições.
    await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
    if (reason === "expired") {
      toast.error("Sessão expirada. Faça login novamente.", { id: "gpva-session-ejected" });
    } else if (reason === "idle") {
      toast.error("Sessão encerrada por inatividade. Faça login novamente.", { id: "gpva-session-ejected" });
    } else if (reason === "admin_disconnect") {
      toast.error("Seu aparelho foi deslogado pelo administrador.", { id: "gpva-session-ejected" });
    } else {
      toast.error("Sua conta foi acessada em outro dispositivo.", { id: "gpva-session-ejected" });
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

export async function verifyActiveSession(
  opts: { force?: boolean; userIdHint?: string } = {},
): Promise<boolean> {
  if (typeof window === "undefined" || signingOut) return !signingOut;
  if (hasSessionEjection()) return false;

  // Checagens locais (sem rede) de expiração absoluta e por inatividade —
  // rodam sempre, mesmo sem `force`, para que o gate de rota nunca deixe
  // a tela autenticada abrir antes de confirmar que a sessão ainda vale.
  if (checkExpiration()) return false;
  if (checkIdle()) return false;

  const now = Date.now();
  if (!opts.force && activeCheckPromise && now - lastActiveCheckAt < ACTIVE_CHECK_THROTTLE_MS) {
    return activeCheckPromise;
  }
  if (!opts.force && now - lastActiveCheckAt < ACTIVE_CHECK_THROTTLE_MS) return true;

  lastActiveCheckAt = now;
  activeCheckPromise = (async () => {
    const mine = localSessionId();
    // Prioriza um userId já conhecido (estado do módulo ou fornecido por
    // quem chamou, ex. o gate de rota que já leu a sessão do Supabase) para
    // não depender de getAuthUserIdOfflineSafe() — que pode demorar/expirar
    // em rede instável — só para descobrir algo que já sabíamos.
    let userId = currentUserId ?? opts.userIdHint ?? null;
    if (!userId) {
      userId = await getAuthUserIdOfflineSafe();
    }
    // Ambíguo (não confirmamos quem é, mas também não temos nenhum sinal
    // concreto de logout) — nunca deslogar por causa disso. Só age quando
    // uma condição é CONFIRMADA (expiração, inatividade, linha sumiu,
    // session_id trocou no banco).
    if (!userId) return true;
    if (!mine) {
      await claimSession(userId);
      return true;
    }

    // Se estivermos offline (browser indica ou falha de rede), não validamos
    // contra o banco. Presumimos que a sessão local ainda é válida até
    // recuperarmos a rede e o heartbeat/realtime confirmar o contrário.
    // Isso evita o deslogue "taken_over" falso por erro 401/timeout.
    if (isOffline()) return true;

    // Durante o login podem existir duas fontes legítimas tentando reivindicar
    // a sessão ao mesmo tempo: o evento SIGNED_IN do SDK e o submit do login.
    // Enquanto essa gravação ainda está em andamento, não comparar contra a
    // linha antiga do banco.
    if (claimInProgress && Date.now() - claimStartedAt < CLAIM_GRACE_MS) {
      return true;
    }

    const result = await withAuthProbeTimeout(
      supabase
        .from("active_sessions")
        .select("session_id")
        .eq("user_id", userId)
        .maybeSingle(),
    );

    // Se a consulta falhou por rede (result === null via timeout ou erro),
    // NÃO deslogamos. Manter a sessão viva no modo offline é prioridade.
    if (!result || result.error) return true;

    // A sessão local pode ter mudado enquanto a consulta acima estava em
    // voo (ex.: um SIGNED_IN espúrio do SDK do Supabase — reidratação de
    // token tratada como novo login — disparou um re-claim NESTE MESMO
    // device durante o round-trip). Comparar `data.session_id` contra o
    // `mine` capturado antes do await compararia contra um valor obsoleto
    // e deslogaria o próprio device que acabou de se reivindicar, com a
    // mensagem falsa de "outro aparelho acessou sua conta". Descarta esta
    // checagem stale; a próxima (com o valor atual) decide corretamente.
    if (localSessionId() !== mine) return true;

    const { data } = result;
    if (!data) {
      // Linha sumiu do DB (admin deslogou). Só age se este device já
      // reivindicou a sessão — dentro do grace do próprio claim, ignora.
      if (Date.now() - claimedAt < CLAIM_GRACE_MS) return true;
      await forceSignOut("admin_disconnect");
      return false;
    }
    if (data.session_id === mine) {
      // touch last_seen_at — barato e útil para o painel admin de dispositivos.
      void supabase
        .from("active_sessions")
        .update({ last_seen_at: new Date().toISOString() })
        .eq("user_id", userId);
      void reportDeviceVersion(userId);
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
  const run = claimTail
    .catch(() => undefined)
    .then(async () => {
      claimInProgress = true;
      claimStartedAt = Date.now();
      try {
        await claimSessionInternal(userId);
      } finally {
        claimInProgress = false;
      }
    });

  claimTail = run;
  return run;
}

async function claimSessionInternal(userId: string): Promise<void> {
  const sessionId = newId();
  setLocalSessionId(sessionId);
  setLoginTs(Date.now());
  setIdleTs(Date.now());
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
  clearEjected();
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
        const isDelete = payload.eventType === "DELETE";
        const rowSrc = isDelete ? payload.old : (payload.new ?? payload.old);
        const row = rowSrc as { session_id?: string } | null;
        if (!row?.session_id) return;
        const mine = localSessionId();
        if (!mine) return;
        // Admin removeu a sessão deste dispositivo → força logout imediato.
        if (isDelete && row.session_id === mine) {
          void forceSignOut("admin_disconnect");
          return;
        }
        if (row.session_id === mine) return;
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

// Retorna true quando a sessão foi (ou já estava) ejetada por essa checagem.
function checkExpiration(): boolean {
  const ts = getLoginTs();
  if (!ts) return false;
  if (isOffline()) return false;
  if (Date.now() - ts > MAX_SESSION_MS) {
    void forceSignOut("expired");
    return true;
  }
  return false;
}

// Idem, para inatividade. Não age offline: em campo, um device pode passar
// horas sem rede e sem toque na tela sem que isso deva ser tratado como
// abandono da conta — o heartbeat/gate revalida assim que a rede volta.
function checkIdle(): boolean {
  const ts = getIdleTs();
  if (!ts) return false;
  if (isOffline()) return false;
  if (Date.now() - ts > IDLE_MAX_MS) {
    void forceSignOut("idle");
    return true;
  }
  return false;
}

export function startSessionGuard(): void {
  if (started || typeof window === "undefined") return;
  started = true;

  // Bootstrap para sessão já ativa (refresh de página).
  void (async () => {
    const userId = await getAuthUserIdOfflineSafe();
    if (userId) {
      if (!getLoginTs()) setLoginTs(Date.now());
      if (!getIdleTs()) setIdleTs(Date.now());
      // Sessão já existente ao abrir/recarregar o app: religamos os watchers
      // globais em qualquer tela, sem depender da tela inicial montar.
      await attachSessionForUser(userId, { claim: false });
      checkExpiration();
      checkIdle();
    }
  })();

  supabase.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_IN" && session?.user) {
      clearEjected();
      // Login manual (transição de auth). Sempre re-claima para este device
      // se tornar o ativo — ignora qualquer sessionId antigo em localStorage
      // (lixo de logon anterior no mesmo browser, ou takeover feito por outro
      // device enquanto este estava offline). Sem isso, o próprio novo login
      // é expulso pelo guard antes de `signInTeam` chamar `claimCurrentSession`.
      setLoginTs(Date.now());
      setIdleTs(Date.now());
      void attachSessionForUser(session.user.id, { claim: true });
    } else if (event === "INITIAL_SESSION" && session?.user) {
      // Reidratação (refresh de página / retomada de foco). Preserva o
      // sessionId local — se este device ainda é o ativo no DB, segue; se
      // outro device tomou a sessão, verifyActiveSession() faz o logout.
      if (!getLoginTs()) setLoginTs(Date.now());
      if (!getIdleTs()) setIdleTs(Date.now());
      void attachSessionForUser(session.user.id, { claim: false });
    } else if (event === "SIGNED_OUT") {
      stopPerUserWatchers();
      try {
        localStorage.removeItem(LOGIN_TS_KEY);
        localStorage.removeItem(IDLE_TS_KEY);
        localStorage.removeItem(SESSION_ID_KEY);
      } catch {
        /* ignore */
      }
    } else if (event === "TOKEN_REFRESHED") {
      checkExpiration();
      checkIdle();
    }
  });

  expiryTimer = setInterval(() => {
    checkExpiration();
    checkIdle();
  }, EXPIRY_CHECK_MS);
  // Rede de segurança periódica caso o realtime caia. Fica em background,
  // com throttle, e não duplica o heartbeat por-usuário.
  globalSessionProbeTimer = setInterval(() => {
    checkExpiration();
    checkIdle();
    void verifyActiveSession();
  }, HEARTBEAT_MS);
  void globalSessionProbeTimer;

  if (typeof document !== "undefined") {
    const probeOnInteraction = () => {
      touchIdle();
      void verifyActiveSession();
    };
    document.addEventListener("pointerdown", probeOnInteraction, { capture: true, passive: true });
    document.addEventListener("touchstart", probeOnInteraction, { capture: true, passive: true });
    document.addEventListener("keydown", probeOnInteraction, { capture: true });

    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        checkExpiration();
        checkIdle();
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