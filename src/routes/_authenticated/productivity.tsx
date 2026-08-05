import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuthSession } from "@/hooks/use-auth";
import { AppShell } from "@/components/layout/AppShell";
import { ShiftMeta } from "@/components/layout/ShiftMeta";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
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
import { formatDateBR } from "@/lib/format";
import { Loader2, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/productivity")({
  head: () => ({ meta: [{ title: "Produtividade" }] }),
  component: ProdPage,
});

type SvcRow = {
  id: string;
  service_type_name: string;
  is_negotiation: boolean;
  viable: boolean;
  negotiated_value: number | null;
  created_at: string;
};

type Period = "day" | "week" | "month" | "year";

type QuantityTooltipProps = {
  active?: boolean;
  label?: string;
  payload?: Array<{
    name?: string;
    dataKey?: string;
    color?: string;
    value?: number | string;
    payload?: { name?: string; date?: string; qty?: number };
  }>;
};

const SERVICE_PAGE_SIZE = 1000;

function cleanServiceName(name: string | null | undefined) {
  return name?.trim().replace(/\s+/g, " ") || "Sem tipo";
}

function formatQty(qty: number) {
  return qty.toLocaleString("pt-BR");
}

function serviceCountLabel(qty: number) {
  return `${formatQty(qty)} ${qty === 1 ? "serviço" : "serviços"}`;
}

function QuantityTooltip({ active, payload, label }: QuantityTooltipProps) {
  if (!active || !payload?.length) return null;
  const first = payload[0];
  const title = first.payload?.name ?? first.payload?.date ?? label;

  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-xl">
      {title && <p className="mb-1 font-semibold text-foreground">{title}</p>}
      {payload.map((item, i) => (
        <p key={i} className="font-mono" style={{ color: item.color }}>
          {(item.name ?? "QTD").toUpperCase()}: {formatQty(Number(item.value ?? 0))}
        </p>
      ))}
    </div>
  );
}

