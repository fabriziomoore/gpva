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
  const pending = useSyncStore((s) => s.pending);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  // Faixa exibida SOMENTE quando o dispositivo está offline. Sincronização,
  // pendências e erros são comunicados via toast/indicador de topo — a faixa
  // vermelha não deve piscar ao registrar um serviço.
  const visible = mounted && !online;

  // Nunca reservar espaço no layout: a faixa sobrepõe os botões de ação.
  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.style.setProperty("--sync-banner-h", "0px");
  }, []);

  if (!visible) return null;

  const label = pending > 0
    ? `Offline · ${pending} pendente${pending > 1 ? "s" : ""}`
    : "Offline";

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "pointer-events-none fixed inset-x-0 bottom-0 z-[9990]",
        "flex items-center justify-center bg-red-600",
        "px-4 pt-1.5 text-xs font-semibold text-white",
        "pb-[calc(env(safe-area-inset-bottom)+6px)]",
      )}
    >
      {label}
    </div>
  );
}