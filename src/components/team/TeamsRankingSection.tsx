import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type TeamRankingRow = {
  team_id: string;
  team_name: string;
  viable: number;
  inviable: number;
  negotiations: number;
  negotiation_value: number;
};

const MONTH_NAMES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const TZ_OFFSET_MS = 3 * 60 * 60 * 1000;
const selectCls = "h-10 rounded-lg bg-card shadow-md px-3 text-sm";

// Versão só-leitura do ranking de equipes (mesmo visual do painel do líder),
// exposta às próprias equipes para acompanhamento comparativo — sem o
// drill-down por equipe, que fica restrito ao líder.
export function TeamsRankingSection() {
  const qc = useQueryClient();
  const [mode, setMode] = useState<"day" | "week" | "month">("day");
  const now = useMemo(() => new Date(), []);
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [day, setDay] = useState(now.getDate());

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
        list.push({
          start: s,
          end: e,
          label: `${pad(s.getDate())}/${pad(s.getMonth() + 1)} – ${pad(e.getDate())}/${pad(e.getMonth() + 1)}`,
        });
      }
      cur.setDate(cur.getDate() + 7);
    }
    return list;
  }, [year, month]);
  const [weekIdx, setWeekIdx] = useState(0);
  useEffect(() => {
    const idx = weeks.findIndex(
      (w) => now >= w.start && now <= new Date(w.end.getFullYear(), w.end.getMonth(), w.end.getDate(), 23, 59, 59),
    );
    setWeekIdx(idx >= 0 ? idx : 0);
  }, [weeks, now]);

  const range = useMemo(() => {
    if (mode === "day") {
      const start = new Date(Date.UTC(year, month - 1, day) + TZ_OFFSET_MS);
      const end = new Date(Date.UTC(year, month - 1, day + 1) + TZ_OFFSET_MS);
      return { startISO: start.toISOString(), endISO: end.toISOString() };
    }
    if (mode === "week") {
      const w = weeks[weekIdx];
      if (!w) return null;
      const startISO = new Date(
        Date.UTC(w.start.getFullYear(), w.start.getMonth(), w.start.getDate()) + TZ_OFFSET_MS,
      ).toISOString();
      const endISO = new Date(
        Date.UTC(w.end.getFullYear(), w.end.getMonth(), w.end.getDate() + 1) + TZ_OFFSET_MS,
      ).toISOString();
      return { startISO, endISO };
    }
    const start = new Date(Date.UTC(year, month - 1, 1) + TZ_OFFSET_MS);
    const end = new Date(Date.UTC(year, month, 1) + TZ_OFFSET_MS);
    return { startISO: start.toISOString(), endISO: end.toISOString() };
  }, [mode, year, month, day, weeks, weekIdx]);

  const q = useQuery({
    queryKey: ["team-ranking", range?.startISO, range?.endISO],
    queryFn: async () => {
      if (!range) return [];
      const { data, error } = await supabase.rpc("team_ranking", {
        p_start: range.startISO,
        p_end: range.endISO,
      });
      if (error) throw error;
      return (data ?? []) as TeamRankingRow[];
    },
    enabled: !!range,
    refetchInterval: mode === "day" ? 15_000 : false,
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    const channel = supabase
      .channel("team-ranking-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "servicos" },
        () => qc.invalidateQueries({ queryKey: ["team-ranking"] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc]);

  const years: number[] = [];
  for (let y = now.getFullYear(); y >= now.getFullYear() - 4; y--) years.push(y);
  const daysInMonth = new Date(year, month, 0).getDate();
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const sorted = [...(q.data ?? [])].sort(
    (a, b) => b.viable + b.negotiations - (a.viable + a.negotiations),
  );
  const max = Math.max(1, ...sorted.map((t) => t.viable));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold">Ranking de Equipes</h2>
        <div className="inline-flex overflow-hidden rounded-lg border border-border">
          {(["day", "week", "month"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`px-3 py-1 text-xs font-semibold ${mode === m ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground"}`}
            >
              {m === "day" ? "Dia" : m === "week" ? "Semana" : "Mês"}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-2 min-w-0">
        {mode === "day" ? (
          <select
            value={day}
            onChange={(e) => setDay(Number(e.target.value))}
            className={`${selectCls} w-20 shrink-0`}
          >
            {days.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        ) : mode === "week" ? (
          <select
            value={weekIdx}
            onChange={(e) => setWeekIdx(Number(e.target.value))}
            className={`${selectCls} w-20 shrink-0`}
          >
            {weeks.map((_, i) => (
              <option key={i} value={i}>Sem. {i + 1}</option>
            ))}
          </select>
        ) : (
          <select disabled value="" className={`${selectCls} w-20 shrink-0 text-muted-foreground`}>
            <option value="">—</option>
          </select>
        )}
        <select
          value={month}
          onChange={(e) => setMonth(Number(e.target.value))}
          className={`${selectCls} min-w-0 flex-1`}
        >
          {MONTH_NAMES.map((n, i) => (
            <option key={n} value={i + 1}>{n}</option>
          ))}
        </select>
        <select
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
          className={`${selectCls} w-24 shrink-0`}
        >
          {years.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </div>

      {mode === "day" && (
        <p className="text-[11px] text-muted-foreground">
          Atualizando em tempo real durante o expediente.
        </p>
      )}

      {q.isLoading ? (
        <Loader2 className="mx-auto size-5 animate-spin text-muted-foreground" />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {sorted.map((t) => {
            const pct = Math.round((t.viable / max) * 100);
            return (
              <div
                key={t.team_id}
                className="block w-full rounded-xl border border-border bg-card p-3 text-left"
              >
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm font-semibold">{t.team_name}</span>
                  <span className="text-xs text-muted-foreground">{brl(t.negotiation_value)}</span>
                </div>
                <div className="relative h-6 w-full overflow-hidden rounded-full bg-muted">
                  <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
                  <span className="absolute inset-y-0 right-2 flex items-center text-xs font-semibold text-foreground">
                    {t.viable}
                  </span>
                </div>
              </div>
            );
          })}
          {sorted.length === 0 && (
            <p className="text-sm text-muted-foreground md:col-span-full">Sem equipes cadastradas.</p>
          )}
        </div>
      )}
    </div>
  );
}
