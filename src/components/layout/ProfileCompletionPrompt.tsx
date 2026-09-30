import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuthSession } from "@/hooks/use-auth";
import { useTeam, type Team } from "@/hooks/use-team";
import { repoUpdateTeam } from "@/lib/db/repos";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

/**
 * Popup obrigatório (sem X, sem fechar clicando fora) pedindo sobrenome dos
 * colaboradores e placa do veículo — dados que faltam pra montar "Condutor
 * do Dia" no Forms de início de expediente. Só aparece pra quem já tem
 * nome de colaborador cadastrado mas não o sobrenome, ou não tem placa.
 * Some sozinho assim que os dados são salvos (não pergunta de novo).
 */
export function ProfileCompletionPrompt() {
  const { userId } = useAuthSession();
  const { data: team } = useTeam(userId);
  const qc = useQueryClient();

  const [last1, setLast1] = useState("");
  const [last2, setLast2] = useState("");
  const [plate, setPlate] = useState("");
  const [saving, setSaving] = useState(false);

  if (!team || !userId || team.is_test) return null;

  const needsCollab1Last = !!team.collaborator1 && !team.collaborator1_lastname;
  const needsCollab2Last = !!team.collaborator2 && !team.collaborator2_lastname;
  const needsPlate = !team.vehicle_plate;
  if (!needsCollab1Last && !needsCollab2Last && !needsPlate) return null;

  const canSave =
    (!needsCollab1Last || last1.trim().length > 0) &&
    (!needsCollab2Last || last2.trim().length > 0) &&
    (!needsPlate || plate.trim().length > 0);

  async function save() {
    if (!canSave) return;
    setSaving(true);
    try {
      const patch: Partial<Team> = {};
      if (needsCollab1Last) patch.collaborator1_lastname = last1.trim();
      if (needsCollab2Last) patch.collaborator2_lastname = last2.trim();
      if (needsPlate) patch.vehicle_plate = plate.trim().toUpperCase();
      await repoUpdateTeam(userId!, patch as Partial<Team>);
      qc.setQueryData<Team | null>(["team", userId], (old) => (old ? { ...old, ...patch } : old));
      toast.success("Dados salvos");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open>
      <DialogContent
        hideDefaultClose
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Preencha os dados abaixo</DialogTitle>
          <DialogDescription>
            Usados para preencher automaticamente o Forms de início de expediente.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {needsCollab1Last && (
            <div>
              <Label>Sobrenome do {team.collaborator1}</Label>
              <Input
                value={last1}
                onChange={(e) => setLast1(e.target.value)}
                className="h-11"
                autoFocus
              />
            </div>
          )}
          {needsCollab2Last && (
            <div>
              <Label>Sobrenome do {team.collaborator2}</Label>
              <Input value={last2} onChange={(e) => setLast2(e.target.value)} className="h-11" />
            </div>
          )}
          {needsPlate && (
            <div>
              <Label>Placa do veículo</Label>
              <Input
                value={plate}
                onChange={(e) => setPlate(e.target.value)}
                placeholder="Ex: ABC1D23"
                className="h-11 uppercase"
              />
            </div>
          )}
        </div>
        <Button onClick={save} disabled={!canSave || saving} className="h-11 w-full">
          {saving ? <Loader2 className="size-4 animate-spin" /> : "Salvar"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
