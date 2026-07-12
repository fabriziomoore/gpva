import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { verifyActiveSession } from "@/lib/session-guard";
import { readStoredAuthSession } from "@/lib/sync/session-backup";
import { hasValidOfflineUnlock } from "@/lib/offline-auth";

const AUTH_ROUTE_TIMEOUT_MS = 800;
const OFFLINE_UNLOCK_TIMEOUT_MS = 1_500;

function bootLog(step: string, extra?: unknown): void {
  try {
    // eslint-disable-next-line no-console
    console.log(`[BOOT][_authenticated] ${step}`, extra ?? "");
  } catch { /* ignore */ }
}

function withAuthRouteTimeout<T>(promise: PromiseLike<T>): Promise<T | null> {
  if (typeof window === "undefined") return Promise.resolve(promise);
  return Promise.race([
    promise,
    new Promise<null>((resolve) => window.setTimeout(() => resolve(null), AUTH_ROUTE_TIMEOUT_MS)),
  ]);
}

function withOfflineUnlockTimeout(promise: PromiseLike<boolean>): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(promise);
  return Promise.race<boolean>([
    Promise.resolve(promise),
    new Promise<boolean>((resolve) => window.setTimeout(() => {
      bootLog("hasValidOfflineUnlock TIMEOUT — assuming false");
      resolve(false);
    }, OFFLINE_UNLOCK_TIMEOUT_MS)),
  ]);
}

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    bootLog("beforeLoad:start");
    // 1) Fast path: sessão Supabase já viva na memória / storage do SDK.
    const localSession = readStoredAuthSession();
    bootLog("beforeLoad:readStoredAuthSession", { hasUser: !!localSession?.user });
    if (localSession?.user) {
      void verifyActiveSession();
      return { user: localSession.user };
    }

    // 2) Unlock offline: acesso autorizado por validação local de
    //    credencial (Capacitor Preferences). Não depende de sessão
    //    Supabase — a revalidação online ocorre em background quando a
    //    Internet retornar.
    bootLog("beforeLoad:hasValidOfflineUnlock:awaiting");
    const offlineOk = await withOfflineUnlockTimeout(hasValidOfflineUnlock());
    bootLog("beforeLoad:hasValidOfflineUnlock:resolved", { offlineOk });
    if (offlineOk) {
      void verifyActiveSession();
      return { user: null };
    }

    // 3) Última tentativa rápida via Supabase — só quando online.
    const online = typeof navigator === "undefined" ? true : navigator.onLine;
    bootLog("beforeLoad:navigator.online", { online });
    if (online) {
      const result = await withAuthRouteTimeout(supabase.auth.getUser());
      bootLog("beforeLoad:supabase.getUser", { hasUser: !!result?.data?.user });
      if (result && !("error" in result && result.error) && result?.data?.user) {
        void verifyActiveSession();
        return { user: result.data.user };
      }
    }
    bootLog("beforeLoad:redirect->/auth");
    throw redirect({ to: "/auth" });
  },
  component: () => <Outlet />,
});