import { useEffect, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useBackHandler } from "@/lib/back-handler";
import { FitText } from "@/components/ui/fit-text";

type ConfirmOptions = {
  title?: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  /** Mantém o título numa linha só, reduzindo a fonte se não couber. */
  singleLineTitle?: boolean;
};

type Pending = ConfirmOptions & { resolve: (value: boolean) => void };

let emit: ((p: Pending) => void) | null = null;

/**
 * Imperative confirmation dialog. Returns a Promise<boolean>.
 * Uso: `if (!(await confirmAction({ title: "Excluir?" }))) return;`
 */
export function confirmAction(options: ConfirmOptions = {}): Promise<boolean> {
  return new Promise((resolve) => {
    if (!emit) {
      // Fallback caso o host não esteja montado
      resolve(window.confirm(options.description ?? options.title ?? "Confirmar?"));
      return;
    }
    emit({ ...options, resolve });
  });
}

/** Atalho para ações destrutivas (exclusões). */
export function confirmDelete(
  options: ConfirmOptions = {},
): Promise<boolean> {
  return confirmAction({
    title: options.title ?? "Excluir registro?",
    description:
      options.description ??
      "Esta ação é permanente e não poderá ser desfeita. Deseja continuar?",
    confirmText: options.confirmText ?? "Excluir",
    cancelText: options.cancelText ?? "Cancelar",
  });
}

export function ConfirmDialogHost() {
  const [pending, setPending] = useState<Pending | null>(null);

  useEffect(() => {
    emit = (p) => setPending(p);
    return () => {
      emit = null;
    };
  }, []);

  const close = (result: boolean) => {
    if (pending) pending.resolve(result);
    setPending(null);
  };

  // Voltar do Android com o diálogo aberto = Cancelar (em vez de acionar o
  // handler da tela que está por trás).
  useBackHandler(pending !== null, () => close(false));

  return (
    <AlertDialog
      open={pending !== null}
      onOpenChange={(open) => {
        if (!open && pending) close(false);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          {pending?.singleLineTitle ? (
            <FitTitle text={pending.title ?? "Confirmar ação"} />
          ) : (
            <AlertDialogTitle>
              {pending?.title ?? "Confirmar ação"}
            </AlertDialogTitle>
          )}
          {pending?.description && (
            <AlertDialogDescription>{pending.description}</AlertDialogDescription>
          )}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{pending?.cancelText ?? "Cancelar"}</AlertDialogCancel>
          <AlertDialogAction onClick={() => close(true)}>
            {pending?.confirmText ?? "Confirmar"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
// Título numa linha só, reduzindo a fonte só o necessário pra caber (FitText
// cuida do cálculo, inclusive com a fonte do sistema aumentada no Android).
function FitTitle({ text }: { text: string }) {
  return (
    <AlertDialogTitle>
      <FitText>{text}</FitText>
    </AlertDialogTitle>
  );
}
