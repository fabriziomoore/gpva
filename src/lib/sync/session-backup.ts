// Mirrors the Supabase auth session into Capacitor Preferences (native
// secure-ish storage) so that if the WebView ever wipes localStorage the
// next launch can re-hydrate the session offline.

import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";

const KEY = "gpva.supabase.session.v1";
const FORCE_SIGNED_OUT_KEY = "gpva.forceSignedOut";
const AUTH_TIMEOUT_MS = 1_500;

type StoredSession = {
  access_token?: string;
  refresh_token?: string;
  expires_at?: number;
  user?: { id?: string };
  [key: string]: unknown;
};

function withTimeout<T>(promise: PromiseLike<T>, ms = AUTH_TIMEOUT_MS): Promise<T | null> {
  if (typeof window === "undefined") return Promise.resolve(promise);
  return Promise.race([
    promise,
    new Promise<null>((resolve) => {
      window.setTimeout(() => resolve(null), ms);
    }),
  ]);
}

export function readStoredAuthSession(): Session | null {
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

function writeSessionDirectly(session: StoredSession): boolean {
  if (typeof window === "undefined") return false;
  if (!session.access_token || !session.refresh_token) return false;
  const key = getAuthStorageKey();
  if (!key) return false;
  try {
    window.localStorage.setItem(key, JSON.stringify(session));
    window.dispatchEvent(new StorageEvent("storage", { key, newValue: JSON.stringify(session) }));
    return true;
  } catch {
    return false;
  }
}

function hasForcedSignOut(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.sessionStorage.getItem(FORCE_SIGNED_OUT_KEY) === "1";
  } catch {
    return false;
  }
}

function isNative(): boolean {
  if (typeof window === "undefined") return false;
  try { return Capacitor.isNativePlatform(); } catch { return false; }
}

export async function backupSession(): Promise<void> {
  if (!isNative()) return;
  const session = readStoredAuthSession() ?? (await withTimeout(supabase.auth.getSession()))?.data.session ?? null;
  try {
    if (session) {
      await Preferences.set({ key: KEY, value: JSON.stringify(session) });
    } else {
      await Preferences.remove({ key: KEY });
    }
  } catch { /* ignore */ }
}

export async function restoreSession(opts: { force?: boolean } = {}): Promise<boolean> {
  if (!opts.force && hasForcedSignOut()) return false;
  if (readStoredAuthSession()) return true;
  if (!isNative()) return false;
  // Only restore when no local session is present (e.g. WebView storage wiped).
  const current = await withTimeout(supabase.auth.getSession());
  if (current?.data.session) return true;
  let value: string | null = null;
  try { value = (await Preferences.get({ key: KEY })).value ?? null; } catch { return false; }
  if (!value) return false;
  try {
    const s = JSON.parse(value) as StoredSession;
    if (s.access_token && s.refresh_token) {
      const restored = await withTimeout(
        supabase.auth.setSession({
          access_token: s.access_token,
          refresh_token: s.refresh_token,
        }),
      );
      if (restored?.data.session) return true;
      return writeSessionDirectly(s);
    }
  } catch {
    try {
      return writeSessionDirectly(JSON.parse(value) as StoredSession);
    } catch {
      /* corrupt cache — ignore */
    }
  }
  return false;
}

export async function clearSessionBackup(): Promise<void> {
  if (!isNative()) return;
  try { await Preferences.remove({ key: KEY }); } catch { /* ignore */ }
}

export function installSessionMirror(): void {
  if (typeof window === "undefined") return;
  if (!isNative()) return;
  void backupSession();
  supabase.auth.onAuthStateChange(() => {
    void backupSession();
  });
}
