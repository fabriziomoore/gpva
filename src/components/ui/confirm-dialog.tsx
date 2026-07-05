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
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

type ConfirmOptions = {
  title?: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
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
  options: Omit<ConfirmOptions, "destructive"> = {},
): Promise<boolean> {
  return confirmAction({
    title: options.title ?? "Excluir registro?",
    description:
      options.description ??
      "Esta ação é permanente e não poderá ser desfeita. Deseja continuar?",
    confirmText: options.confirmText ?? "Excluir",
    cancelText: options.cancelText ?? "Cancelar",
    destructive: true,
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

  const destructive = pending?.destructive ?? true;

  return (
    <AlertDialog
      open={pending !== null}
      onOpenChange={(open) => {
        if (!open && pending) close(false);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <div className="flex items-start gap-3">
            {destructive && (
              <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-destructive/15 text-destructive">
                <AlertTriangle className="size-5" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <AlertDialogTitle>
                {pending?.title ?? "Confirmar ação"}
              </AlertDialogTitle>
              {pending?.description && (
                <AlertDialogDescription className="mt-1">
                  {pending.description}
                </AlertDialogDescription>
              )}
            </div>
          </div>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{pending?.cancelText ?? "Cancelar"}</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => close(true)}
            className={cn(
              destructive &&
                "bg-destructive text-destructive-foreground hover:bg-destructive/90",
            )}
          >
            {pending?.confirmText ?? "Confirmar"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}