import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { LocalService } from "@/lib/db/local-db";
import { getFailedPayload, setFormsStatus } from "@/lib/forms-status";
import { submitNegotiationToGoogleForm } from "@/lib/google-form";

type Props = {
  /** Lista de negociações com Forms pendente; `null` mantém o dialog fechado. */
  pending: LocalService[] | null;
  /** Fecha o dialog (chamado pelo overlay e após enviar com sucesso). */
  onClose: () => void;
  /** Prossegue para o fluxo normal de finalizar o expediente. */
  onFinishAnyway: () => void;
};

/**
 * Dialog exibido quando o usuário tenta finalizar o expediente e ainda há
 * negociações cujo Google Forms não foi enviado. Permite reabrir o Forms
 * pré-preenchido do primeiro pendente ou seguir finalizando assim mesmo.
 */
export function PendingFormsDialog({ pending, onClose, onFinishAnyway }: Props) {
  const count = pending?.length ?? 0;

  async function sendFirstPending() {
    const first = pending?.[0];
    if (!first) return;
    const payload = getFailedPayload(first.id);
    if (!payload) {
      toast.error("Dados do Forms não encontrados neste dispositivo.");
      return;
    }
    const online = typeof navigator === "undefined" ? true : navigator.onLine;
    if (!online) {
      toast.warning("Sem conexão — tente novamente quando estiver online.");
      return;
    }
    try {
      const opened = await submitNegotiationToGoogleForm(payload);
      if (opened) {
        setFormsStatus(first.id, "sent");
        toast.success("Forms aberto para envio manual.");
        onClose();
      } else {
        toast.error("Permita pop-ups para abrir o Forms.");
      }
    } catch (err) {
      toast.error(
        `Falha ao abrir Forms: ${err instanceof Error ? err.message : "erro desconhecido"}`,
      );
    }
  }

  return (
    <AlertDialog
      open={pending !== null}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Forms pendente de envio</AlertDialogTitle>
          <AlertDialogDescription>
            {count > 1
              ? `Existem ${count} negociações com o Forms ainda não enviado. Deseja enviar a primeira agora ou finalizar assim mesmo?`
              : "Há uma negociação com o Forms ainda não enviado. Deseja enviar agora ou finalizar assim mesmo?"}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-col gap-2 sm:flex-row">
          <Button variant="outline" onClick={onFinishAnyway}>
            Finalizar mesmo assim
          </Button>
          <Button onClick={() => void sendFirstPending()}>Enviar</Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
