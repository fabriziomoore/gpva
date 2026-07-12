import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { verifyActiveSession } from "@/lib/session-guard";
import { readStoredAuthSession, restoreSession } from "@/lib/sync/session-backup";

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
    // FAST PATH: se já há sessão em localStorage, entra sem esperar rede.
    // Isso evita "tela preta" enquanto o beforeLoad aguarda getUser/refresh.
    const localSession = readStoredAuthSession();
    if (localSession?.user) {
      void verifyActiveSession();
      return { user: localSession.user };
    }

    // Sem sessão local: tenta restaurar de armazenamento nativo (Capacitor
    // Preferences) com timeout curto. Se nada aparecer, vai para /auth.
    const restored = await withAuthRouteTimeout(restoreSession());
    const restoredSession = restored ? readStoredAuthSession() : null;
    if (restoredSession?.user) {
      void verifyActiveSession();
      return { user: restoredSession.user };
    }

    // Última tentativa rápida via supabase (memória) — não bloqueia offline.
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