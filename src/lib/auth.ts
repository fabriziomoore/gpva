import { supabase } from "@/integrations/supabase/client";
import { claimCurrentSession } from "@/lib/session-guard";
import { clearSessionBackup } from "@/lib/sync/session-backup";
import {
  saveCredentialFromOnlineLogin,
  clearOfflineUnlock,
  saveLastUserId,
} from "@/lib/offline-auth";
import { 
  setDemoAccountInfo, 
  isRemoteResetPending, 
  setRemoteResetPending,
  isLocalResetPending,
  setLocalResetPending,
  prepareDemoBeforeSignOut 
} from "./demo-reset";
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

  // Verificação de conta demo e reset pendente
  if (data.user?.id) {
    const userId = data.user.id;
    try {
      const { data: team, error: teamErr } = await supabase
        .from("equipes")
        .select("is_test")
        .eq("id", userId)
        .single();
      
      if (!teamErr && team) {
        const isTest = !!team.is_test;
        await setDemoAccountInfo(userId, {
          is_test: isTest,
          verified_at: new Date().toISOString()
        });

        if (isTest) {
          const localPending = await isLocalResetPending(userId);
          const remotePending = await isRemoteResetPending(userId);
          
          if (localPending || remotePending) {
            const { pauseSyncAndWaitForIdle, resumeSync } = await import("./sync/engine");
            const { performLocalDemoReset, setLocalResetPending, setRemoteResetPending } = await import("./demo-reset");
            
            try {
              await pauseSyncAndWaitForIdle();
              
              if (localPending) {
                await performLocalDemoReset(userId);
                await setLocalResetPending(userId, false);
              }
              
              // Só chama RPC se local estiver limpo ou acabou de limpar
              const { data, error: rpcErr } = await supabase.rpc("reset_current_demo_session");
              const res = data as any;
              if (!rpcErr && res?.status === "reset") {
                await setRemoteResetPending(userId, false);
              }
            } finally {
              resumeSync();
            }
          }
        } else {
          // Se não é mais demo, limpamos marcadores pendentes se existirem
          await setLocalResetPending(userId, false);
          await setRemoteResetPending(userId, false);
        }
      }
    } catch (err) {
      console.warn("[auth] Failed to reconcile demo status", err);
    }
  }

  // Grava credencial local automaticamente para viabilizar login offline
  // permanente após este primeiro acesso online.
  await saveCredentialFromOnlineLogin(teamName, password).catch(() => undefined);
  // Persiste o UUID em Preferences (sobrevive a signOut) para servir como
  // fallback do userId no próximo acesso offline.
  if (data.user?.id) await saveLastUserId(data.user.id).catch(() => undefined);
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

export function prepareLocalSignOut(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(SIGNOUT_EVENT));
  }
  clearBrowserAuthStorage();
}

export async function signOut() {
  prepareLocalSignOut();

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

  // NÃO limpa a credencial offline nem o backup da sessão — o próximo
  // acesso pode ser feito offline com a mesma senha (dentro da janela de
  // 30 dias). Apenas invalida o "unlock" ativo para forçar reentrada com
  // senha.
  await clearOfflineUnlock().catch(() => undefined);
  void clearSessionBackup; // referenciado apenas para uso condicional futuro
}

/**
 * Finaliza a sessão do aplicativo, limpando estados locais e remotos (Supabase).
 */
export async function finalizeSignOut(queryClient?: QueryClient): Promise<void> {
  prepareLocalSignOut();
  try {
    void queryClient?.cancelQueries();
    queryClient?.clear();
  } catch {
    /* ignore */
  }
  await signOut();
}

/**
 * Ponto de entrada coordenado para o logout.
 * Gerencia o reset da conta demo antes de limpar a sessão.
 */
export async function signOutApp(queryClient?: QueryClient, userId?: string): Promise<void> {
  if (userId) {
    const { resumeSync } = await import("./sync/engine");
    try {
      await prepareDemoBeforeSignOut(userId);
    } finally {
      // Garante que o sync seja liberado após o reset (ou falha dele) 
      // mas antes da invalidação da sessão no finalizeSignOut
      resumeSync();
    }
  }
  await finalizeSignOut(queryClient);
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