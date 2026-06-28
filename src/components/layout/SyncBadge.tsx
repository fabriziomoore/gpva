import { useSyncStore } from "@/lib/sync/store";
import { drainOutbox } from "@/lib/sync/engine";
import { cn } from "@/lib/utils";

export function SyncBadge() {
  const { online, phase, pending } = useSyncStore();

  let color = "bg-emerald-500";
  let label = "Sincronizado";
  if (!online) {
    color = "bg-red-500";
    label = "Offline";
  } else if (phase === "syncing") {
    color = "bg-yellow-400 animate-pulse";
    label = "Sincronizando";
  } else if (phase === "error") {
    color = "bg-orange-500";
    label = pending > 0 ? `${pending} pendente${pending > 1 ? "s" : ""}` : "Erro";
  } else if (pending > 0) {
    color = "bg-orange-500";
    label = `${pending} pendente${pending > 1 ? "s" : ""}`;
  }

  const canRetry = online && (pending > 0 || phase === "error");

  return (
    <button
      type="button"
      onClick={() => canRetry && void drainOutbox()}
      disabled={!canRetry}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-border bg-card/60 px-2 py-0.5 text-[10px] font-medium text-muted-foreground transition-colors",
        canRetry && "hover:text-foreground hover:border-primary cursor-pointer",
      )}
      title={canRetry ? "Tocar para sincronizar agora" : label}
      aria-label={label}
    >
      <span className={cn("size-2 rounded-full", color)} />
      <span className="hidden xs:inline sm:inline">{label}</span>
    </button>
  );
}
