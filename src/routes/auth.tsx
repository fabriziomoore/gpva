import { createFileRoute, useNavigate, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { signInTeam } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  saveRemembered,
  getRemembered,
  clearRemembered,
  verifyRemembered,
} from "@/lib/remember-access";
import { restoreSession } from "@/lib/sync/session-backup";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import gpvaLogo from "@/assets/gpva-logo-wide.webp";

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
  const [remember, setRemember] = useState(false);

  // Preencher equipe salva, se houver
  useEffect(() => {
    void getRemembered().then((rec) => {
      if (rec?.team) {
        setTeam(rec.team);
        setRemember(true);
      }
    });
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
      if (remember) {
        await saveRemembered(team, password);
      } else {
        await clearRemembered();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro ao autenticar";
      // Falha de rede → tenta login offline com credenciais lembradas
      const isNetwork =
        !navigator.onLine ||
        msg.toLowerCase().includes("failed to fetch") ||
        msg.toLowerCase().includes("network") ||
        msg.toLowerCase().includes("load failed");
      if (isNetwork) {
        const ok = await verifyRemembered(team, password);
        if (ok) {
          await restoreSession();
          const { data } = await supabase.auth.getSession();
          if (data.session) {
            toast.success("Acesso offline autorizado");
            navigate({ to: "/" });
            return;
          }
          toast.error("Sem sessão salva para acesso offline. Conecte-se uma vez.");
        } else {
          toast.error("Sem internet. Marque 'Lembrar acesso' em um login online.");
        }
      } else if (msg.includes("Invalid login")) {
        toast.error("Equipe ou senha incorretas.");
      } else {
        toast.error(msg);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-background py-10">
      <div className="mb-8 w-full max-w-sm px-4">
        <div className="overflow-hidden rounded-2xl bg-[oklch(0.16_0.018_250)]">
          <img src={gpvaLogo} alt="GPVA — Gestão de Produtividade e Variável Autônoma" className="block w-full h-auto" />
        </div>
      </div>
      <div className="w-full max-w-sm px-4">

        <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="team">Loguin</Label>
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
            <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer select-none">
              <Checkbox
                checked={remember}
                onCheckedChange={(v) => {
                  const next = v === true;
                  setRemember(next);
                  if (!next) void clearRemembered();
                }}
              />
              Lembrar acesso
            </label>
            <Button type="submit" disabled={loading} className="h-12 w-full text-base font-semibold">
              {loading ? <Loader2 className="size-5 animate-spin" /> : "Entrar"}
            </Button>
        </form>

      </div>
      <p className="absolute inset-x-0 bottom-3 whitespace-nowrap overflow-hidden text-ellipsis px-4 text-center text-[10px] uppercase tracking-[0.18em] text-foreground dark:text-muted-foreground/60">
        Criado e desenvolvido por Fabrízio Moore
      </p>
    </div>
  );
}