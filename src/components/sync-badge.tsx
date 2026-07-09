import { useEffect, useState } from "react";
import { useSyncStore } from "@/lib/sync/store";
import { cn } from "@/lib/utils";

/**
 * Faixa inferior de largura total exibida quando o app está offline, com
 * pendências ou sincronizando. Reserva espaço via a CSS var
 * `--sync-banner-h` para que botões flutuantes (ex.: Finalizar / + Serviço)
 * subam automaticamente enquanto ela estiver visível.
 */
export function SyncBadge() {
  const online = useSyncStore((s) => s.online);
  const phase = useSyncStore((s) => s.phase);
  const pending = useSyncStore((s) => s.pending);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const showOffline = !online;
  const showSyncing = mounted && online && phase === "syncing";
  const showError = mounted && online && phase === "error";
  const showPending = mounted && online && phase !== "syncing" && pending > 0;
  const visible = mounted && (showOffline || showSyncing || showError || showPending);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    if (visible) {
      root.style.setProperty("--sync-banner-h", "calc(env(safe-area-inset-bottom) + 32px)");
    } else {
      root.style.setProperty("--sync-banner-h", "0px");
    }
  }, [visible]);

  useEffect(() => {
    return () => {
      if (typeof document !== "undefined") {
        document.documentElement.style.setProperty("--sync-banner-h", "0px");
      }
    };
  }, []);

  if (!visible) return null;

  const label = showOffline
    ? pending > 0
      ? `Offline · ${pending} pendente${pending > 1 ? "s" : ""}`
      : "Offline"
    : showSyncing
      ? "Sincronizando…"
      : showError
        ? `Erro ao sincronizar${pending > 0 ? ` · ${pending}` : ""}`
        : `${pending} pendente${pending > 1 ? "s" : ""}`;

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "pointer-events-none fixed inset-x-0 bottom-0 z-50",
        "flex items-center justify-center border-t border-white/70 bg-red-600",
        "px-4 pt-1.5 text-xs font-semibold text-white",
        "pb-[calc(env(safe-area-inset-bottom)+6px)]",
      )}
    >
      {label}
    </div>
  );
}