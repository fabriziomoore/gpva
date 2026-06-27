import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuthSession } from "@/hooks/use-auth";
import { useTeam } from "@/hooks/use-team";
import { useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, LogOut } from "lucide-react";
import { toast } from "sonner";
import { CrudList } from "@/components/settings/CrudList";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Configurações" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  const { userId } = useAuthSession();
  const { data: team } = useTeam(userId);
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [supervisor, setSupervisor] = useState("");
  const [leader, setLeader] = useState("");
  const [rate, setRate] = useState("7.00");
  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (team) {
      setSupervisor(team.supervisor);
      setLeader(team.leader);
      setRate(String(team.variable_rate));
    }
  }, [team]);

  async function saveTeam() {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("teams")
        .update({ supervisor, leader })
        .eq("id", userId!);
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["team", userId] });
      toast.success("Equipe atualizada");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro");
    } finally {
      setSaving(false);
    }
  }

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
      toast.error(err instanceof Error ? err.message : "Erro");
    } finally {
      setSaving(false);
    }
  }

  async function saveRate() {
    const n = Number(rate.replace(",", "."));
    if (!isFinite(n) || n < 0) {
      toast.error("Valor inválido");
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase
        .from("teams")
        .update({ variable_rate: n })
        .eq("id", userId!);
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["team", userId] });
      toast.success("Valor da variável atualizado");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro");
    } finally {
      setSaving(false);
    }
  }

  if (!team || !userId) {
    return (
      <AppShell title="Configurações">
        <div className="flex justify-center py-20">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Configurações">
      <div className="space-y-8">
        <section className="space-y-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Equipe</h2>
          <div className="space-y-3">
            <div>
              <Label>Nome da equipe</Label>
              <Input value={team.team_name} disabled className="h-11" />
            </div>
            <div>
              <Label htmlFor="sup">Supervisor</Label>
              <Input id="sup" value={supervisor} onChange={(e) => setSupervisor(e.target.value)} className="h-11" />
            </div>
            <div>
              <Label htmlFor="lid">Líder</Label>
              <Input id="lid" value={leader} onChange={(e) => setLeader(e.target.value)} className="h-11" />
            </div>
            <Button onClick={saveTeam} disabled={saving} className="h-11 w-full">
              {saving ? <Loader2 className="size-4 animate-spin" /> : "Salvar"}
            </Button>
          </div>

          <div className="space-y-3 border-t border-border pt-6">
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
            <Button onClick={changePassword} disabled={saving} variant="outline" className="h-11 w-full">
              Alterar senha
            </Button>
          </div>

          <Button
            variant="outline"
            className="h-11 w-full"
            onClick={async () => {
              await supabase.auth.signOut();
              navigate({ to: "/auth" });
            }}
          >
            <LogOut className="mr-2 size-4" /> Sair
          </Button>
        </section>

        <section className="space-y-6 border-t border-border pt-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Cadastros</h2>
          <CrudList table="service_types" teamId={userId} label="Tipos de serviço" />
          <CrudList table="inviability_reasons" teamId={userId} label="Motivos de inviabilidade" />
          <CrudList table="impacts" teamId={userId} label="Impactos" />
        </section>

        <section className="space-y-3 border-t border-border pt-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Variável</h2>
          <Label htmlFor="rate">Valor pago por negociação (R$)</Label>
          <Input
            id="rate"
            inputMode="decimal"
            value={rate}
            onChange={(e) => setRate(e.target.value.replace(/[^0-9.,]/g, ""))}
            className="h-12 text-base"
          />
          <p className="text-xs text-muted-foreground">
            Aplicado automaticamente a todas as estimativas futuras.
          </p>
          <Button onClick={saveRate} disabled={saving} className="h-11 w-full">
            {saving ? <Loader2 className="size-4 animate-spin" /> : "Salvar"}
          </Button>
        </section>
      </div>
    </AppShell>
  );
}