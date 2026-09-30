// Registra cada login bem-sucedido (equipe, líder ou admin) na tabela
// login_history, lida pelo admin em "Histórico de Login".
//
// Todo login entra primeiro numa fila local com o horário real em que
// aconteceu e depois sobe pro banco. Login online sobe na hora; login
// offline fica na fila até a conexão voltar (evento "online" ou próxima
// abertura do app autenticado).

import { supabase } from "@/integrations/supabase/client";

type PendingLogin = { user_id: string; logged_at: string; offline: boolean; user_agent: string | null };

const KEY = "gpva.pendingLogins";
// Registros que não sobem em 30 dias (ex.: conta nunca mais usada neste
// aparelho) são descartados pra fila não crescer indefinidamente.
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

let flushing: Promise<void> | null = null;
let onlineListener = false;

function readQueue(): PendingLogin[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as PendingLogin[]) : [];
  } catch {
    return [];
  }
}

function writeQueue(list: PendingLogin[]): void {
  try {
    if (list.length) localStorage.setItem(KEY, JSON.stringify(list));
    else localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export function recordLogin(userId: string, offline: boolean): void {
  if (typeof window === "undefined" || !userId) return;
  writeQueue([
    ...readQueue(),
    {
      user_id: userId,
      logged_at: new Date().toISOString(),
      offline,
      user_agent: typeof navigator !== "undefined" ? navigator.userAgent : null,
    },
  ]);
  void flushPendingLogins();
}

/** Sobe os logins pendentes da conta logada agora. Nunca lança. */
export function flushPendingLogins(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (!onlineListener) {
    onlineListener = true;
    window.addEventListener("online", () => void flushPendingLogins());
  }
  if (flushing) return flushing;
  flushing = (async () => {
    try {
      const cutoff = Date.now() - MAX_AGE_MS;
      const queue = readQueue().filter((p) => new Date(p.logged_at).getTime() >= cutoff);
      writeQueue(queue);
      if (!queue.length || navigator.onLine === false) return;
      const { data } = await supabase.auth.getSession();
      const uid = data.session?.user.id;
      if (!uid) return;
      // RLS só aceita linhas da própria conta — as de outra conta esperam
      // ela entrar de novo neste aparelho.
      const mine = queue.filter((p) => p.user_id === uid);
      if (!mine.length) return;
      const { error } = await supabase.from("login_history").insert(mine);
      if (error) return;
      const sent = new Set(mine.map((p) => `${p.user_id}|${p.logged_at}`));
      writeQueue(readQueue().filter((p) => !sent.has(`${p.user_id}|${p.logged_at}`)));
    } catch {
      /* tenta de novo no próximo gatilho */
    } finally {
      flushing = null;
    }
  })();
  return flushing;
}
