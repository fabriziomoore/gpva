import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuthSession } from "@/hooks/use-auth";
import { useTeam } from "@/hooks/use-team";
import { useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/layout/AppShell";
import { ShiftMeta } from "@/components/layout/ShiftMeta";
import { ExitConfirmDialog } from "@/components/layout/ExitConfirmDialog";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, LogOut } from "lucide-react";
import { toast } from "sonner";
import { getLocalDB } from "@/lib/db/local-db";
import { useTeamPhoto, setTeamPhoto, fileToCompressedDataUrl } from "@/lib/team-photo";

const TEST_TEAM_NAME = "RIOCERLT-TESTE";

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
  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [saving, setSaving] = useState(false);
  const [exitOpen, setExitOpen] = useState(false);
  const [resetting, setResetting] = useState(false);
  const teamPhoto = useTeamPhoto(userId);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  async function onPickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !userId) return;
    try {
      const dataUrl = await fileToCompressedDataUrl(file);
      setTeamPhoto(userId, dataUrl);
      toast.success("Foto atualizada");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao processar imagem");
    }
  }

  function removePhoto() {
    if (!userId) return;
    setTeamPhoto(userId, null);
    toast.success("Foto removida");
  }

  const isTestAccount = team?.team_name === TEST_TEAM_NAME;

  async function resetTestData() {
    if (!isTestAccount || !userId) return;
    if (!window.confirm("Apagar TODOS os dados desta conta de teste? Esta ação não pode ser desfeita.")) return;
    setResetting(true);
    try {
      const tables = ["vinculos_complementos", "impactos_expediente", "servicos", "expedientes"] as const;
      for (const t of tables) {
        const { error } = await supabase.from(t).delete().eq("team_id", userId);
        if (error) throw error;
      }
      try {
        const db = getLocalDB();
        await Promise.all([
          db.complement_links.clear(),
          db.shift_impacts.clear(),
          db.services.clear(),
          db.shifts.clear(),
          db.outbox.clear(),
        ]);
      } catch {
        /* ignore local clear errors */
      }
      await qc.invalidateQueries();
      toast.success("Dados de teste apagados");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao apagar");
    } finally {
      setResetting(false);
    }
  }

  async function confirmSignOut() {
    setExitOpen(false);
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  }

  useEffect(() => {
    if (team) {
      setSupervisor(team.supervisor);
      setLeader(team.leader);
    }
  }, [team]);

  async function saveTeam() {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("equipes")
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

  if (!team || !userId) {
    return (
      <AppShell title="Configurações" right={<ShiftMeta />}>
        <div className="flex justify-center py-20">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Configurações" right={<ShiftMeta />}>
      <div className="space-y-8">
        <section className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Equipe</h2>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Modo</span>
              <ThemeToggle />
            </div>
          </div>
          <div className="space-y-3">
            <div>
              <Label>Foto da equipe</Label>
              <div className="mt-2 flex items-center gap-3">
                <div className="size-16 overflow-hidden rounded-xl border border-border bg-muted flex items-center justify-center">
                  {teamPhoto ? (
                    <img src={teamPhoto} alt="Foto da equipe" className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-xs text-muted-foreground">Sem foto</span>
                  )}
                </div>
                <div className="flex flex-col gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={onPickPhoto}
                  />
                  <Button type="button" variant="outline" className="h-9" onClick={() => fileInputRef.current?.click()}>
                    {teamPhoto ? "Alterar foto" : "Adicionar foto"}
                  </Button>
                  {teamPhoto && (
                    <Button type="button" variant="ghost" className="h-9" onClick={removePhoto}>
                      Remover
                    </Button>
                  )}
                </div>
              </div>
            </div>
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
            onClick={() => setExitOpen(true)}
          >
            <LogOut className="mr-2 size-4" /> Sair
          </Button>

          {isTestAccount && (
            <div className="space-y-2 border-t border-border pt-6">
              <p className="text-sm font-semibold text-destructive">Conta de teste</p>
              <p className="text-xs text-muted-foreground">
                Apaga todos os expedientes, serviços, complementos e impactos criados por esta conta.
              </p>
              <Button
                variant="destructive"
                className="h-11 w-full"
                onClick={resetTestData}
                disabled={resetting}
              >
                {resetting ? <Loader2 className="size-4 animate-spin" /> : "Zerar dados de apresentação"}
              </Button>
            </div>
          )}
        </section>
      </div>
      <ExitConfirmDialog open={exitOpen} onOpenChange={setExitOpen} onConfirm={confirmSignOut} />
    </AppShell>
  );
}