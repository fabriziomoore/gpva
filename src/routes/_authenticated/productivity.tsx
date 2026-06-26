import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuthSession } from "@/hooks/use-auth";
import { AppShell } from "@/components/layout/AppShell";
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
} from "recharts";
import { formatDateBR } from "@/lib/format";
import { Loader2, FileText } from "lucide-react";

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

function startOf(period: "day" | "week" | "month" | "year"): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  if (period === "day") return d;
  if (period === "week") {
    const day = d.getDay();
    d.setDate(d.getDate() - day);
    return d;
  }
  if (period === "month") {
    d.setDate(1);
    return d;
  }
  d.setMonth(0, 1);
  return d;
}

function ProdPage() {
  const { userId } = useAuthSession();

  const all = useQuery({
    queryKey: ["all-services", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("services")
        .select("id,service_type_name,is_negotiation,viable,negotiated_value,created_at")
        .order("created_at", { ascending: false })
        .limit(2000);
      if (error) throw error;
      return (data ?? []) as SvcRow[];
    },
  });

  const shifts = useQuery({
    queryKey: ["all-shifts", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shifts")
        .select("id,started_at,status")
        .eq("status", "closed")
        .order("started_at", { ascending: false })
        .limit(60);
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <AppShell title="Produtividade">
      {all.isLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <Tabs defaultValue="day">
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
              {shifts.data?.map((s) => (
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
            </div>
          </div>
        </Tabs>
      )}
    </AppShell>
  );
}

function PeriodView({ rows, period }: { rows: SvcRow[]; period: "day" | "week" | "month" | "year" }) {
  const start = startOf(period);
  const filtered = useMemo(
    () => rows.filter((r) => new Date(r.created_at) >= start),
    [rows, start],
  );
  const total = filtered.length;
  const viaveis = filtered.filter((r) => r.viable).length;
  const inviaveis = total - viaveis;
  const pctV = total ? Math.round((viaveis / total) * 100) : 0;
  const pctI = total ? 100 - pctV : 0;

  const byType = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of filtered) m.set(r.service_type_name, (m.get(r.service_type_name) ?? 0) + 1);
    return Array.from(m, ([name, qty]) => ({ name, qty })).sort((a, b) => b.qty - a.qty);
  }, [filtered]);

  const evolution = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of filtered) {
      const d = new Date(r.created_at).toLocaleDateString("pt-BR");
      m.set(d, (m.get(d) ?? 0) + 1);
    }
    return Array.from(m, ([date, qty]) => ({ date, qty })).reverse();
  }, [filtered]);

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
          <ResponsiveContainer>
            <LineChart data={evolution}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="date" stroke="var(--color-muted-foreground)" fontSize={10} />
              <YAxis stroke="var(--color-muted-foreground)" fontSize={10} />
              <Tooltip
                contentStyle={{
                  background: "var(--color-card)",
                  border: "1px solid var(--color-border)",
                  borderRadius: 8,
                }}
              />
              <Line type="monotone" dataKey="qty" stroke="var(--color-chart-1)" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-3">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Por tipo de serviço
        </p>
        <div className="h-56">
          <ResponsiveContainer>
            <BarChart data={byType}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="name" stroke="var(--color-muted-foreground)" fontSize={10} interval={0} angle={-20} textAnchor="end" height={60} />
              <YAxis stroke="var(--color-muted-foreground)" fontSize={10} />
              <Tooltip
                contentStyle={{
                  background: "var(--color-card)",
                  border: "1px solid var(--color-border)",
                  borderRadius: 8,
                }}
              />
              <Bar dataKey="qty" fill="var(--color-chart-1)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {byType.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl border border-border bg-card p-3">
            <p className="text-xs uppercase text-muted-foreground">Mais executado</p>
            <p className="text-sm font-semibold">{byType[0]?.name}</p>
            <p className="text-xs text-muted-foreground">{byType[0]?.qty} serviços</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-3">
            <p className="text-xs uppercase text-muted-foreground">Menos executado</p>
            <p className="text-sm font-semibold">{byType[byType.length - 1]?.name}</p>
            <p className="text-xs text-muted-foreground">{byType[byType.length - 1]?.qty} serviços</p>
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