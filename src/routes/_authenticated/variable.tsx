import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuthSession } from "@/hooks/use-auth";
import { useTeam } from "@/hooks/use-team";
import { AppShell } from "@/components/layout/AppShell";
import { ShiftMeta } from "@/components/layout/ShiftMeta";
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
import { Loader2, CalendarIcon } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { isPosCorteName } from "@/lib/service-types";

export const Route = createFileRoute("/_authenticated/variable")({
  head: () => ({ meta: [{ title: "Variável" }] }),
  component: VariablePage,
});

const MONTHS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

function VariablePage() {
  const { userId } = useAuthSession();
  const { data: team } = useTeam(userId);
  const rate = team?.variable_rate ?? 7;

  const neg = useQuery({
    queryKey: ["negotiations", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("servicos")
        .select("negotiated_value,created_at,service_type_name")
        .eq("is_negotiation", true)
        .eq("viable", true)
        .order("created_at", { ascending: false })
        .limit(2000);
      if (error) throw error;
      return data ?? [];
    },
  });

  // "Pós corte" negociado não soma na Variável (R$/negociação) — página
  // inteira é sobre esse cálculo, então exclui de tudo aqui (somas,
  // contagens e histórico), não só do valor final.
  const negRows = useMemo(
    () => (neg.data ?? []).filter((r) => !isPosCorteName(r.service_type_name)),
    [neg.data],
  );

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
    for (const r of negRows) {
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
  }, [negRows]);

  const history = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of negRows) {
      const d = new Date(r.created_at).toLocaleDateString("pt-BR");
      m.set(d, (m.get(d) ?? 0) + (Number(r.negotiated_value) || 0));
    }
    return Array.from(m, ([date, value]) => ({ date, value })).reverse();
  }, [negRows]);

  // Consulta período específico
  const now = new Date();
  const [customMode, setCustomMode] = useState<"day" | "month" | "year">("month");
  const [customDay, setCustomDay] = useState<Date | undefined>(undefined);
  const [customMonth, setCustomMonth] = useState<number>(now.getMonth());
  const [customYear, setCustomYear] = useState<number>(now.getFullYear());

  const years = useMemo(() => {
    const set = new Set<number>();
    for (const r of negRows) set.add(new Date(r.created_at).getFullYear());
    set.add(now.getFullYear());
    return Array.from(set).sort((a, b) => b - a);
  }, [negRows, now]);

  const custom = useMemo(() => {
    let start: Date;
    let end: Date;
    let label: string;
    if (customMode === "day") {
      if (!customDay) return null;
      start = new Date(customDay);
      start.setHours(0, 0, 0, 0);
      end = new Date(start);
      end.setDate(end.getDate() + 1);
      label = start.toLocaleDateString("pt-BR");
    } else if (customMode === "month") {
      start = new Date(customYear, customMonth, 1);
      end = new Date(customYear, customMonth + 1, 1);
      label = `${MONTHS[customMonth]} / ${customYear}`;
    } else {
      start = new Date(customYear, 0, 1);
      end = new Date(customYear + 1, 0, 1);
      label = String(customYear);
    }
    let count = 0;
    let total = 0;
    for (const r of negRows) {
      const t = new Date(r.created_at);
      if (t >= start && t < end) {
        count++;
        total += Number(r.negotiated_value) || 0;
      }
    }
    return { label, count, total };
  }, [customMode, customDay, customMonth, customYear, negRows]);

  return (
    <AppShell title="Variável" right={<ShiftMeta />}>
      {neg.isLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-center text-xs text-muted-foreground">
            Valor estimado. Não reflete o total real.
          </p>

          <div className="grid grid-cols-2 gap-2">
            {(["day", "week", "month", "year"] as const).map((p) => (
              <div key={p} className="rounded-2xl bg-card shadow-md p-4">
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

          <div className="rounded-2xl bg-card shadow-md p-3">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Consultar período específico
            </p>
            <Tabs value={customMode} onValueChange={(v) => setCustomMode(v as typeof customMode)}>
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="day">Dia</TabsTrigger>
                <TabsTrigger value="month">Mês</TabsTrigger>
                <TabsTrigger value="year">Ano</TabsTrigger>
              </TabsList>

              <TabsContent value="day" className="mt-3">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !customDay && "text-muted-foreground",
                      )}
                    >
                      <CalendarIcon className="mr-2 size-4" />
                      {customDay ? customDay.toLocaleDateString("pt-BR") : "Selecionar dia"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={customDay}
                      onSelect={setCustomDay}
                      disabled={(d) => d > new Date()}
                    />
                  </PopoverContent>
                </Popover>
              </TabsContent>

              <TabsContent value="month" className="mt-3">
                <div className="grid grid-cols-2 gap-2">
                  <Select value={String(customMonth)} onValueChange={(v) => setCustomMonth(Number(v))}>
                    <SelectTrigger><SelectValue placeholder="Mês" /></SelectTrigger>
                    <SelectContent>
                      {MONTHS.map((m, i) => (
                        <SelectItem key={m} value={String(i)}>{m}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={String(customYear)} onValueChange={(v) => setCustomYear(Number(v))}>
                    <SelectTrigger><SelectValue placeholder="Ano" /></SelectTrigger>
                    <SelectContent>
                      {years.map((y) => (
                        <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </TabsContent>

              <TabsContent value="year" className="mt-3">
                <Select value={String(customYear)} onValueChange={(v) => setCustomYear(Number(v))}>
                  <SelectTrigger><SelectValue placeholder="Ano" /></SelectTrigger>
                  <SelectContent>
                    {years.map((y) => (
                      <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </TabsContent>
            </Tabs>

            <div className="mt-3 rounded-xl border border-border bg-background p-3">
              {custom ? (
                <>
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    {custom.label}
                  </p>
                  <p className="mt-1 text-xl font-bold text-primary">
                    {formatBRL(custom.count * rate)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {custom.count} negoc. • {formatBRL(custom.total)}
                  </p>
                </>
              ) : (
                <p className="text-xs text-muted-foreground">Selecione uma data.</p>
              )}
            </div>
          </div>

          <div className="rounded-2xl bg-card shadow-md p-3">
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
                    formatter={(v: number) => [formatBRL(v), "Valor"]}
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