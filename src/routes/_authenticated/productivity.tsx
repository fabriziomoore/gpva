import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuthSession } from "@/hooks/use-auth";
import { useTeam } from "@/hooks/use-team";
import { generateFakeServiceRows, generateFakeShiftHistory } from "@/lib/demo-fake-data";
import { AppShell } from "@/components/layout/AppShell";
import { ShiftMeta } from "@/components/layout/ShiftMeta";
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
import { Loader2, FileText, ChevronDown, CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { isPosCorteName } from "@/lib/service-types";

export const Route = createFileRoute("/_authenticated/productivity")({
  head: () => ({ meta: [{ title: "Produtividade" }] }),
  component: ProdPage,
});

const MONTHS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

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
    <div className="rounded-lg bg-card px-3 py-2 text-xs shadow-xl">
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
  const { data: team } = useTeam(userId);
  // Setor sem variável ativada não vê a aba "Variável" — mesmo padrão de
  // esconder aba usado em Consulta (canNegotiate) pra equipes sem
  // negociação habilitada.
  const canVariable = team ? team.setor_variavel_ativo !== false : true;
  const [tab, setTab] = useState<"productivity" | "variable">("productivity");

  useEffect(() => {
    if (!canVariable && tab === "variable") setTab("productivity");
  }, [canVariable, tab]);

  return (
    <AppShell title="Produtividade" right={<ShiftMeta />}>
      {canVariable && (
        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)} className="mb-4">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="productivity">Produtividade</TabsTrigger>
            <TabsTrigger value="variable">Variável</TabsTrigger>
          </TabsList>
        </Tabs>
      )}
      {tab === "variable" && canVariable ? <VariableTab /> : <ProductivityTab />}
    </AppShell>
  );
}

