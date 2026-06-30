import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useAuthSession } from "@/hooks/use-auth";
import { useTeam } from "@/hooks/use-team";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Plus, Flag, CheckCircle2, XCircle, Banknote, Loader2 } from "lucide-react";
import { AddServiceSheet } from "@/components/shift/AddServiceSheet";
import { FinishShiftSheet } from "@/components/shift/FinishShiftSheet";
import { formatBRL } from "@/lib/format";
import { useLiveQuery } from "dexie-react-hooks";
import { getLocalDB } from "@/lib/db/local-db";

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

  const openShift = useLiveQuery(async () => {
    if (!userId) return null;
    const db = getLocalDB();
    const rows = await db.shifts.where("status").equals("open").toArray();
    rows.sort((a, b) => (b.started_at > a.started_at ? 1 : -1));
    return rows[0] ?? null;
  }, [userId]);

  const services = useLiveQuery(async () => {
    if (!openShift?.id) return [];
    const db = getLocalDB();
    const rows = await db.services.where("shift_id").equals(openShift.id).toArray();
    rows.sort((a, b) => (b.created_at > a.created_at ? 1 : -1));
    return rows;
  }, [openShift?.id]);

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
            <div
              key={s.id}
              className="flex items-center justify-between rounded-xl border border-border bg-card p-3"
            >
              <div className="flex items-center gap-3">
                {s.is_negotiation ? (
                  <Banknote className="size-5 text-primary" />
                ) : s.viable ? (
                  <CheckCircle2 className="size-5 text-success" />
                ) : (
                  <XCircle className="size-5 text-destructive" />
                )}
                <div>
                  <p className="text-sm font-semibold">{s.service_type_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {s.is_negotiation
                      ? formatBRL(Number(s.negotiated_value) || 0)
                      : s.viable
                        ? "Viável"
                        : `${s.registration_number ?? "-"} • ${s.reason_name ?? ""}`}
                  </p>
                </div>
              </div>
              <span className="text-xs font-medium tabular-nums text-muted-foreground">
                {new Date(s.created_at).toLocaleTimeString("pt-BR", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </div>
          ))}
        </div>

        <div className="fixed inset-x-0 z-30 mx-auto flex max-w-md justify-between gap-2 px-4 bottom-[calc(env(safe-area-inset-bottom)+5rem)]">
          <Button
            onClick={() => setFinishOpen(true)}
            className="h-14 flex-1 border-0 bg-destructive text-base font-semibold text-destructive-foreground hover:bg-destructive/90"
          >
            <Flag className="mr-2 size-5" /> Finalizar
          </Button>
          <Button onClick={() => setAddOpen(true)} className="h-14 flex-1 text-base font-semibold">
            <Plus className="mr-2 size-5" /> Serviço
          </Button>
        </div>
      </div>

      {userId && openShift && (
        <>
          <AddServiceSheet
            open={addOpen}
            onOpenChange={setAddOpen}
            teamId={userId}
            shiftId={openShift.id}
          />
          <FinishShiftSheet
            open={finishOpen}
            onOpenChange={setFinishOpen}
            teamId={userId}
            shiftId={openShift.id}
            onClosed={(id) => navigate({ to: "/shift/$id/report", params: { id } })}
          />
        </>
      )}
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