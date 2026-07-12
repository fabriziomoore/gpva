import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { readStoredAuthSession } from "@/lib/sync/session-backup";

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

export function useAuthSession() {
  const [session, setSession] = useState<Session | null>(() => readStoredAuthSession());
  const [loading, setLoading] = useState(() => !readStoredAuthSession());

  useEffect(() => {
    let mounted = true;
    void withTimeout(supabase.auth.getSession()).then((result) => {
      if (!mounted) return;
      setSession(result?.data.session ?? readStoredAuthSession());
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return { session, loading, userId: session?.user.id ?? null };
}