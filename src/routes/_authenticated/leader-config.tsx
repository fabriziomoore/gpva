import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuthSession } from "@/hooks/use-auth";
import { useIsLeader } from "@/hooks/use-is-leader";
import { AppShell } from "@/components/layout/AppShell";
import { LeaderMeta } from "@/components/layout/LeaderMeta";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { translateAuthError } from "@/lib/auth-errors";

export const Route = createFileRoute("/_authenticated/leader-config")({
  ssr: false,
  head: () => ({ meta: [{ title: "Configuração — Líder" }] }),
  component: LeaderConfigPage,
});

type Row = {
  leader: string | null;
  supervisor: string | null;
  setores: { nome: string; supervisor_nome: string } | null;
};

function LeaderConfigPage() {
  const navigate = useNavigate();
  const { userId, session } = useAuthSession();
  const isLeader = useIsLeader(userId);

  useEffect(() => {
    if (isLeader.data === false) navigate({ to: "/" });
  }, [isLeader.data, navigate]);

  const meta = session?.user.user_metadata as { display_name?: string } | undefined;
  const leaderName =
    meta?.display_name?.trim() || session?.user.email?.split("@")[0] || "—";

  const teams = useQuery({
    queryKey: ["leader-config-teams", userId],
    enabled: !!userId && isLeader.data === true,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("equipes")
        .select("leader,supervisor,setores(nome,supervisor_nome)");
      if (error) throw error;
      return ((data ?? []) as unknown as Row[]).filter(
        (r) => (r.leader ?? "").trim() === leaderName,
      );
    },
  });

  const setores = Array.from(
    new Set((teams.data ?? []).map((t) => t.setores?.nome).filter((n): n is string => !!n)),
  );
  const supervisores = Array.from(
    new Set(
      (teams.data ?? [])
        .map((t) => t.setores?.supervisor_nome || t.supervisor)
        .filter((n): n is string => !!n),
    ),
  );

  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [saving, setSaving] = useState(false);

  async function changePassword() {
    if (pw1.length < 6 || pw1 !== pw2) {
      toast.error("Senhas não conferem (mín. 6).");
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: pw1 });
      if (error) throw error;
      setPw1("");
      setPw2("");
      toast.success("Senha alterada");
    } catch (err) {
      toast.error(translateAuthError(err, "Erro ao alterar senha"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell title="Configuração" right={<LeaderMeta />} showSync={false}>
      <div className="space-y-8">
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Dados do líder
            </h2>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Modo
              </span>
              <ThemeToggle />
            </div>
          </div>
          <div className="space-y-3">
            <div>
              <Label>Nome do líder</Label>
              <Input value={leaderName} disabled className="h-11" />
            </div>
            <div>
              <Label>Supervisor</Label>
              <Input value={supervisores.join(", ") || "—"} disabled className="h-11" />
            </div>
            <div>
              <Label>Setor</Label>
              <Input value={setores.join(", ") || "—"} disabled className="h-11" />
            </div>
          </div>
        </section>

        <section className="space-y-3 border-t border-border pt-6">
          <p className="text-sm font-semibold">Alterar senha</p>
          <Input
            type="password"
            placeholder="Nova senha"
            value={pw1}
            onChange={(e) => setPw1(e.target.value)}
            className="h-11"
          />
          <Input
            type="password"
            placeholder="Confirmar senha"
            value={pw2}
            onChange={(e) => setPw2(e.target.value)}
            className="h-11"
          />
          <Button
            onClick={changePassword}
            disabled={saving}
            variant="outline"
            className="h-11 w-full"
          >
            {saving ? <Loader2 className="size-4 animate-spin" /> : "Alterar senha"}
          </Button>
        </section>
      </div>
    </AppShell>
  );
}