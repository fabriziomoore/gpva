import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { verifyActiveSession } from "@/lib/session-guard";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    // Offline-safe: se getUser() falhar por rede, usa a sessão local
    // (localStorage) para não travar o app em tela preta ao abrir sem internet.
    const online = typeof navigator === "undefined" ? true : navigator.onLine;
    try {
      if (online) {
        const { data, error } = await supabase.auth.getUser();
        if (!error && data.user) {
          void verifyActiveSession();
          return { user: data.user };
        }
      }
    } catch {
      /* rede indisponível — cai para sessão local abaixo */
    }
    const { data: sess } = await supabase.auth.getSession();
    if (sess.session?.user) {
      void verifyActiveSession();
      return { user: sess.session.user };
    }
    throw redirect({ to: "/auth" });
  },
  component: () => <Outlet />,
});