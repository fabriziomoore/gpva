import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuthSession } from "@/hooks/use-auth";
import { useTeam } from "@/hooks/use-team";
import { AppShell } from "@/components/layout/AppShell";
import { ShiftMeta } from "@/components/layout/ShiftMeta";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  LineChart,
  Line,
  CartesianGrid,
  Legend,
} from "recharts";
import { formatBRL, formatDateBR } from "@/lib/format";
import {
  Loader2,
  FileText,
  TrendingUp,
  TrendingDown,
  Minus,
  Copy,
  Share2,
} from "lucide-react";
import { toast } from "sonner";
import {
  type Period,
  periodRange,
  previousRange,
  inRange,
  deltaPct,
  paceProjection,
  previousLabel,
  projectionLabel,
} from "@/lib/analytics";
import { buildPeriodReport } from "@/lib/report";

export const Route = createFileRoute("/_authenticated/productivity")({
  head: () => ({ meta: [{ title: "Produtividade" }] }),
  component: ProdPage,
});

type SvcRow = {
  id: string;
  shift_id: string;
  service_type_name: string;
  is_negotiation: boolean;
  viable: boolean;
  reason_name: string | null;
  negotiated_value: number | null;
  created_at: string;
};

type ShiftRow = { id: string; started_at: string };
type ImpactRow = { shift_id: string; impact_name: string };
type CompRow = { shift_id: string; complement_name: string };

const PAGE = 1000;

function cleanName(name: string | null | undefined) {
  return name?.trim().replace(/\s+/g, " ") || "Sem tipo";
}
function fmtQty(q: number) {
  return q.toLocaleString("pt-BR");
}

function ProdPage() {
  const { userId } = useAuthSession();
  const { data: team } = useTeam(userId);
  const [historyLimit, setHistoryLimit] = useState(5);

  const services = useQuery({
    queryKey: ["all-services", userId],
    enabled: !!userId,
    queryFn: async () => {
      const rows: SvcRow[] = [];
      let from = 0;
      while (true) {
        const { data, error } = await supabase
          .from("servicos")
          .select(
            "id,shift_id,service_type_name,is_negotiation,viable,reason_name,negotiated_value,created_at",
          )
          .order("created_at", { ascending: false })
          .range(from, from + PAGE - 1);
        if (error) throw error;
        rows.push(...((data ?? []) as SvcRow[]));
        if (!data || data.length < PAGE) break;
        from += PAGE;
      }
      return rows;
    },
  });

  const shifts = useQuery({
    queryKey: ["all-shifts", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expedientes")
        .select("id,started_at,status")
        .eq("status", "closed")
        .order("started_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as (ShiftRow & { status: string })[];
    },
  });

  const impacts = useQuery({
    queryKey: ["all-impacts", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("impactos_expediente")
        .select("shift_id,impact_name")
        .limit(5000);
      if (error) throw error;
      return (data ?? []) as ImpactRow[];
    },
  });

  const complements = useQuery({
    queryKey: ["all-complements", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vinculos_complementos")
        .select("shift_id,complement_name")
        .limit(10000);
      if (error) throw error;
      return (data ?? []) as CompRow[];
    },
  });

  const loading = services.isLoading || shifts.isLoading;

  return (
    <AppShell title="Produtividade" right={<ShiftMeta />}>
      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <Tabs defaultValue="month">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="day">Dia</TabsTrigger>
            <TabsTrigger value="week">Semana</TabsTrigger>
            <TabsTrigger value="month">Mês</TabsTrigger>
            <TabsTrigger value="year">Ano</TabsTrigger>
          </TabsList>
          {(["day", "week", "month", "year"] as const).map((p) => (
            <TabsContent key={p} value={p} className="mt-4">
              <PeriodView
                period={p}
                services={services.data ?? []}
                shifts={shifts.data ?? []}
                impacts={impacts.data ?? []}
                complements={complements.data ?? []}
                team={{
                  team_name: team?.team_name ?? "—",
                  leader: team?.leader ?? "-",
                  supervisor: team?.supervisor ?? "-",
                  rate: team?.variable_rate ?? 7,
                }}
              />
            </TabsContent>
          ))}

          <div className="mt-8">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Histórico de expedientes
            </h2>
            <div className="space-y-2">
              {shifts.data?.length === 0 && (
                <p className="text-sm text-muted-foreground">Sem expedientes anteriores.</p>
              )}
              {shifts.data?.slice(0, historyLimit).map((s) => {
                const svc = (services.data ?? []).filter((x) => x.shift_id === s.id);
                const viable = svc.filter((x) => x.viable).length;
                const total = svc.length;
                const neg = svc
                  .filter((x) => x.is_negotiation && x.viable)
                  .reduce((a, b) => a + (Number(b.negotiated_value) || 0), 0);
                return (
                  <Link
                    key={s.id}
                    to="/shift/$id/report"
                    params={{ id: s.id }}
                    className="flex items-center justify-between rounded-xl border border-border bg-card p-3 hover:bg-accent"
                  >
                    <div className="flex items-center gap-3">
                      <FileText className="size-4 text-primary" />
                      <div>
                        <p className="text-sm font-medium">{formatDateBR(s.started_at)}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {total} serv. • {viable} viáv. • {formatBRL(neg)}
                        </p>
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground">→</span>
                  </Link>
                );
              })}
              {(shifts.data?.length ?? 0) > historyLimit && (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => setHistoryLimit((n) => n + 5)}
                >
                  Ver mais
                </Button>
              )}
            </div>
          </div>
        </Tabs>
      )}
    </AppShell>
  );
}

