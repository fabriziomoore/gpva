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
  prepareDemoBeforeSignOut,
  performLocalDemoReset
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
        await setDemoAccountInfo(userId, { is_test: isTest, verified_at: new Date().toISOString() });

        if (isTest) {
          const localPending = await isLocalResetPending(userId);
          const remotePending = await isRemoteResetPending(userId);
          
          if (localPending || remotePending) {
            const { pauseSyncAndWaitForIdle, resumeSync } = await import("./sync/engine");
            await pauseSyncAndWaitForIdle();

            if (localPending) {
              try {
                await performLocalDemoReset(userId);
                await setLocalResetPending(userId, false);
              } catch (err) {
                console.error("[auth] Reconcile local reset failed, blocking login", err);
                await setLocalResetPending(userId, true);
                await setRemoteResetPending(userId, true);
                
                // Encerra sessão enquanto sync ainda pausado
                await signOut();
                resumeSync();
                
                throw new Error(
                  "Não foi possível preparar a conta de demonstração. Tente entrar novamente."
                );
              }
            }
            
            // Sucesso local (ou não era pendente), agora tenta RPC
            try {
              const { data: rpcRes, error: rpcErr } = await supabase.rpc("reset_current_demo_session");
              const res = rpcRes as any;
              
              if (!rpcErr && res?.status === "reset") {
                await setRemoteResetPending(userId, false);
              } else if (res?.status === "not_demo") {
                await setRemoteResetPending(userId, false);
                await setDemoAccountInfo(userId, { is_test: false, verified_at: new Date().toISOString() });
              } else {
                await setRemoteResetPending(userId, true);
              }
            } catch (rpcEx) {
              console.warn("[auth] Remote reset RPC failed, marking as pending", rpcEx);
              await setRemoteResetPending(userId, true);
            } finally {
              resumeSync();
            }
          }
        } else {
          await setLocalResetPending(userId, false);
          await setRemoteResetPending(userId, false);
        }
      }
    } catch (err: any) {
      if (err.message?.includes("demonstração")) throw err;
      console.warn("[auth] Failed to reconcile demo status", err);
    }
  }

  await saveCredentialFromOnlineLogin(teamName, password).catch(() => undefined);
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
    /* ignore */
  }
  await clearOfflineUnlock().catch(() => undefined);
}

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
 * Estrutura de contexto para a finalização do logout.
 */
export interface SignOutContext {
  keepSyncPausedUntilSignOut: boolean;
}

/**
 * Fase A: Prepara o logout coordenado.
 * Executa o reset demo enquanto autenticado, limpa o estado local e marca
 * gpva.forceSignedOut para que a rota /auth aceite o usuário mesmo com sessão pendente.
 */
export async function prepareAppSignOut(userId?: string): Promise<SignOutContext> {
  let keepSyncPaused = false;
  if (userId) {
    const result = await prepareDemoBeforeSignOut(userId);
    keepSyncPaused = result.keepSyncPausedUntilSignOut;
    
    // Se a limpeza terminou ok e não pediu pausa estendida, liberamos logo o sync
    if (!keepSyncPaused && result.attempted) {
      const { resumeSync } = await import("./sync/engine");
      resumeSync();
    }
  }
  
  // Define gpva.forceSignedOut = "1" e limpa storage local ANTES da navegação
  prepareLocalSignOut();
  
  return { keepSyncPausedUntilSignOut: keepSyncPaused };
}

/**
 * Fase B: Finaliza o logout após a navegação ter ocorrido.
 * Invalida a sessão no Supabase, limpa o QueryClient e libera o sync engine.
 */
export async function finalizePreparedSignOut(
  queryClient: QueryClient | undefined,
  context: SignOutContext
): Promise<void> {
  // 1. Limpeza do QueryClient
  try {
    void queryClient?.cancelQueries();
    queryClient?.clear();
  } catch { /* ignore */ }
  
  // 2. Supabase SignOut Remoto (sem chamar prepareLocalSignOut novamente)
  try {
    await Promise.race([
      (async () => {
        await supabase.removeAllChannels();
        await supabase.auth.signOut({ scope: "local" });
      })(),
      new Promise((resolve) => setTimeout(resolve, SIGNOUT_TIMEOUT_MS)),
    ]);
  } catch {
    /* ignore */
  }
  await clearOfflineUnlock().catch(() => undefined);

  // 3. Libera o sync se foi mantido pausado durante o reset
  if (context.keepSyncPausedUntilSignOut) {
    const { resumeSync } = await import("./sync/engine");
    resumeSync();
  }
}

/**
 * Mantido para compatibilidade, executando o fluxo completo de forma sequencial.
 */
export async function signOutApp(queryClient?: QueryClient, userId?: string): Promise<void> {
  const context = await prepareAppSignOut(userId);
  await finalizePreparedSignOut(queryClient, context);
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