function ProductivityTab() {
  const { userId } = useAuthSession();
  const { data: team } = useTeam(userId);
  const isTest = !!team?.is_test;
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

  // Contas de teste mostram um histórico fictício, gerado só no navegador,
  // pra apresentação — nunca lido nem escrito no banco, então não tem como
  // aparecer em painéis de líder, admin ou de outra equipe.
  const fakeRows = useMemo(() => (isTest && userId ? generateFakeServiceRows(userId) : null), [isTest, userId]);
  const fakeShifts = useMemo(() => (isTest && userId ? generateFakeShiftHistory(userId) : null), [isTest, userId]);
  const rows = fakeRows ?? all.data ?? [];
  const shiftHistory = fakeShifts ?? shifts.data ?? [];

  return all.isLoading && !isTest ? (
    <div className="flex justify-center py-20">
      <Loader2 className="size-6 animate-spin text-muted-foreground" />
    </div>
  ) : (
    <>
      <PeriodSelector rows={rows} />

      <div className="mt-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Histórico
        </h2>
        <div className="space-y-2">
          {shiftHistory.length === 0 && (
            <p className="text-sm text-muted-foreground">Sem expedientes anteriores.</p>
          )}
          {shiftHistory.slice(0, historyLimit).map((s) =>
            isTest ? (
              <div
                key={s.id}
                className="flex items-center justify-between rounded-xl bg-card shadow-md p-3"
              >
                <div className="flex items-center gap-3">
                  <FileText className="size-4 text-primary" />
                  <span className="text-sm font-medium">{formatDateBR(s.started_at)}</span>
                </div>
              </div>
            ) : (
              <Link
                key={s.id}
                to="/shift/$id/report"
                params={{ id: s.id }}
                className="flex items-center justify-between rounded-xl bg-card shadow-md p-3"
              >
                <div className="flex items-center gap-3">
                  <FileText className="size-4 text-primary" />
                  <span className="text-sm font-medium">{formatDateBR(s.started_at)}</span>
                </div>
                <span className="text-xs text-muted-foreground">→</span>
              </Link>
            ),
          )}
          {shiftHistory.length > historyLimit && (
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
    </>
  );
}

function PeriodSelector({ rows }: { rows: SvcRow[] }) {
  const [mode, setMode] = useState<Period>("month");
  const now = useMemo(() => new Date(), []);
  const [year, setYear] = useState<number>(now.getFullYear());
  const [month, setMonth] = useState<number>(now.getMonth() + 1);
  const [day, setDay] = useState<number>(now.getDate());

  const monthNames = MONTHS;
  const years = useMemo(() => {
    const arr: number[] = [];
    for (let y = now.getFullYear(); y >= now.getFullYear() - 4; y--) arr.push(y);
    return arr;
  }, [now]);

  const daysInMonth = new Date(year, month, 0).getDate();
  const daysArr = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  const weeks = useMemo(() => {
    const y = year;
    const m = month - 1;
    const first = new Date(y, m, 1);
    const dow = (first.getDay() + 6) % 7; // 0 = seg
    const start = new Date(y, m, 1 - dow);
    const list: { start: Date; end: Date; label: string }[] = [];
    const cur = new Date(start);
    for (let i = 0; i < 6; i++) {
      const s = new Date(cur);
      const e = new Date(cur);
      e.setDate(e.getDate() + 6);
      if (s.getMonth() === m || e.getMonth() === m) {
        const pad = (n: number) => n.toString().padStart(2, "0");
        // Só repete o mês nos dois lados quando a semana cruza a virada do
        // mês — dentro do mesmo mês, o dia sozinho já é suficiente e ocupa
        // bem menos espaço no campo.
        const startLabel =
          s.getMonth() === e.getMonth() ? pad(s.getDate()) : `${pad(s.getDate())}/${pad(s.getMonth() + 1)}`;
        list.push({
          start: s,
          end: e,
          label: `${startLabel} – ${pad(e.getDate())}/${pad(e.getMonth() + 1)}`,
        });
      }
      cur.setDate(cur.getDate() + 7);
    }
    return list;
  }, [year, month]);

  const [weekIdx, setWeekIdx] = useState<number>(0);
  useEffect(() => {
    const idx = weeks.findIndex(
      (w) => now >= w.start && now <= new Date(w.end.getFullYear(), w.end.getMonth(), w.end.getDate(), 23, 59, 59),
    );
    setWeekIdx(idx >= 0 ? idx : 0);
  }, [weeks, now]);

  const customRange = useMemo(() => {
    if (mode === "day") {
      const start = new Date(year, month - 1, day, 0, 0, 0);
      const end = new Date(year, month - 1, day, 23, 59, 59, 999);
      return { start, end };
    }
    if (mode === "week") {
      const w = weeks[weekIdx];
      if (!w) return null;
      const start = new Date(w.start.getFullYear(), w.start.getMonth(), w.start.getDate(), 0, 0, 0);
      const end = new Date(w.end.getFullYear(), w.end.getMonth(), w.end.getDate(), 23, 59, 59, 999);
      return { start, end };
    }
    if (mode === "month") {
      const start = new Date(year, month - 1, 1, 0, 0, 0);
      const end = new Date(year, month, 0, 23, 59, 59, 999);
      return { start, end };
    }
    if (mode === "year") {
      const start = new Date(year, 0, 1, 0, 0, 0);
      const end = new Date(year, 11, 31, 23, 59, 59, 999);
      return { start, end };
    }
    return null;
  }, [mode, year, month, day, weeks, weekIdx]);

  const filtered = useMemo(() => {
    if (!customRange) return [];
    const s = customRange.start.getTime();
    const e = customRange.end.getTime();
    return rows.filter((r) => {
      const t = new Date(r.created_at).getTime();
      return t >= s && t <= e;
    });
  }, [rows, customRange]);

  // appearance-none remove a seta nativa do navegador — no Android ela
  // desenha por cima do canto direito do campo, cortando o último
  // caractere do texto centralizado (ex.: o "9" de "27/09"). O pr-4
  // reserva o espaço certinho pro ChevronDown desenhado à parte.
  const slotCls =
    "h-11 w-full min-w-0 appearance-none rounded-lg bg-card text-foreground shadow-md pl-1 pr-4 text-center text-xs outline-none focus:ring-1 focus:ring-primary sm:text-sm";

  // Troca de campo (clique num campo que não é o modo atual) sempre reseta
  // pros dados de hoje, em vez de manter um valor antigo escolhido antes —
  // cada campo é um atalho pra "ver [período] de hoje", não uma memória do
  // que foi navegado da última vez.
  function jumpTo(next: Period) {
    if (mode === next) return;
    setDay(now.getDate());
    setMonth(now.getMonth() + 1);
    setYear(now.getFullYear());
    setMode(next);
  }

  return (
    <div className="space-y-4">
      {/* Uma barra só, sempre com os mesmos 4 <select> (nunca troca pra
          <button> e volta) — trocar o tipo do elemento no clique fazia o
          próprio clique "sumir" antes do novo elemento existir, exigindo um
          segundo clique pra realmente abrir a lista. Clicar num campo que
          não é o modo atual reresenta pros dados de hoje (jumpTo); trocar o
          valor dentro do campo já ativo não mexe nos outros campos. */}
      <div className="flex gap-1.5">
        <div className="relative min-w-0 flex-1">
          <select
            value={day}
            onClick={() => jumpTo("day")}
            onChange={(e) => { setDay(Number(e.target.value)); setMode("day"); }}
            className={slotCls}
          >
            {daysArr.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-1 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        </div>

        <div className="relative min-w-0 flex-1">
          <select
            value={weekIdx}
            onClick={() => jumpTo("week")}
            onChange={(e) => { setWeekIdx(Number(e.target.value)); setMode("week"); }}
            className={slotCls}
          >
            {weeks.map((w, i) => (
              <option key={i} value={i}>{w.label}</option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-1 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        </div>

        <div className="relative min-w-0 flex-1">
          <select
            value={month}
            onClick={() => jumpTo("month")}
            onChange={(e) => { setMonth(Number(e.target.value)); setMode("month"); }}
            className={slotCls}
          >
            {monthNames.map((n, i) => (
              <option key={i} value={i + 1}>{n}</option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-1 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        </div>

        <div className="relative min-w-0 flex-1">
          <select
            value={year}
            onClick={() => jumpTo("year")}
            onChange={(e) => { setYear(Number(e.target.value)); setMode("year"); }}
            className={slotCls}
          >
            {years.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-1 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        </div>
      </div>

      <PeriodView rows={filtered} period={mode} />
    </div>
  );
}

function PeriodView({ rows, period }: { rows: SvcRow[]; period: Period }) {
  const viableRows = useMemo(() => rows.filter((r) => r.viable), [rows]);
  const total = rows.length;
  const viaveis = viableRows.length;
  const inviaveis = total - viaveis;
  const pctV = total ? Math.round((viaveis / total) * 100) : 0;

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
    for (const r of rows) {
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
  }, [period, rows]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-2">
        <Card label="Total" value={String(total)} />
        <Card label="Viáveis" value={String(viaveis)} tone="success" />
        <Card label="Inviáveis" value={String(inviaveis)} tone="destructive" />
        <Card label="Efetividade" value={`${pctV}%`} tone="success" />
      </div>

      <div className="rounded-2xl bg-card shadow-md p-3">
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

      <div className="rounded-2xl bg-card shadow-md p-3">
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
                <Bar dataKey="qty" name="Qtd" fill="var(--color-chart-1)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {byType.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl bg-card shadow-md p-3">
            <p className="text-xs uppercase text-muted-foreground">Mais executado</p>
            <p className="text-sm font-semibold truncate">{byType[0]?.name}</p>
            <p className="text-xs text-muted-foreground">{serviceCountLabel(byType[0]?.qty ?? 0)}</p>
          </div>
          <div className="rounded-xl bg-card shadow-md p-3">
            <p className="text-xs uppercase text-muted-foreground">Menos executado</p>
            <p className="text-sm font-semibold truncate">{byType[byType.length - 1]?.name}</p>
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
    <div className="rounded-xl bg-card shadow-md p-3 text-center">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={"text-base font-bold " + c}>{value}</p>
    </div>
  );
}

function VariableTab() {
  const { userId } = useAuthSession();
  const { data: team } = useTeam(userId);
  const rate = team?.variable_rate ?? 7;
  const isTest = !!team?.is_test;

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

  // Contas de teste mostram números fictícios, gerados só no navegador,
  // pra apresentação — nunca lido nem escrito no banco, então não tem como
  // aparecer em painéis de líder, admin ou de outra equipe.
  const fakeNegRows = useMemo(
    () =>
      isTest && userId
        ? generateFakeServiceRows(userId).filter((r) => r.is_negotiation && r.viable)
        : null,
    [isTest, userId],
  );

  // "Pós corte" negociado não soma na Variável (R$/negociação) — página
  // inteira é sobre esse cálculo, então exclui de tudo aqui (somas,
  // contagens e histórico), não só do valor final.
  const negRows = useMemo(
    () => (fakeNegRows ?? neg.data ?? []).filter((r) => !isPosCorteName(r.service_type_name)),
    [fakeNegRows, neg.data],
  );

  const sums = useMemo(() => {
    const now = new Date();
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
    return { buckets, counts };
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

  // Faixa de datas do período selecionado em "Consultar período específico" —
  // usada tanto pelo card de totais (`custom`) quanto pelo gráfico de
  // Histórico financeiro logo abaixo, pra ele acompanhar a data escolhida
  // em vez de sempre mostrar tudo.
  const customRange = useMemo(() => {
    if (customMode === "day") {
      if (!customDay) return null;
      const start = new Date(customDay);
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(end.getDate() + 1);
      return { start, end, label: start.toLocaleDateString("pt-BR") };
    }
    if (customMode === "month") {
      const start = new Date(customYear, customMonth, 1);
      const end = new Date(customYear, customMonth + 1, 1);
      return { start, end, label: `${MONTHS[customMonth]} / ${customYear}` };
    }
    const start = new Date(customYear, 0, 1);
    const end = new Date(customYear + 1, 0, 1);
    return { start, end, label: String(customYear) };
  }, [customMode, customDay, customMonth, customYear]);

  const custom = useMemo(() => {
    if (!customRange) return null;
    let count = 0;
    let total = 0;
    for (const r of negRows) {
      const t = new Date(r.created_at);
      if (t >= customRange.start && t < customRange.end) {
        count++;
        total += Number(r.negotiated_value) || 0;
      }
    }
    return { label: customRange.label, count, total };
  }, [customRange, negRows]);

  const history = useMemo(() => {
    const rowsInRange = customRange
      ? negRows.filter((r) => {
          const t = new Date(r.created_at);
          return t >= customRange.start && t < customRange.end;
        })
      : negRows;

    // Dia selecionado: granularidade por hora, senão um único ponto não
    // mostra tendência nenhuma.
    if (customMode === "day" && customRange) {
      const buckets = new Map<number, number>();
      for (const r of rowsInRange) {
        const h = new Date(r.created_at).getHours();
        buckets.set(h, (buckets.get(h) ?? 0) + (Number(r.negotiated_value) || 0));
      }
      return Array.from({ length: 24 }, (_, h) => ({
        date: `${String(h).padStart(2, "0")}h`,
        value: buckets.get(h) ?? 0,
      }));
    }

    const m = new Map<string, number>();
    for (const r of rowsInRange) {
      const d = new Date(r.created_at).toLocaleDateString("pt-BR");
      m.set(d, (m.get(d) ?? 0) + (Number(r.negotiated_value) || 0));
    }
    return Array.from(m, ([date, value]) => ({ date, value })).reverse();
  }, [negRows, customRange, customMode]);

  return neg.isLoading && !isTest ? (
    <div className="flex justify-center py-20">
      <Loader2 className="size-6 animate-spin text-muted-foreground" />
    </div>
  ) : (
    <div className="space-y-4">
      <p className="rounded-lg bg-destructive px-3 py-2 text-center text-xs font-semibold uppercase tracking-wide text-white">
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
          Histórico financeiro{customRange ? ` — ${customRange.label}` : ""}
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
  );
}
