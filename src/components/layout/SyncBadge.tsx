import { useSyncStore } from "@/lib/sync/store";
import { cn } from "@/lib/utils";

export function SyncBadge() {
  const { online, phase, pending } = useSyncStore();

  let color = "bg-emerald-500";
  let label = "Sincronizado";
  if (!online) {
    color = "bg-red-500";
    label = "Sem conexão";
  } else if (phase === "syncing") {
    color = "bg-yellow-400 animate-pulse";
    label = "Sincronizando";
  } else if (pending > 0) {
    color = "bg-orange-500";
    label = `${pending} pendente${pending > 1 ? "s" : ""}`;
  }

  return (
    <span
      className="inline-flex items-center gap-1.5 text-[10px] text-muted-foreground"
      title={label}
      aria-label={label}
    >
      <span className={cn("size-2 rounded-full", color)} />
    </span>
  );
}