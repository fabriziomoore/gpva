// Mirrors the Supabase auth session into Capacitor Preferences (native
// secure-ish storage) so that if the WebView ever wipes localStorage the
// next launch can re-hydrate the session offline.

import { supabase } from "@/integrations/supabase/client";

const KEY = "gpva.supabase.session.v1";
const FORCE_SIGNED_OUT_KEY = "gpva.forceSignedOut";

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
  const { data } = await supabase.auth.getSession();
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
  const { data } = await supabase.auth.getSession();
  if (data.session) return;
  const p = await prefs();
  if (!p) return;
  const { value } = await p.get({ key: KEY });
  if (!value) return;
  try {
    const s = JSON.parse(value) as { access_token: string; refresh_token: string };
    if (s.access_token && s.refresh_token) {
      await supabase.auth.setSession({
        access_token: s.access_token,
        refresh_token: s.refresh_token,
      });
    }
  } catch {
    /* corrupt cache — ignore */
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
