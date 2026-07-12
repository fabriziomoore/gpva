import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { verifyActiveSession } from "@/lib/session-guard";
import { readStoredAuthSession } from "@/lib/sync/session-backup";
import { hasValidOfflineUnlock } from "@/lib/offline-auth";

const AUTH_ROUTE_TIMEOUT_MS = 800;

function withAuthRouteTimeout<T>(promise: PromiseLike<T>): Promise<T | null> {
  if (typeof window === "undefined") return Promise.resolve(promise);
  return Promise.race([
    promise,
    new Promise<null>((resolve) => window.setTimeout(() => resolve(null), AUTH_ROUTE_TIMEOUT_MS)),
  ]);
}

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    // 1) Fast path: sessão Supabase já viva na memória / storage do SDK.
    const localSession = readStoredAuthSession();
    if (localSession?.user) {
      void verifyActiveSession();
      return { user: localSession.user };
    }

    // 2) Unlock offline: acesso autorizado por validação local de
    //    credencial (Capacitor Preferences). Não depende de sessão
    //    Supabase — a revalidação online ocorre em background quando a
    //    Internet retornar.
    const offlineOk = await hasValidOfflineUnlock();
    if (offlineOk) {
      void verifyActiveSession();
      return { user: null };
    }

    // 3) Última tentativa rápida via Supabase — só quando online.
    const online = typeof navigator === "undefined" ? true : navigator.onLine;
    if (online) {
      const result = await withAuthRouteTimeout(supabase.auth.getUser());
      if (result && !("error" in result && result.error) && result?.data?.user) {
        void verifyActiveSession();
        return { user: result.data.user };
      }
    }
    throw redirect({ to: "/auth" });
  },
  component: () => <Outlet />,
});