type TeamMeta = { team_name: string; leader: string; supervisor: string; rate: number };

function PeriodView({
  period,
  services,
  shifts,
  impacts,
  complements,
  team,
}: {
  period: Period;
  services: SvcRow[];
  shifts: ShiftRow[];
  impacts: ImpactRow[];
  complements: CompRow[];
  team: TeamMeta;
}) {
  const stats = useMemo(() => {
    const cur = periodRange(period);
    const prev = previousRange(period);

    const curSvc = services.filter((s) => inRange(s.created_at, cur));
    const prevSvc = services.filter((s) => inRange(s.created_at, prev));
    const curShifts = shifts.filter((s) => inRange(s.started_at, cur));
    const curShiftIds = new Set(curShifts.map((s) => s.id));
    const curImpacts = impacts.filter((i) => curShiftIds.has(i.shift_id));
    const curComps = complements.filter((c) => curShiftIds.has(c.shift_id));

    const agg = (rows: SvcRow[]) => {
      const viable = rows.filter((r) => r.viable);
      const neg = viable.filter((r) => r.is_negotiation);
      return {
        total: rows.length,
        viable: viable.length,
        unviable: rows.length - viable.length,
        negotiations: neg.length,
        negotiated_value: neg.reduce((a, b) => a + (Number(b.negotiated_value) || 0), 0),
      };
    };

    const current = { ...agg(curSvc), shifts: curShifts.length };
    const previous = agg(prevSvc);

    const projected = {
      total: paceProjection(current.total, period),
      negotiated_value: paceProjection(current.negotiated_value, period),
    };

    const variable = current.negotiations * team.rate;

    const bucket = <T,>(arr: T[], keyFn: (x: T) => string) => {
      const m = new Map<string, { name: string; qty: number }>();
      for (const x of arr) {
        const name = cleanName(keyFn(x));
        const k = name.toLocaleLowerCase("pt-BR");
        const c = m.get(k);
        if (c) c.qty += 1;
        else m.set(k, { name, qty: 1 });
      }
      return Array.from(m.values()).sort((a, b) => b.qty - a.qty || a.name.localeCompare(b.name));
    };

    const byType = bucket(
      curSvc.filter((s) => s.viable),
      (s) => s.service_type_name,
    );
    const topReasons = bucket(
      curSvc.filter((s) => !s.viable && s.reason_name),
      (s) => s.reason_name!,
    );
    const topImpacts = bucket(curImpacts, (i) => i.impact_name);
    const topComps = bucket(curComps, (c) => c.complement_name);

    // Best day
    const perDay = new Map<string, number>();
    for (const s of curSvc.filter((x) => x.viable)) {
      const d = new Date(s.created_at);
      const k = d.toISOString().slice(0, 10);
      perDay.set(k, (perDay.get(k) ?? 0) + 1);
    }
    let bestDay: { date: string; qty: number } | null = null;
    for (const [k, qty] of perDay) {
      if (!bestDay || qty > bestDay.qty) {
        bestDay = { date: formatDateBR(k), qty };
      }
    }

    // Evolution (viable count over time)
    const evoMap = new Map<string, { date: string; qty: number; sort: number }>();
    for (const s of curSvc.filter((x) => x.viable)) {
      const d = new Date(s.created_at);
      const key =
        period === "day"
          ? String(d.getHours()).padStart(2, "0")
          : period === "year"
            ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
            : d.toISOString().slice(0, 10);
      const label =
        period === "day"
          ? `${String(d.getHours()).padStart(2, "0")}h`
          : period === "year"
            ? d.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "")
            : d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
      const sort =
        period === "day"
          ? d.getHours()
          : period === "year"
            ? new Date(d.getFullYear(), d.getMonth(), 1).getTime()
            : new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
      const c = evoMap.get(key);
      if (c) c.qty += 1;
      else evoMap.set(key, { date: label, qty: 1, sort });
    }
    const evolution = Array.from(evoMap.values())
      .sort((a, b) => a.sort - b.sort)
      .map(({ date, qty }) => ({ date, qty }));

    const compareBars = [
      { name: "Total", atual: current.total, anterior: previous.total },
      { name: "Viáveis", atual: current.viable, anterior: previous.viable },
      { name: "Inviáveis", atual: current.unviable, anterior: previous.unviable },
      { name: "Negoc.", atual: current.negotiations, anterior: previous.negotiations },
    ];

    const pctV = current.total ? Math.round((current.viable / current.total) * 100) : 0;
    const pctVPrev = previous.total ? Math.round((previous.viable / previous.total) * 100) : 0;
    const avgPerShift = current.shifts ? +(current.total / current.shifts).toFixed(1) : 0;

    return {
      current,
      previous,
      projected,
      variable,
      byType,
      topReasons,
      topImpacts,
      topComps,
      bestDay,
      evolution,
      compareBars,
      pctV,
      pctVPrev,
      avgPerShift,
    };
  }, [period, services, shifts, impacts, complements, team.rate]);

  const share = async () => {
    const text = buildPeriodReport({
      period,
      team_name: team.team_name,
      leader: team.leader,
      supervisor: team.supervisor,
      current: stats.current,
      previous: stats.previous,
      projected: stats.projected,
      variable_estimated: stats.variable,
      by_type: stats.byType,
      top_reasons: stats.topReasons,
      top_impacts: stats.topImpacts,
      top_complements: stats.topComps,
      best_day: stats.bestDay,
    });
    return text;
  };

  return (
    <div className="space-y-4">
      {/* Export actions */}
      <div className="grid grid-cols-2 gap-2">
        <Button
          className="h-11 text-sm font-semibold"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(await share());
              toast.success("Resumo copiado");
            } catch {
              toast.error("Não foi possível copiar");
            }
          }}
        >
          <Copy className="mr-2 size-4" /> Copiar resumo
        </Button>
        <Button
          variant="outline"
          className="h-11 text-sm font-semibold"
          onClick={async () => {
            const text = await share();
            window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
          }}
        >
          <Share2 className="mr-2 size-4" /> WhatsApp
        </Button>
      </div>

      {/* KPI grid with deltas */}
      <div className="grid grid-cols-2 gap-2">
        <KpiCard
          label="Total"
          value={fmtQty(stats.current.total)}
          delta={deltaPct(stats.current.total, stats.previous.total)}
          hint={`vs ${previousLabel(period)}: ${stats.previous.total}`}
        />
        <KpiCard
          label="Viabilidade"
          value={`${stats.pctV}%`}
          delta={deltaPct(stats.pctV, stats.pctVPrev)}
          hint={`${stats.current.viable} viáv. / ${stats.current.unviable} inviáv.`}
          tone="success"
        />
        <KpiCard
          label="Negociado"
          value={formatBRL(stats.current.negotiated_value)}
          delta={deltaPct(stats.current.negotiated_value, stats.previous.negotiated_value)}
          hint={`${stats.current.negotiations} negociações`}
          small
        />
        <KpiCard
          label="Variável est."
          value={formatBRL(stats.variable)}
          hint={`${stats.current.negotiations} × ${formatBRL(team.rate)}`}
          tone="primary"
          small
        />
        <KpiCard
          label="Expedientes"
          value={String(stats.current.shifts)}
          hint="fechados no período"
          small
        />
        <KpiCard
          label="Média/expediente"
          value={String(stats.avgPerShift)}
          hint="serviços por dia trabalhado"
          small
        />
      </div>

      {/* Projection */}
      {period !== "day" && (
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
            {projectionLabel(period)}
          </p>
          <div className="mt-2 grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-muted-foreground">Serviços</p>
              <p className="text-2xl font-bold text-primary">{stats.projected.total}</p>
              <ProjectionDelta projected={stats.projected.total} previous={stats.previous.total} />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Negociado</p>
              <p className="text-2xl font-bold text-primary">
                {formatBRL(stats.projected.negotiated_value)}
              </p>
              <ProjectionDelta
                projected={stats.projected.negotiated_value}
                previous={stats.previous.negotiated_value}
                currency
              />
            </div>
          </div>
          <p className="mt-2 text-[10px] text-muted-foreground">
            Baseado no ritmo atual. Não é meta oficial.
          </p>
        </div>
      )}

      {/* Atual vs Anterior */}
      <div className="rounded-2xl border border-border bg-card p-3">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Atual vs {previousLabel(period)}
        </p>
        <div className="h-52">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={stats.compareBars}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="name" stroke="var(--color-muted-foreground)" fontSize={10} />
              <YAxis stroke="var(--color-muted-foreground)" fontSize={10} allowDecimals={false} />
              <Tooltip
                contentStyle={{
                  background: "var(--color-card)",
                  border: "1px solid var(--color-border)",
                  borderRadius: 8,
                  fontSize: 12,
                }}
              />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Bar dataKey="anterior" fill="var(--color-muted-foreground)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="atual" fill="var(--color-chart-1)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Evolution */}
      <div className="rounded-2xl border border-border bg-card p-3">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Evolução (viáveis)
        </p>
        <div className="h-44">
          {stats.evolution.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              Sem serviços viáveis no período.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={stats.evolution}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="date" stroke="var(--color-muted-foreground)" fontSize={10} />
                <YAxis stroke="var(--color-muted-foreground)" fontSize={10} allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    background: "var(--color-card)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="qty"
                  stroke="var(--color-chart-1)"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Rankings */}
      <RankList title="Top serviços (viáveis)" items={stats.byType} empty="Sem serviços viáveis." />
      <RankList
        title="Top motivos de inviabilidade"
        items={stats.topReasons}
        empty="Nenhum inviável no período."
      />
      <RankList
        title="Complementos mais usados"
        items={stats.topComps}
        empty="Nenhum complemento registrado."
      />
      <RankList
        title="Impactos recorrentes"
        items={stats.topImpacts}
        empty="Nenhum impacto registrado."
      />

      {stats.bestDay && (
        <div className="rounded-xl border border-border bg-card p-3">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Melhor dia do período
          </p>
          <p className="text-sm font-semibold">
            {stats.bestDay.date} — {stats.bestDay.qty} viáveis
          </p>
        </div>
      )}
    </div>
  );
}

