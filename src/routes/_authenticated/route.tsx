import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { hasSessionEjection, verifyActiveSession } from "@/lib/session-guard";
import { readStoredAuthSession } from "@/lib/sync/session-backup";
import { hasValidOfflineUnlock } from "@/lib/offline-auth";

const AUTH_ROUTE_TIMEOUT_MS = 800;

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

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    bootLog("beforeLoad:start");
    if (hasSessionEjection()) {
      bootLog("beforeLoad:ejected->/auth");
      throw redirect({ to: "/auth" });
    }
    
    // 1) Fast path: sessão Supabase já viva na memória / storage do SDK.
    const localSession = readStoredAuthSession();
    bootLog("beforeLoad:readStoredAuthSession", { hasUser: !!localSession?.user });
    if (localSession?.user) {
      // Aguarda a checagem (expiração de 10h, inatividade de 2h30, takeover
      // por outro device, desconexão pelo admin) ANTES de liberar a tela —
      // nunca renderiza a área autenticada para só depois deslogar. Sem
      // `force`: expiração/inatividade sempre rodam (são locais, sem rede);
      // a parte de rede segue o throttle de 10s do próprio guard, então
      // navegações internas seguidas não pagam round-trip a cada clique.
      const ok = await verifyActiveSession({ userIdHint: localSession.user.id });
      if (!ok) {
        bootLog("beforeLoad:sessionInvalid->/auth");
        throw redirect({ to: "/auth" });
      }
      return { user: localSession.user };
    }

    // 2) Unlock offline: acesso autorizado por validação local de
    //    credencial (Capacitor Preferences).
    bootLog("beforeLoad:hasValidOfflineUnlock:awaiting");
    const offlineOk = await withAuthRouteTimeout(hasValidOfflineUnlock());
    bootLog("beforeLoad:hasValidOfflineUnlock:resolved", { offlineOk });
    if (offlineOk) {
      // Offline, não chamamos verifyActiveSession que poderia falhar e ejetar.
      // O heartbeat do guard cuidará disso quando a rede voltar.
      if (typeof navigator !== "undefined" && navigator.onLine) {
        void verifyActiveSession();
      }
      return { user: null };
    }

    // 3) Última tentativa rápida via Supabase — só quando online.
    const online = typeof navigator === "undefined" ? true : navigator.onLine;
    bootLog("beforeLoad:navigator.online", { online });
    if (online) {
      const result = await withAuthRouteTimeout(supabase.auth.getUser());
      bootLog("beforeLoad:supabase.getUser", { hasUser: !!result?.data?.user });
      if (result && !("error" in result && result.error) && result?.data?.user) {
        const ok = await verifyActiveSession({ userIdHint: result.data.user.id });
        if (!ok) {
          bootLog("beforeLoad:sessionInvalid->/auth");
          throw redirect({ to: "/auth" });
        }
        return { user: result.data.user };
      }
    }
    
    // Se chegamos aqui sem sessão e estamos offline, permitimos a entrada
    // se houver o backup persistente no Preferences, mesmo sem "unlock" formal.
    // Isso evita o spinner/deslogue falso durante quedas momentâneas.
    if (!online) {
      const { restoreSession } = await import("@/lib/sync/session-backup");
      const restored = await restoreSession();
      if (restored) {
        bootLog("beforeLoad:restoredFromBackup");
        return { user: null };
      }
    }

    bootLog("beforeLoad:redirect->/auth");
    throw redirect({ to: "/auth" });
  },
  component: () => <Outlet />,
});