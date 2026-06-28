import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuthSession } from "@/hooks/use-auth";
import { useTeam } from "@/hooks/use-team";
import { AppShell } from "@/components/layout/AppShell";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { formatBRL } from "@/lib/format";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/variable")({
  head: () => ({ meta: [{ title: "Variável" }] }),
  component: VariablePage,
});

function VariablePage() {
  const { userId } = useAuthSession();
  const { data: team } = useTeam(userId);
  const rate = team?.variable_rate ?? 7;

  const neg = useQuery({
    queryKey: ["negotiations", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("services")
        .select("negotiated_value,created_at")
        .eq("is_negotiation", true)
        .eq("viable", true)
        .order("created_at", { ascending: false })
        .limit(2000);
      if (error) throw error;
      return data ?? [];
    },
  });

  const sums = useMemo(() => {
    const now = new Date();
    const days = (n: number) => {
      const d = new Date(now);
      d.setDate(d.getDate() - n);
      return d;
    };
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);
    const weekStart = new Date(startOfDay);
    weekStart.setDate(weekStart.getDate() - now.getDay());
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const yearStart = new Date(now.getFullYear(), 0, 1);

    const buckets = { day: 0, week: 0, month: 0, year: 0, all: 0 };
    const counts = { day: 0, week: 0, month: 0, year: 0, all: 0 };
    for (const r of neg.data ?? []) {
      const t = new Date(r.created_at);
      const v = Number(r.negotiated_value) || 0;
      buckets.all += v;
      counts.all++;
      if (t >= startOfDay) {
        buckets.day += v;
        counts.day++;
      }
      if (t >= weekStart) {
        buckets.week += v;
        counts.week++;
      }
      if (t >= monthStart) {
        buckets.month += v;
        counts.month++;
      }
      if (t >= yearStart) {
        buckets.year += v;
        counts.year++;
      }
    }
    void days;
    return { buckets, counts };
  }, [neg.data]);

  const history = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of neg.data ?? []) {
      const d = new Date(r.created_at).toLocaleDateString("pt-BR");
      m.set(d, (m.get(d) ?? 0) + (Number(r.negotiated_value) || 0));
    }
    return Array.from(m, ([date, value]) => ({ date, value })).reverse();
  }, [neg.data]);

  return (
    <AppShell title="Variável">
      {neg.isLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Valor por negociação: <span className="font-semibold text-foreground">{formatBRL(rate)}</span>
          </p>

          <div className="grid grid-cols-2 gap-2">
            {(["day", "week", "month", "year"] as const).map((p) => (
              <div key={p} className="rounded-2xl border border-border bg-card p-4">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  {p === "day" ? "Hoje" : p === "week" ? "Semana" : p === "month" ? "Mês" : "Ano"}
                </p>
                <p className="mt-1 text-xl font-bold text-primary">
                  {formatBRL(sums.counts[p] * rate)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {sums.counts[p]} negoc. • {formatBRL(sums.buckets[p])}
                </p>
              </div>
            ))}
          </div>

          <div className="rounded-2xl border border-border bg-card p-3">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Histórico financeiro
            </p>
            <div className="h-56">
              <ResponsiveContainer>
                <LineChart data={history}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis dataKey="date" stroke="var(--color-muted-foreground)" fontSize={10} />
                  <YAxis stroke="var(--color-muted-foreground)" fontSize={10} />
                  <Tooltip
                    contentStyle={{
                      background: "var(--color-card)",
                      border: "1px solid var(--color-border)",
                      borderRadius: 8,
                    }}
                    formatter={(v: number) => formatBRL(v)}
                  />
                  <Line type="monotone" dataKey="value" stroke="var(--color-chart-1)" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}