function ProjectionDelta({
  projected,
  previous,
  currency,
}: {
  projected: number;
  previous: number;
  currency?: boolean;
}) {
  const diff = projected - previous;
  const pct = deltaPct(projected, previous);
  const tone = diff > 0 ? "text-success" : diff < 0 ? "text-destructive" : "text-muted-foreground";
  const Icon = diff > 0 ? TrendingUp : diff < 0 ? TrendingDown : Minus;
  const sign = diff > 0 ? "+" : "";
  return (
    <p className={`mt-1 flex items-center gap-1 text-[11px] ${tone}`}>
      <Icon className="size-3" />
      {sign}
      {currency ? formatBRL(diff) : diff}
      {pct !== null && <span className="opacity-70"> ({sign}{pct}%)</span>}
    </p>
  );
}

function KpiCard({
  label,
  value,
  delta,
  hint,
  tone,
  small,
}: {
  label: string;
  value: string;
  delta?: number | null;
  hint?: string;
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
  const dTone =
    delta === null || delta === undefined
      ? "text-muted-foreground"
      : delta > 0
        ? "text-success"
        : delta < 0
          ? "text-destructive"
          : "text-muted-foreground";
  const Icon =
    delta === null || delta === undefined
      ? Minus
      : delta > 0
        ? TrendingUp
        : delta < 0
          ? TrendingDown
          : Minus;
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={(small ? "text-base" : "text-xl") + " font-bold " + color}>{value}</p>
      {delta !== undefined && delta !== null && (
        <p className={`mt-0.5 flex items-center gap-1 text-[10px] ${dTone}`}>
          <Icon className="size-3" />
          {delta > 0 ? "+" : ""}
          {delta}%
        </p>
      )}
      {hint && <p className="mt-0.5 text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function RankList({
  title,
  items,
  empty,
}: {
  title: string;
  items: { name: string; qty: number }[];
  empty: string;
}) {
  const top = items.slice(0, 5);
  const max = top[0]?.qty ?? 1;
  return (
    <div className="rounded-2xl border border-border bg-card p-3">
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      {top.length === 0 ? (
        <p className="py-4 text-center text-xs text-muted-foreground">{empty}</p>
      ) : (
        <ul className="space-y-1.5">
          {top.map((t) => (
            <li key={t.name} className="space-y-1">
              <div className="flex items-baseline justify-between text-xs">
                <span className="truncate pr-2 font-medium">{t.name}</span>
                <span className="tabular-nums text-muted-foreground">{fmtQty(t.qty)}</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${Math.max(6, (t.qty / max) * 100)}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}