// Mirrors the Supabase auth session into Capacitor Preferences (native
// secure-ish storage) so that if the WebView ever wipes localStorage the
// next launch can re-hydrate the session offline.

import { supabase } from "@/integrations/supabase/client";

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

function withTimeout<T>(promise: Promise<T>, ms = AUTH_TIMEOUT_MS): Promise<T | null> {
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
  const w = window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } };
  return !!w.Capacitor?.isNativePlatform?.();
}

async function prefs() {
  try {
    const { Preferences } = await import("@capacitor/preferences");
    return Preferences;
  } catch {
    return null;
  }
}

export async function backupSession(): Promise<void> {
  if (!isNative()) return;
  const p = await prefs();
  if (!p) return;
  const result = await withTimeout(supabase.auth.getSession());
  const data = result?.data;
  if (data.session) {
    await p.set({ key: KEY, value: JSON.stringify(data.session) });
  } else {
    await p.remove({ key: KEY });
  }
}

export async function restoreSession(opts: { force?: boolean } = {}): Promise<void> {
  if (!isNative()) return;
  if (!opts.force && hasForcedSignOut()) return;
  // Only restore when no local session is present (e.g. WebView storage wiped).
  const current = await withTimeout(supabase.auth.getSession());
  if (current?.data.session) return;
  const p = await prefs();
  if (!p) return;
  const { value } = await p.get({ key: KEY });
  if (!value) return;
  try {
    const s = JSON.parse(value) as StoredSession;
    if (s.access_token && s.refresh_token) {
      const restored = await withTimeout(
        supabase.auth.setSession({
          access_token: s.access_token,
          refresh_token: s.refresh_token,
        }),
      );
      if (!restored?.data.session) writeSessionDirectly(s);
    }
  } catch {
    try {
      writeSessionDirectly(JSON.parse(value) as StoredSession);
    } catch {
      /* corrupt cache — ignore */
    }
  }
}

export async function clearSessionBackup(): Promise<void> {
  if (!isNative()) return;
  const p = await prefs();
  if (!p) return;
  await p.remove({ key: KEY });
}

export function installSessionMirror(): void {
  if (!isNative()) return;
  supabase.auth.onAuthStateChange(() => {
    void backupSession();
  });
}
