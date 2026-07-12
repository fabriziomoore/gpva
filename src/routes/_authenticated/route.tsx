import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { verifyActiveSession } from "@/lib/session-guard";
import { readStoredAuthSession, restoreSession } from "@/lib/sync/session-backup";

const AUTH_ROUTE_TIMEOUT_MS = 1_200;

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
    // Offline-safe: se getUser() falhar por rede, usa a sessão local
    // (localStorage) para não travar o app em tela preta ao abrir sem internet.
    const localSession = readStoredAuthSession();
    const online = typeof navigator === "undefined" ? true : navigator.onLine;
    try {
      if (online) {
        const result = await withAuthRouteTimeout(supabase.auth.getUser());
        if (!result?.error && result?.data.user) {
          void verifyActiveSession();
          return { user: result.data.user };
        }
      }
    } catch {
      /* rede indisponível — cai para sessão local abaixo */
    }
    if (localSession?.user) {
      void verifyActiveSession();
      return { user: localSession.user };
    }
    const restored = await restoreSession();
    const restoredSession = restored ? readStoredAuthSession() : null;
    if (restoredSession?.user) {
      void verifyActiveSession();
      return { user: restoredSession.user };
    }
    throw redirect({ to: "/auth" });
  },
  component: () => <Outlet />,
});