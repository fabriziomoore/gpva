import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useMemo, useRef } from "react";
import { useAuthSession } from "@/hooks/use-auth";
import { useTeam } from "@/hooks/use-team";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Plus, Flag, CheckCircle2, XCircle, Banknote, Loader2, MapPin, Pencil, Trash2, X } from "lucide-react";
import { repoDeleteService } from "@/lib/db/repos";
import { AddServiceSheet } from "@/components/shift/AddServiceSheet";
import { FinishShiftSheet } from "@/components/shift/FinishShiftSheet";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatBRL } from "@/lib/format";
import { useLiveQuery } from "dexie-react-hooks";
import { getLocalDB } from "@/lib/db/local-db";
import type { LocalService } from "@/lib/db/local-db";
import { useFormsStatus, getFailedPayload, setFormsStatus } from "@/lib/forms-status";
import { submitNegotiationToGoogleForm } from "@/lib/google-form";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
} from "@/components/ui/alert-dialog";
import { getFormsStatus } from "@/lib/forms-status";

export const Route = createFileRoute("/_authenticated/shift")({
  head: () => ({ meta: [{ title: "Expediente" }] }),
  component: ShiftPage,
});

function ShiftPage() {
  const { userId } = useAuthSession();
  const navigate = useNavigate();
  const { data: team } = useTeam(userId);
  const [addOpen, setAddOpen] = useState(false);
  const [finishOpen, setFinishOpen] = useState(false);
  const [pendingForms, setPendingForms] = useState<LocalService[] | null>(null);
  const [selectedService, setSelectedService] = useState<LocalService | null>(null);
  const [editTarget, setEditTarget] = useState<LocalService | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<LocalService | null>(null);
  const [deleting, setDeleting] = useState(false);

  const openShift = useLiveQuery(async () => {
    if (!userId) return null;
    const db = getLocalDB();
    const row = await db.shifts
      .where("[team_id+status+started_at]")
      .between([userId, "open", ""], [userId, "open", "\uffff"])
      .last();
    return row ?? null;
  }, [userId]);

  const services = useLiveQuery(async () => {
    if (!openShift?.id) return [];
    const db = getLocalDB();
    const rows = await db.services.where("shift_id").equals(openShift.id).toArray();
    rows.sort((a, b) => (b.created_at > a.created_at ? 1 : -1));
    return rows;
  }, [openShift?.id]);

  const complementLinks = useLiveQuery(async () => {
    if (!openShift?.id) return [];
    const db = getLocalDB();
    return db.complement_links.where("shift_id").equals(openShift.id).toArray();
  }, [openShift?.id]);

  const complementsByService = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const c of complementLinks ?? []) {
      const arr = map.get(c.service_id) ?? [];
      arr.push(c.complement_name);
      map.set(c.service_id, arr);
    }
    return map;
  }, [complementLinks]);

  // Versão completa (id + nome) para pré-preencher o fluxo de edição.
  const complementRowsByService = useMemo(() => {
    const map = new Map<string, { id: string | null; name: string }[]>();
    for (const c of complementLinks ?? []) {
      const arr = map.get(c.service_id) ?? [];
      arr.push({ id: c.complement_id ?? null, name: c.complement_name });
      map.set(c.service_id, arr);
    }
    return map;
  }, [complementLinks]);

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await repoDeleteService(deleteTarget.id);
      toast.success("Serviço excluído");
      setDeleteTarget(null);
      setSelectedService(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao excluir");
    } finally {
      setDeleting(false);
    }
  }

  const loading = openShift === undefined || services === undefined;

  const kpis = useMemo(() => {
    const list = services ?? [];
    const total = list.length;
    const viaveis = list.filter((x) => x.viable).length;
    const inviaveis = list.filter((x) => !x.viable).length;
    const negociacoes = list.filter((x) => x.is_negotiation && x.viable);
    const totalNeg = negociacoes.reduce((a, b) => a + (Number(b.negotiated_value) || 0), 0);
    const rate = openShift?.variable_rate_snapshot ?? team?.variable_rate ?? 7;
    const variavel = negociacoes.length * Number(rate);
    return { total, viaveis, inviaveis, totalNeg, variavel };
  }, [services, openShift, team]);

  function attemptFinish() {
    const list = services ?? [];
    const pending = list.filter(
      (s) => s.is_negotiation && getFormsStatus(s.id) === "failed",
    );
    if (pending.length > 0) {
      setPendingForms(pending);
      return;
    }
    setFinishOpen(true);
  }

  async function sendFirstPending() {
    const first = pendingForms?.[0];
    if (!first) return;
    const payload = getFailedPayload(first.id);
    if (!payload) {
      toast.error("Dados do Forms não encontrados neste dispositivo.");
      return;
    }
    const online = typeof navigator === "undefined" ? true : navigator.onLine;
    if (!online) {
      toast.warning("Sem conexão — tente novamente quando estiver online.");
      return;
    }
    try {
      const opened = await submitNegotiationToGoogleForm(payload);
      if (opened) {
        setFormsStatus(first.id, "sent");
        toast.success("Forms aberto para envio manual.");
        setPendingForms(null);
      } else {
        toast.error("Permita pop-ups para abrir o Forms.");
      }
    } catch (err) {
      toast.error(
        `Falha ao abrir Forms: ${err instanceof Error ? err.message : "erro desconhecido"}`,
      );
    }
  }

  if (loading) {
    return (
      <AppShell title="Expediente" right={<ShiftMeta teamName={team?.team_name} />}>
        <div className="flex justify-center py-20">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      </AppShell>
    );
  }

  if (!openShift) {
    return (
      <AppShell title="Expediente" right={<ShiftMeta teamName={team?.team_name} />}>
        <div className="rounded-2xl border border-border bg-card p-6 text-center">
          <p className="text-muted-foreground">Nenhum expediente em andamento.</p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Expediente" right={<ShiftMeta teamName={team?.team_name} />}>
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-2">
          <Kpi label="Total" value={String(kpis.total).padStart(2, "0")} />
          <Kpi label="Viáveis" value={String(kpis.viaveis).padStart(2, "0")} tone="success" />
          <Kpi label="Inviáveis" value={String(kpis.inviaveis).padStart(2, "0")} tone="destructive" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Kpi label="Negociado" value={formatBRL(kpis.totalNeg)} small />
          <Kpi label="Variável estimada" value={formatBRL(kpis.variavel)} small tone="primary" />
        </div>

        <div className="space-y-2">
          {services.length === 0 && (
            <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              Nenhum serviço registrado. Toque em + para começar.
            </p>
          )}
          {services.map((s) => (
            <ServiceRow
              key={s.id}
              s={s}
              complementsByService={complementsByService}
              selected={selectedService?.id === s.id}
              onLongPress={(svc) => setSelectedService(svc)}
            />
          ))}
        </div>
      <div
        className="fixed inset-x-0 z-30 mx-auto flex max-w-md justify-between gap-2 px-4 transition-[bottom] duration-150"
        style={{ bottom: "var(--sync-floating-bottom, calc(env(safe-area-inset-bottom, 0px) + 1rem))" }}
      >
          <Button
            onClick={attemptFinish}
            className="h-14 flex-1 border-0 bg-destructive text-base font-semibold text-destructive-foreground hover:bg-destructive/90"
          >
            <Flag className="mr-2 size-5" /> Finalizar
          </Button>
          <Button onClick={() => setAddOpen(true)} className="h-14 flex-1 text-base font-semibold">
            <Plus className="mr-2 size-5" /> Serviço
          </Button>
        </div>
      </div>

      {selectedService && (
        <div
          className="fixed inset-x-0 z-40 mx-auto flex max-w-md items-center gap-2 px-4 pt-[max(env(safe-area-inset-top,0px),0.5rem)]"
          style={{ top: "calc(env(safe-area-inset-top, 0px) + 0.5rem)" }}
        >
          <div className="flex flex-1 items-center justify-between gap-2 rounded-2xl border border-border bg-card p-2 shadow-lg">
            <button
              type="button"
              aria-label="Fechar ações"
              onClick={() => setSelectedService(null)}
              className="flex size-9 items-center justify-center rounded-lg bg-muted text-muted-foreground hover:text-foreground"
            >
              <X className="size-4" />
            </button>
            <span className="min-w-0 flex-1 truncate text-xs font-semibold text-foreground">
              {selectedService.service_type_name}
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setEditTarget(selectedService);
                setSelectedService(null);
              }}
            >
              <Pencil className="mr-1 size-4" /> Editar
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => setDeleteTarget(selectedService)}
            >
              <Trash2 className="mr-1 size-4" /> Excluir
            </Button>
          </div>
        </div>
      )}

      {userId && openShift && (
        <>
          <AddServiceSheet
            open={addOpen}
            onOpenChange={setAddOpen}
            teamId={userId}
            shiftId={openShift.id}
          />
          <AddServiceSheet
            open={editTarget !== null}
            onOpenChange={(v) => {
              if (!v) setEditTarget(null);
            }}
            teamId={userId}
            shiftId={openShift.id}
            editService={editTarget}
            editComplements={editTarget ? (complementRowsByService.get(editTarget.id) ?? []) : []}
          />
          <FinishShiftSheet
            open={finishOpen}
            onOpenChange={setFinishOpen}
            teamId={userId}
            shiftId={openShift.id}
            onClosed={(id) => navigate({ to: "/shift/$id/report", params: { id }, replace: true })}
          />
        </>
      )}

      <AlertDialog
        open={pendingForms !== null}
        onOpenChange={(v) => {
          if (!v) setPendingForms(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Forms pendente de envio</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingForms && pendingForms.length > 1
                ? `Existem ${pendingForms.length} negociações com o Forms ainda não enviado. Deseja enviar a primeira agora ou finalizar assim mesmo?`
                : "Há uma negociação com o Forms ainda não enviado. Deseja enviar agora ou finalizar assim mesmo?"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-2 sm:flex-row">
            <Button
              variant="outline"
              onClick={() => {
                setPendingForms(null);
                setFinishOpen(true);
              }}
            >
              Finalizar mesmo assim
            </Button>
            <Button onClick={() => void sendFirstPending()}>Enviar</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(v) => {
          if (!v) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir serviço?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget
                ? `"${deleteTarget.service_type_name}" será excluído permanentemente do dispositivo e do banco de dados.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-2 sm:flex-row">
            <Button variant="outline" disabled={deleting} onClick={() => setDeleteTarget(null)}>
              Cancelar
            </Button>
            <Button variant="destructive" disabled={deleting} onClick={() => void confirmDelete()}>
              {deleting ? <Loader2 className="size-4 animate-spin" /> : "Excluir"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}

function ShiftMeta({ teamName }: { teamName?: string }) {
  const today = new Date().toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });
  return (
    <div className="flex flex-col items-end leading-tight">
      <span className="text-xs font-semibold uppercase tracking-wide text-primary">
        {teamName ?? "—"}
      </span>
      <span className="text-[10px] text-muted-foreground">{today}</span>
    </div>
  );
}

function Kpi({
  label,
  value,
  tone,
  small,
}: {
  label: string;
  value: string;
  tone?: "success" | "destructive" | "primary";
  small?: boolean;
}) {
  const color =
    tone === "success"
      ? "text-success"
      : tone === "destructive"
        ? "text-destructive"
        : tone === "primary"
          ? "text-primary"
          : "text-foreground";
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={(small ? "text-base" : "text-2xl") + " font-bold " + color}>{value}</p>
    </div>
  );
}

function ServiceRow({
  s,
  complementsByService,
  selected,
  onLongPress,
}: {
  s: LocalService;
  complementsByService: Map<string, string[]>;
  selected?: boolean;
  onLongPress?: (s: LocalService) => void;
}) {
  const formsStatus = useFormsStatus(s.id);
  const isSynced = s.sync_state === "synced";
  const hasLocation = s.lat != null && s.lng != null;

  // Long-press (500 ms) abre a barra de ações (editar/excluir) no topo.
  const pressTimer = useRef<number | null>(null);
  const firedRef = useRef(false);
  const clearPress = () => {
    if (pressTimer.current != null) {
      window.clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  };
  const pressHandlers = onLongPress
    ? {
        onPointerDown: () => {
          firedRef.current = false;
          clearPress();
          pressTimer.current = window.setTimeout(() => {
            firedRef.current = true;
            onLongPress(s);
          }, 500);
        },
        onPointerUp: clearPress,
        onPointerLeave: clearPress,
        onPointerCancel: clearPress,
        onPointerMove: clearPress,
        onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
      }
    : {};

  return (
    <div
      {...pressHandlers}
      className={
        "flex touch-pan-y items-center justify-between rounded-xl border bg-card p-3 select-none transition-colors " +
        (selected ? "border-primary ring-2 ring-primary/40" : "border-border")
      }
    >
      <div className="flex items-center gap-3">
        {s.is_negotiation ? (
          <Banknote className="size-5 text-primary" />
        ) : s.viable ? (
          <CheckCircle2 className="size-5 text-success" />
        ) : (
          <XCircle className="size-5 text-destructive" />
        )}
        <div className="min-w-0">
          <p className="text-sm font-semibold">
            {s.service_type_name}
            {s.is_negotiation && formsStatus && (
              <>
                {" - "}
                {formsStatus === "sent" ? (
                  <span className="text-success">Forms enviado</span>
                ) : (
                  <button
                    type="button"
                    onClick={async (e) => {
                      e.stopPropagation();
                      const payload = getFailedPayload(s.id);
                      if (!payload) {
                        toast.error("Dados do Forms não encontrados neste dispositivo.");
                        return;
                      }
                      const online =
                        typeof navigator === "undefined" ? true : navigator.onLine;
                      if (!online) {
                        toast.warning("Sem conexão — tente novamente quando estiver online.");
                        return;
                      }
                      try {
                        const opened = await submitNegotiationToGoogleForm(payload);
                        if (opened) {
                          setFormsStatus(s.id, "sent");
                          toast.success("Forms aberto para envio manual.");
                        } else {
                          toast.error("Permita pop-ups para abrir o Forms.");
                        }
                      } catch (err) {
                        toast.error(
                          `Falha ao abrir Forms: ${
                            err instanceof Error ? err.message : "erro desconhecido"
                          }`,
                        );
                      }
                    }}
                    className="text-destructive underline underline-offset-2"
                  >
                    Forms não enviado
                  </button>
                )}
              </>
            )}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {s.is_negotiation ? (
              formatBRL(Number(s.negotiated_value) || 0)
            ) : s.viable ? (
              (() => {
                const comps = complementsByService.get(s.id) ?? [];
                const first = comps[0];
                const rest = comps.slice(1);
                if (!first) return null;
                return (
                  <>
                    com {first}
                    {rest.length > 0 && (
                      <>
                        {"  "}
                        <Popover>
                          <PopoverTrigger className="ml-2 text-foreground underline underline-offset-2">
                            ver mais
                          </PopoverTrigger>
                          <PopoverContent align="start" className="w-64">
                            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                              Complementos
                            </p>
                            <ul className="space-y-1 text-sm">
                              {comps.map((c, i) => (
                                <li key={i}>• {c}</li>
                              ))}
                            </ul>
                          </PopoverContent>
                        </Popover>
                      </>
                    )}
                  </>
                );
              })()
            ) : (
              s.reason_name ?? ""
            )}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-1.5">
        <StatusBadge
          ok={isSynced}
          message={
            isSynced
              ? "Registro sincronizado com o servidor."
              : "Aguardando sincronização. Será enviado assim que houver conexão."
          }
        >
          <span className="text-[10px] font-bold leading-none">S</span>
        </StatusBadge>
        <StatusBadge
          ok={hasLocation}
          message={
            hasLocation
              ? "Localização registrada com sucesso."
              : "Sem localização. O GPS estava indisponível ou foi negado."
          }
        >
          <MapPin className="size-3" strokeWidth={2.5} />
        </StatusBadge>
        <span className="ml-1 text-xs font-medium tabular-nums text-muted-foreground">
          {new Date(s.created_at).toLocaleTimeString("pt-BR", {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
      </div>
    </div>
  );
}

function StatusBadge({
  ok,
  message,
  children,
}: {
  ok: boolean;
  message: string;
  children: React.ReactNode;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={message}
          className={
            "inline-flex size-5 items-center justify-center rounded-[5px] text-white transition-transform active:scale-95 " +
            (ok ? "bg-blue-600" : "bg-red-600")
          }
        >
          {children}
        </button>
      </PopoverTrigger>
      <PopoverContent side="top" align="center" className="w-56 p-2 text-xs">
        {message}
      </PopoverContent>
    </Popover>
  );
}