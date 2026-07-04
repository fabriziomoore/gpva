import { useEffect, useSyncExternalStore } from "react";
import { CheckCircle2, XCircle } from "lucide-react";

type State = { status: "success" | "error"; id: number } | null;

let current: State = null;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

export function showFormsFeedback(status: "success" | "error") {
  current = { status, id: Date.now() };
  emit();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function getSnapshot() {
  return current;
}

export function FormsFeedbackOverlay() {
  const state = useSyncExternalStore(subscribe, getSnapshot, () => null);

  useEffect(() => {
    if (!state) return;
    const t = setTimeout(() => {
      current = null;
      emit();
    }, 2500);
    return () => clearTimeout(t);
  }, [state]);

  if (!state) return null;

  const isOk = state.status === "success";

  return (
    <div className="pointer-events-none fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div
        className={`pointer-events-auto flex flex-col items-center gap-3 rounded-3xl border px-8 py-6 shadow-2xl backdrop-blur-md animate-in fade-in zoom-in-95 duration-200 ${
          isOk
            ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-100"
            : "border-red-500/40 bg-red-500/15 text-red-100"
        }`}
      >
        {isOk ? (
          <CheckCircle2 className="size-14 text-emerald-400" strokeWidth={2.5} />
        ) : (
          <XCircle className="size-14 text-red-400" strokeWidth={2.5} />
        )}
        <p className="text-center text-lg font-semibold">
          {isOk ? "Forms enviado" : "Falha no envio do forms"}
        </p>
      </div>
    </div>
  );
}