function ProdPage() {
  const { userId } = useAuthSession();
  const [historyLimit, setHistoryLimit] = useState(5);
  const queryClient = useQueryClient();

  // Realtime: quando o admin apagar/alterar um expediente ou serviço da equipe
  // (ou o próprio operador em outro dispositivo), invalida as queries do painel
  // para os KPIs refletirem sem precisar reabrir o app.
  useEffect(() => {
    if (!userId) return;
    const channel = supabase.channel(`productivity-${userId}`);
    channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table: "servicos", filter: `team_id=eq.${userId}` },
      () => queryClient.invalidateQueries({ queryKey: ["all-services", userId] }),
    );
    channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table: "expedientes", filter: `team_id=eq.${userId}` },
      () => queryClient.invalidateQueries({ queryKey: ["all-shifts", userId] }),
    );
    channel.subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, queryClient]);

  // Mobile/APK: refetch ao voltar do background (visibilitychange é mais
  // confiável que refetchOnWindowFocus em WebView).
  useEffect(() => {
    if (!userId) return;
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      queryClient.invalidateQueries({ queryKey: ["all-services", userId] });
      queryClient.invalidateQueries({ queryKey: ["all-shifts", userId] });
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [userId, queryClient]);

  const all = useQuery({
    queryKey: ["all-services", userId],
    enabled: !!userId,
    queryFn: async () => {
      const rows: SvcRow[] = [];
      let from = 0;

      while (true) {
        const { data, error } = await supabase
          .from("servicos")
          .select("id,service_type_name,is_negotiation,viable,negotiated_value,created_at")
          .order("created_at", { ascending: false })
          .range(from, from + SERVICE_PAGE_SIZE - 1);
        if (error) throw error;

        rows.push(...((data ?? []) as SvcRow[]));
        if (!data || data.length < SERVICE_PAGE_SIZE) break;
        from += SERVICE_PAGE_SIZE;
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
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <AppShell title="Produtividade" right={<ShiftMeta />}>
      {all.isLoading ? (
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
              <PeriodView rows={all.data ?? []} period={p} />
            </TabsContent>
          ))}

          <div className="mt-8">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Histórico
            </h2>
            <div className="space-y-2">
              {shifts.data?.length === 0 && (
                <p className="text-sm text-muted-foreground">Sem expedientes anteriores.</p>
              )}
              {shifts.data?.slice(0, historyLimit).map((s) => (
                <Link
                  key={s.id}
                  to="/shift/$id/report"
                  params={{ id: s.id }}
                  className="flex items-center justify-between rounded-xl border border-border bg-card p-3 hover:bg-accent"
                >
                  <div className="flex items-center gap-3">
                    <FileText className="size-4 text-primary" />
                    <span className="text-sm font-medium">{formatDateBR(s.started_at)}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">→</span>
                </Link>
              ))}
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

function PeriodView({ rows, period }: { rows: SvcRow[]; period: Period }) {
  const startTime = useMemo(() => startOf(period).getTime(), [period]);
  const filtered = useMemo(
    () => rows.filter((r) => new Date(r.created_at).getTime() >= startTime),
    [rows, startTime],
  );
  const viableRows = useMemo(() => filtered.filter((r) => r.viable), [filtered]);
  const total = filtered.length;
  const viaveis = viableRows.length;
  const inviaveis = total - viaveis;
  const pctV = total ? Math.round((viaveis / total) * 100) : 0;
  const pctI = total ? 100 - pctV : 0;

  const byType = useMemo(() => {
    const m = new Map<string, { name: string; qty: number }>();
    for (const r of viableRows) {
      const name = cleanServiceName(r.service_type_name);
      const key = name.toLocaleLowerCase("pt-BR");
      const current = m.get(key);
      if (current) current.qty += 1;
      else m.set(key, { name, qty: 1 });
    }
    return Array.from(m.values()).sort((a, b) => b.qty - a.qty || a.name.localeCompare(b.name));
  }, [viableRows]);

  const evolution = useMemo(() => {
    const m = new Map<string, { date: string; viaveis: number; inviaveis: number; sort: number }>();
    for (const r of filtered) {
      const d = new Date(r.created_at);
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
      const current = m.get(key) ?? { date: label, viaveis: 0, inviaveis: 0, sort };
      if (r.viable) current.viaveis += 1;
      else current.inviaveis += 1;
      m.set(key, current);
    }
    return Array.from(m.values())
      .sort((a, b) => a.sort - b.sort)
      .map(({ date, viaveis, inviaveis }) => ({ date, viaveis, inviaveis }));
  }, [period, filtered]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2">
        <Card label="Total" value={String(total)} />
        <Card label="Viáveis" value={`${viaveis} (${pctV}%)`} tone="success" />
        <Card label="Inviáveis" value={`${inviaveis} (${pctI}%)`} tone="destructive" />
      </div>

      <div className="rounded-2xl border border-border bg-card p-3">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Evolução
        </p>
        <div className="h-48">
          {evolution.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              Sem serviços no período.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={evolution}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="date" stroke="var(--color-muted-foreground)" fontSize={10} />
                <YAxis stroke="var(--color-muted-foreground)" fontSize={10} allowDecimals={false} />
                <Tooltip content={<QuantityTooltip />} />
                <Legend wrapperStyle={{ fontSize: 10 }} iconType="line" />
                <Line
                  name="Viáveis"
                  type="monotone"
                  dataKey="viaveis"
                  stroke="var(--color-success)"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  activeDot={{ r: 5 }}
                />
                <Line
                  name="Inviáveis"
                  type="monotone"
                  dataKey="inviaveis"
                  stroke="var(--color-destructive)"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-3">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Por tipo de serviço
        </p>
        <div className="h-56">
          {byType.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              Sem serviços viáveis no período.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byType}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="name" stroke="var(--color-muted-foreground)" fontSize={10} interval={0} angle={-20} textAnchor="end" height={60} />
                <YAxis stroke="var(--color-muted-foreground)" fontSize={10} allowDecimals={false} />
                <Tooltip content={<QuantityTooltip />} />
                <Bar dataKey="qty" fill="var(--color-chart-1)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {byType.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl border border-border bg-card p-3">
            <p className="text-xs uppercase text-muted-foreground">Mais executado</p>
            <p className="text-sm font-semibold">{byType[0]?.name}</p>
            <p className="text-xs text-muted-foreground">{serviceCountLabel(byType[0]?.qty ?? 0)}</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-3">
            <p className="text-xs uppercase text-muted-foreground">Menos executado</p>
            <p className="text-sm font-semibold">{byType[byType.length - 1]?.name}</p>
            <p className="text-xs text-muted-foreground">{serviceCountLabel(byType[byType.length - 1]?.qty ?? 0)}</p>
          </div>
        </div>
      )}
    </div>
  );
}

function Card({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "success" | "destructive";
}) {
  const c =
    tone === "success" ? "text-success" : tone === "destructive" ? "text-destructive" : "text-foreground";
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={"text-base font-bold " + c}>{value}</p>
    </div>
  );
}