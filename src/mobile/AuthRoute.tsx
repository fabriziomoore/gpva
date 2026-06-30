import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { LoginOnly } from "./LoginOnly";

export const Route = createFileRoute("/auth")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (data.session) throw redirect({ to: "/" });
  },
  component: MobileAuthPage,
});

function MobileAuthPage() {
  const navigate = useNavigate();
  return <LoginOnly onSignedIn={() => navigate({ to: "/" })} />;
}