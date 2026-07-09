import { supabase } from "@/integrations/supabase/client";
import { claimCurrentSession } from "@/lib/session-guard";
import { clearSessionBackup } from "@/lib/sync/session-backup";
import type { QueryClient } from "@tanstack/react-query";

const AUTH_STORAGE_PATTERNS = ["sb-", "supabase.auth", "gpva.loginAt", "gpva.sessionId"];
const FORCE_SIGNED_OUT_KEY = "gpva.forceSignedOut";
const SIGNOUT_EVENT = "gpva:user-signout";
const SIGNOUT_TIMEOUT_MS = 1200;

export function teamNameToEmail(teamName: string): string {
  const slug = teamName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${slug}@gpva.local`;
}

export async function signInTeam(teamName: string, password: string) {
  const email = teamNameToEmail(teamName);
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  await claimCurrentSession();
  return data;
}

export async function signUpTeam(teamName: string, password: string) {
  const email = teamNameToEmail(teamName);
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { team_name: teamName.trim() } },
  });
  if (error) throw error;
  return data;
}

export async function signOut() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(SIGNOUT_EVENT));
  }

  try {
    await Promise.race([
      (async () => {
        await supabase.removeAllChannels();
        await supabase.auth.signOut({ scope: "local" });
      })(),
      new Promise((resolve) => setTimeout(resolve, SIGNOUT_TIMEOUT_MS)),
    ]);
  } catch {
    /* ignore: logout must still clear local auth state offline */
  }

  clearBrowserAuthStorage();
  await clearSessionBackup().catch(() => undefined);
}

export async function signOutApp(queryClient?: QueryClient): Promise<void> {
  try {
    await queryClient?.cancelQueries();
    queryClient?.clear();
  } catch {
    /* ignore */
  }
  await signOut();
}

function clearBrowserAuthStorage(): void {
  if (typeof window === "undefined") return;
  try {
    const keys: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (
        k &&
        AUTH_STORAGE_PATTERNS.some((pattern) =>
          pattern.endsWith("-") ? k.startsWith(pattern) : k.includes(pattern),
        )
      ) {
        keys.push(k);
      }
    }
    keys.forEach((k) => window.localStorage.removeItem(k));
    window.sessionStorage.removeItem("gpva-admin-pw");
    window.sessionStorage.setItem(FORCE_SIGNED_OUT_KEY, "1");
  } catch {
    /* ignore */
  }
}