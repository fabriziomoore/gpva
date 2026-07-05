import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { verifyActiveSession } from "@/lib/session-guard";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    // Não bloqueia a navegação — a verificação de takeover roda em background
    // (realtime + heartbeat cuidam de expulsar sessão antiga).
    void verifyActiveSession();
    return { user: data.user };
  },
  component: () => <Outlet />,
});