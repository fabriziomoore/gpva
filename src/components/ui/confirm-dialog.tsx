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

type ConfirmOptions = {
  title?: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
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

  return (
    <AlertDialog
      open={pending !== null}
      onOpenChange={(open) => {
        if (!open && pending) close(false);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {pending?.title ?? "Confirmar ação"}
          </AlertDialogTitle>
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