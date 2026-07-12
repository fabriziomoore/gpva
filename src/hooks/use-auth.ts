import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { readStoredAuthSession } from "@/lib/sync/session-backup";
import { getLastUserId } from "@/lib/offline-auth";

const SESSION_TIMEOUT_MS = 1_500;

function withTimeout<T>(promise: PromiseLike<T>, ms = SESSION_TIMEOUT_MS): Promise<T | null> {
  if (typeof window === "undefined") return Promise.resolve(promise);
  return Promise.race([
    promise,
    new Promise<null>((resolve) => {
      window.setTimeout(() => resolve(null), ms);
    }),
  ]);
}

function isBrowserOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

export function useAuthSession() {
  const [session, setSession] = useState<Session | null>(() => readStoredAuthSession());
  const [loading, setLoading] = useState(() => !readStoredAuthSession());
  const [fallbackUserId, setFallbackUserId] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    // Offline: NUNCA chamar supabase.auth.getSession(). Internamente ele pode
    // disparar refresh do access_token; offline o refresh falha e o
    // supabase-js emite SIGNED_OUT, apagando o sb-…-auth-token do
    // localStorage. Isso zera userId e trava a Home sem team/openShift.
    if (isBrowserOffline()) {
      setSession(readStoredAuthSession());
      setLoading(false);
    } else {
      void withTimeout(supabase.auth.getSession()).then((result) => {
        if (!mounted) return;
        setSession(result?.data.session ?? readStoredAuthSession());
        setLoading(false);
      });
    }
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      // Se ficamos offline e o supabase-js emite SIGNED_OUT por falha de
      // refresh, ignoramos desde que ainda haja sessão espelhada em
      // localStorage — assim o app segue autenticado com os dados locais.
      if (event === "SIGNED_OUT" && isBrowserOffline()) {
        const stored = readStoredAuthSession();
        if (stored) {
          setSession(stored);
          return;
        }
      }
      setSession(s);
    });
    // Fallback offline: quando não há sessão Supabase (ex.: usuário deslogou
    // online antes de ficar offline), usamos o último userId conhecido para
    // que useTeam/openShift continuem enxergando os dados locais gravados.
    void getLastUserId().then((id) => {
      if (mounted && id) setFallbackUserId(id);
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return { session, loading, userId: session?.user.id ?? fallbackUserId };
}