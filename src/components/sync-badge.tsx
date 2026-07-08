import { useEffect, useState } from "react";
import { useSyncStore } from "@/lib/sync/store";
import { cn } from "@/lib/utils";

/**
 * Indicador discreto de estado offline / fila pendente.
 * Só aparece quando há algo relevante para mostrar
 * (offline, sincronizando, erro, ou pendências).
 */
export function SyncBadge() {
  const online = useSyncStore((s) => s.online);
  const phase = useSyncStore((s) => s.phase);
  const pending = useSyncStore((s) => s.pending);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  const showOffline = !online;
  const showSyncing = online && phase === "syncing";
  const showError = online && phase === "error";
  const showPending = online && phase !== "syncing" && pending > 0;

  if (!showOffline && !showSyncing && !showError && !showPending) return null;

  const label = showOffline
    ? pending > 0
      ? `Offline · ${pending} pendente${pending > 1 ? "s" : ""}`
      : "Offline"
    : showSyncing
      ? "Sincronizando…"
      : showError
        ? `Erro ao sincronizar${pending > 0 ? ` · ${pending}` : ""}`
        : `${pending} pendente${pending > 1 ? "s" : ""}`;

  const tone = showOffline
    ? "bg-muted text-muted-foreground border-border"
    : showError
      ? "bg-destructive/10 text-destructive border-destructive/30"
      : "bg-primary/10 text-primary border-primary/30";

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "pointer-events-none fixed bottom-3 left-1/2 z-50 -translate-x-1/2",
        "rounded-full border px-3 py-1 text-xs font-medium shadow-sm backdrop-blur",
        tone,
      )}
    >
      {label}
    </div>
  );
}