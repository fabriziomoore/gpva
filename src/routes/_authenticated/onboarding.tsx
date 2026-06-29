import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuthSession } from "@/hooks/use-auth";
import { useTeam } from "@/hooks/use-team";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

export const Route = createFileRoute("/_authenticated/onboarding")({
  head: () => ({ meta: [{ title: "Configuração inicial" }] }),
  component: Onboarding,
});

function Onboarding() {
  const navigate = useNavigate();
  const { userId } = useAuthSession();
  const { data: team } = useTeam(userId);
  const qc = useQueryClient();
  const [supervisor, setSupervisor] = useState("");
  const [leader, setLeader] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (team) {
      setSupervisor(team.supervisor);
      setLeader(team.leader);
      if (team.onboarded) navigate({ to: "/" });
    }
  }, [team, navigate]);

  async function save() {
    if (!supervisor.trim() || !leader.trim()) {
      toast.error("Preencha supervisor e líder.");
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase
        .from("teams")
        .update({ supervisor, leader, onboarded: true })
        .eq("id", userId!);
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["team", userId] });
      navigate({ to: "/" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Configuração inicial</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Equipe <span className="font-semibold text-foreground">{team?.team_name}</span>. Cadastre apenas uma vez.
          </p>
        </div>
        <div className="space-y-3">
          <div>
            <Label htmlFor="sup">Supervisor</Label>
            <Input
              id="sup"
              value={supervisor}
              onChange={(e) => setSupervisor(e.target.value)}
              className="h-12 text-base"
              placeholder="Ex: Ricardo Cunha"
            />
          </div>
          <div>
            <Label htmlFor="lid">Líder</Label>
            <Input
              id="lid"
              value={leader}
              onChange={(e) => setLeader(e.target.value)}
              className="h-12 text-base"
              placeholder="Ex: Gabriel Araújo"
            />
          </div>
        </div>
        <Button onClick={save} disabled={saving} className="h-14 w-full text-base font-semibold">
          {saving ? <Loader2 className="size-5 animate-spin" /> : "Salvar e continuar"}
        </Button>
      </div>
    </div>
  );
}