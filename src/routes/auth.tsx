import { createFileRoute, useNavigate, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { signInTeam } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import gpvaLogo from "@/assets/gpva-logo-wide.png";

export const Route = createFileRoute("/auth")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (data.session) throw redirect({ to: "/" });
  },
  head: () => ({ meta: [{ title: "Entrar — GPVA" }] }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [team, setTeam] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [adminPw, setAdminPw] = useState("");
  const [nativeApp, setNativeApp] = useState(false);

  useEffect(() => {
    const w = window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } };
    setNativeApp(!!w.Capacitor?.isNativePlatform?.());
  }, []);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session) {
        navigate({ to: "/" });
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [navigate]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!team.trim() || password.length < 6) {
      toast.error("Preencha equipe e senha (mín. 6 caracteres).");
      return;
    }
    setLoading(true);
    try {
      await signInTeam(team, password);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro ao autenticar";
      if (msg.includes("Invalid login")) toast.error("Equipe ou senha incorretas.");
      else toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-background py-10">
      <div className="relative mb-8 w-full">
        {/* Black band behind the logo, only visible in light mode.
            Uses 100vw + negative margins so it spans edge-to-edge on Android,
            and matches the logo's full height to cover it completely. */}
        <div
          className="pointer-events-none absolute top-0 bottom-0 left-1/2 -translate-x-1/2 w-screen bg-black dark:hidden"
          aria-hidden="true"
        />
        <img
          src={gpvaLogo}
          alt="GPVA — Gestão de Produtividade e Variável Autônoma"
          className="relative block w-full h-auto"
        />
      </div>
      <div className="w-full max-w-sm px-4">

        <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="team">Equipe</Label>
              <Input
                id="team"
                value={team}
                onChange={(e) => setTeam(e.target.value)}
                placeholder=""
                autoCapitalize="characters"
                autoComplete="username"
                className="h-12 text-base"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pw">Senha</Label>
              <Input
                id="pw"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                className="h-12 text-base"
              />
            </div>
            <Button type="submit" disabled={loading} className="h-12 w-full text-base font-semibold">
              {loading ? <Loader2 className="size-5 animate-spin" /> : "Entrar"}
            </Button>
        </form>

        {!nativeApp && <div className="mt-6 text-center">
          {!adminOpen ? (
            <button
              type="button"
              onClick={() => setAdminOpen(true)}
              className="text-[11px] text-muted-foreground/50 hover:text-muted-foreground underline-offset-4 hover:underline"
            >
              Configuração
            </button>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (adminPw === "137889") {
                  sessionStorage.setItem("gpva-admin-pw", adminPw);
                  setAdminOpen(false);
                  setAdminPw("");
                  navigate({ to: "/admin" });
                } else {
                  toast.error("Senha de administrador incorreta.");
                }
              }}
              className="flex items-center gap-2"
            >
              <Input
                type="password"
                value={adminPw}
                onChange={(e) => setAdminPw(e.target.value)}
                placeholder="Senha admin"
                autoFocus
                className="h-9 text-sm"
              />
              <Button type="submit" variant="secondary" size="sm" className="h-9">
                OK
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-9"
                onClick={() => {
                  setAdminOpen(false);
                  setAdminPw("");
                }}
              >
                Cancelar
              </Button>
            </form>
          )}
        </div>}
      </div>
      <p className="absolute inset-x-0 bottom-3 whitespace-nowrap overflow-hidden text-ellipsis px-4 text-center text-[10px] uppercase tracking-[0.18em] text-muted-foreground/60">
        Criado e desenvolvido por Fabrízio Moore
      </p>
    </div>
  );
}