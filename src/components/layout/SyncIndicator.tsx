import { useEffect, useRef, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useSyncStore } from "@/lib/sync/store";
import { manualSync } from "@/lib/sync/init";
import { cn } from "@/lib/utils";

/**
 * Indicador Global Inteligente de Sincronização (GPVA Design System).
 *
 * Substitui a borda inferior do cabeçalho. Ocupa 2px de altura, largura
 * total, sem alterar o layout. Em repouso, parece uma linha divisória.
 * Durante atividade, ganha vida via animações aceleradas por GPU
 * (transform/opacity apenas). Único componente, mesmo binário para
 * Web/Android/iOS.
 */
export function SyncIndicator() {
  const { online, phase, pending, lastSyncAt } = useSyncStore();
  const [justCompleted, setJustCompleted] = useState(false);
  const [manualRunning, setManualRunning] = useState(false);
  const prevPhase = useRef(phase);

  // Detect syncing → idle transition and play a single confirmation pass.
  useEffect(() => {
    if (prevPhase.current === "syncing" && phase === "idle") {
      setJustCompleted(true);
      const t = setTimeout(() => setJustCompleted(false), 900);
      return () => clearTimeout(t);
    }
    prevPhase.current = phase;
  }, [phase]);

  const state: "offline" | "syncing" | "pending" | "completed" | "idle" = !online
    ? "offline"
    : phase === "syncing"
      ? "syncing"
      : justCompleted
        ? "completed"
        : pending > 0 || phase === "error"
          ? "pending"
          : "idle";

  // GPVA official gradient + per-state palettes (CSS vars for theming).
  const gradient =
    state === "offline"
      ? "linear-gradient(90deg,#7f1d1d,#ef4444,#7f1d1d)"
      : state === "pending"
        ? "linear-gradient(90deg,#7c2d12,#f97316,#facc15,#f97316,#7c2d12)"
        : "linear-gradient(90deg,#1d4ed8,#06b6d4,#22c55e)";

  const label =
    state === "offline"
      ? "Sem conexão"
      : state === "syncing"
        ? "Sincronizando…"
        : state === "pending"
          ? `${pending} registro${pending === 1 ? "" : "s"} pendente${pending === 1 ? "" : "s"}`
          : "Sincronizado";

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Sincronização: ${label}`}
          className="group relative block h-[2px] w-full cursor-pointer overflow-hidden border-0 bg-transparent p-0 outline-none focus-visible:h-[3px]"
        >
          {/* Base gradient line — always visible, very subtle in idle */}
          <span
            aria-hidden
            className={cn(
              "absolute inset-0 transition-opacity duration-500 will-change-[opacity]",
              state === "idle" ? "opacity-40" : "opacity-90",
            )}
            style={{ backgroundImage: gradient }}
          />
          {/* Soft glow underlay */}
          <span
            aria-hidden
            className="absolute inset-0 blur-[2px] opacity-40 motion-reduce:hidden"
            style={{ backgroundImage: gradient }}
          />
          {/* Fiber-optic traveling beam (syncing / completed) */}
          {(state === "syncing" || state === "completed") && (
            <span
              aria-hidden
              className={cn(
                "absolute inset-y-0 left-0 w-1/3 motion-reduce:hidden",
                state === "syncing" ? "gpva-sync-beam" : "gpva-sync-beam-once",
              )}
              style={{
                backgroundImage:
                  "linear-gradient(90deg, transparent, rgba(255,255,255,0.85), transparent)",
              }}
            />
          )}
          {/* Pulsation for pending / offline */}
          {(state === "pending" || state === "offline") && (
            <span
              aria-hidden
              className={cn(
                "absolute inset-0 motion-reduce:hidden",
                state === "pending" ? "gpva-sync-pulse" : "gpva-sync-pulse-slow",
              )}
              style={{ backgroundImage: gradient }}
            />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={6} className="w-72 text-xs">
        <div className="mb-2 flex items-center gap-2">
          <span
            className="inline-block h-2 w-8 rounded-full"
            style={{ backgroundImage: gradient }}
          />
          <span className="font-semibold">{label}</span>
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-muted-foreground">
          <dt>Conexão</dt>
          <dd className="text-foreground">{online ? "Online" : "Offline"}</dd>
          <dt>Pendentes</dt>
          <dd className="text-foreground">{pending}</dd>
          <dt>Última sincronização</dt>
          <dd className="text-foreground">{formatWhen(lastSyncAt)}</dd>
          <dt>Banco local</dt>
          <dd className="text-foreground">Ativo</dd>
          <dt>Banco em nuvem</dt>
          <dd className="text-foreground">{online ? "Conectado" : "Aguardando rede"}</dd>
        </dl>
        <p className="mt-3 text-[10px] leading-relaxed text-muted-foreground">
          A sincronização ocorre automaticamente em segundo plano.
        </p>
        <button
          type="button"
          disabled={manualRunning || (!online && typeof navigator !== "undefined" && navigator.onLine === false)}
          onClick={() => {
            setManualRunning(true);
            void manualSync().finally(() => setManualRunning(false));
          }}
          className="mt-3 h-9 w-full rounded-lg bg-primary text-xs font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60"
        >
          {manualRunning ? "Enviando…" : "Enviar agora"}
        </button>
      </PopoverContent>
    </Popover>
  );
}

function formatWhen(ts: number | null): string {
  if (!ts) return "—";
  const d = new Date(ts);
  const date = d.toLocaleDateString("pt-BR");
  const time = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return `${date} às ${time}`;
}