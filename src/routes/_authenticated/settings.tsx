import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuthSession } from "@/hooks/use-auth";
import { useTeam } from "@/hooks/use-team";
import { useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/layout/AppShell";
import { ShiftMeta } from "@/components/layout/ShiftMeta";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { translateAuthError } from "@/lib/auth-errors";
import { getLocalDB } from "@/lib/db/local-db";
import { useTeamPhoto, saveTeamPhoto, fileToCompressedDataUrl } from "@/lib/team-photo";
import { repoUpdateTeam } from "@/lib/db/repos";
import type { Team } from "@/hooks/use-team";

const TEST_TEAM_NAME = "TESTANDO";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Configurações" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  const { userId } = useAuthSession();
  const { data: team } = useTeam(userId);
  const qc = useQueryClient();

  const [supervisor, setSupervisor] = useState("");
  const [leader, setLeader] = useState("");
  const [collab1, setCollab1] = useState("");
  const [collab2, setCollab2] = useState("");
  const [teamName, setTeamName] = useState("");
  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const teamPhoto = useTeamPhoto(userId);
  const isTestAccountRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  async function onPickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !userId) return;
    try {
      const dataUrl = await fileToCompressedDataUrl(file);
      await saveTeamPhoto(userId, dataUrl);
      qc.setQueryData<Team | null>(["team", userId], (old) =>
        old ? { ...old, photo_url: dataUrl } : old,
      );
      toast.success("Foto atualizada");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao processar imagem");
    }
  }

  async function removePhoto() {
    if (!userId) return;
    try {
      await saveTeamPhoto(userId, null);
      qc.setQueryData<Team | null>(["team", userId], (old) =>
        old ? { ...old, photo_url: null } : old,
      );
      toast.success("Foto removida");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao remover");
    }
  }

  if (team?.team_name === TEST_TEAM_NAME) isTestAccountRef.current = true;
  const isTestAccount = isTestAccountRef.current;

  async function resetTestData() {
    if (!isTestAccount || !userId) return;
    const { confirmDelete } = await import("@/components/ui/confirm-dialog");
    if (!(await confirmDelete({
      title: "Apagar dados da conta de teste?",
      description: "TODOS os expedientes, serviços, impactos e vínculos desta conta serão apagados. Esta ação não pode ser desfeita.",
      confirmText: "Apagar tudo",
    }))) return;
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

  useEffect(() => {
    if (team) {
      setSupervisor(team.supervisor);
      setLeader(team.leader);
      setCollab1(team.collaborator1 || "");
      setCollab2(team.collaborator2 || "");
      setTeamName(team.team_name);
    }
  }, [team]);

  async function saveTeam() {
    setSaving(true);
    try {
      const patch: Partial<Team> = { 
        supervisor, 
        leader,
        collaborator1: collab1.trim() || null,
        collaborator2: collab2.trim() || null
      };
      
      if (isTestAccount) {
        const trimmed = teamName.trim();
        if (!trimmed) {
          toast.error("Nome da equipe não pode ficar vazio");
          setSaving(false);
          return;
        }
        patch.team_name = trimmed;
      }
      
      await repoUpdateTeam(userId!, patch as any);
      qc.setQueryData<Team | null>(["team", userId], (old) =>
        old ? { ...old, ...patch } : old,
      );
      toast.success("Dados atualizados");
    } catch (err) {
      toast.error(translateAuthError(err, "Erro ao salvar equipe"));
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
      toast.error(translateAuthError(err, "Erro ao alterar senha"));
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
              <Input
                value={isTestAccount ? teamName : team.team_name}
                disabled={!isTestAccount}
                onChange={(e) => setTeamName(e.target.value)}
                className="h-11"
              />
            </div>
            <div>
              <Label>Colaborador 1</Label>
              <Input
                value={collab1}
                onChange={(e) => setCollab1(e.target.value)}
                placeholder="Nome do primeiro colaborador"
                className="h-11"
              />
            </div>
            <div>
              <Label>Colaborador 2</Label>
              <Input
                value={collab2}
                onChange={(e) => setCollab2(e.target.value)}
                placeholder="Nome do segundo colaborador"
                className="h-11"
              />
            </div>
            <div>
              <Label htmlFor="sup">Supervisor</Label>
              <Input
                id="sup"
                value={supervisor}
                onChange={(e) => setSupervisor(e.target.value)}
                disabled={!isTestAccount}
                className="h-11"
              />
            </div>
            <div>
              <Label htmlFor="lid">Líder</Label>
              <Input
                id="lid"
                value={leader}
                onChange={(e) => setLeader(e.target.value)}
                disabled={!isTestAccount}
                className="h-11"
              />
            </div>
            <Button onClick={saveTeam} disabled={saving} className="h-11 w-full">
              {saving ? <Loader2 className="size-4 animate-spin" /> : "Salvar alterações"}
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
    </AppShell>
  );
}