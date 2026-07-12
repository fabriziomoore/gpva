import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

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

function getAuthStorageKey(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const configuredUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
    if (configuredUrl) {
      const projectRef = new URL(configuredUrl).hostname.split(".")[0];
      if (projectRef) return `sb-${projectRef}-auth-token`;
    }
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key?.startsWith("sb-") && key.endsWith("-auth-token")) return key;
    }
  } catch {
    /* ignore */
  }
  return null;
}

function readStoredSession(): Session | null {
  const key = getAuthStorageKey();
  if (!key || typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Session | null;
    return parsed?.access_token && parsed.user?.id ? parsed : null;
  } catch {
    return null;
  }
}

export function useAuthSession() {
  const [session, setSession] = useState<Session | null>(() => readStoredSession());
  const [loading, setLoading] = useState(() => !readStoredSession());

  useEffect(() => {
    let mounted = true;
    void withTimeout(supabase.auth.getSession()).then((result) => {
      if (!mounted) return;
      setSession(result?.data.session ?? readStoredSession());
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