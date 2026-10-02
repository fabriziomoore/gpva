import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, UserRound } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  leaderTeamsRanking,
  leaderListShifts,
  leaderListTeams,
  leaderShiftServices,
  leaderTeamServiceList,
  type TeamServiceRow,
} from "@/lib/leader.functions";
import { collaboratorsLabel, formatDateBR, formatDurationMin } from "@/lib/format";
import { buildReport } from "@/lib/report";
import { Button } from "@/components/ui/button";
import { useBackHandler } from "@/lib/back-handler";
import { NegotiationPaymentLine } from "./NegotiationPaymentLine";

type TeamRow = {
  id: string;
  team_name: string;
  photo_url: string | null;
  collaborator1: string | null;
  collaborator2: string | null;
  vehicle_plate: string | null;
  variable_rate: number;
  setor_id: string | null;
  leader: string | null;
  supervisor: string | null;
};

export function LeaderRankingSection({
  onTitleChange,
}: {
  onTitleChange?: (title: string) => void;
}) {
  const fn = useServerFn(leaderTeamsRanking);
  const teamsFn = useServerFn(leaderListTeams);
  const qc = useQueryClient();
  const teams = useQuery({
    queryKey: ["leader-ranking-teams"],
    queryFn: () => teamsFn(),
    staleTime: 60_000,
  });
  const [selected, setSelected] = useState<string | null>(null);
  const [mode, setMode] = useState<"day" | "week" | "month">("day");
  const [filter, setFilter] = useState<"all" | "viable" | "inviable" | "negotiation" | null>(null);
  useEffect(() => {
    setFilter(null);
    setMode("day");
  }, [selected]);
  useEffect(() => {
    onTitleChange?.(selected ? "Perfil" : "Ranking & Perfis");
  }, [selected, onTitleChange]);

  // Voltar do Android (APK) fecha o Perfil e volta pro ranking.
  useBackHandler(!!selected, () => setSelected(null));

  useEffect(() => {
    if (typeof window === "undefined" || !selected) return;
    window.history.pushState({ __leaderRanking: true }, "");
    const onPop = () => setSelected(null);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [selected]);

  const now = useMemo(() => new Date(), []);
  const [year, setYear] = useState<number>(now.getFullYear());
  const [month, setMonth] = useState<number>(now.getMonth() + 1);
  const [day, setDay] = useState<number>(now.getDate());
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
  const [weekIdx, setWeekIdx] = useState<number>(0);
  useEffect(() => {
    // Ao trocar mês/ano, seleciona a semana que contém o dia de referência (ou 0).
    const idx = weeks.findIndex(
      (w) => now >= w.start && now <= new Date(w.end.getFullYear(), w.end.getMonth(), w.end.getDate(), 23, 59, 59),
    );
    setWeekIdx(idx >= 0 ? idx : 0);
  }, [weeks, now]);

  const TZ_OFFSET_MS = 3 * 60 * 60 * 1000;
  const weekRange = useMemo(() => {
    if (mode !== "week") return null;
    const w = weeks[weekIdx];
    if (!w) return null;
    const startISO = new Date(
      Date.UTC(w.start.getFullYear(), w.start.getMonth(), w.start.getDate()) + TZ_OFFSET_MS,
    ).toISOString();
    const endISO = new Date(
      Date.UTC(w.end.getFullYear(), w.end.getMonth(), w.end.getDate() + 1) + TZ_OFFSET_MS,
    ).toISOString();
    return { startISO, endISO };
  }, [mode, weeks, weekIdx]);

  const dayParam = mode === "day" ? day : null;
  const q = useQuery({
    queryKey: ["leader-ranking", year, month, dayParam, mode, weekRange?.startISO ?? null],
    queryFn: () =>
      fn({
        data: {
          year,
          month,
          day: dayParam,
          startISO: weekRange?.startISO ?? null,
          endISO: weekRange?.endISO ?? null,
        },
      }),
    // Atualização periódica para acompanhar as equipes durante o expediente.
    refetchInterval: mode === "day" ? 15_000 : false,
    refetchOnWindowFocus: true,
  });

  // Realtime: invalida ao inserir/atualizar/excluir serviços.
  useEffect(() => {
    const channel = supabase
      .channel("leader-ranking-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "servicos" },
        () => qc.invalidateQueries({ queryKey: ["leader-ranking"] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc]);

  // Efetividade do mês da equipe aberta no Perfil — acompanha o mês/ano
  // selecionados. Mesma chave da consulta do modo "Mês" do ranking, então
  // reaproveita o cache quando ele já foi carregado.
  const monthQ = useQuery({
    queryKey: ["leader-ranking", year, month, null, "month", null],
    queryFn: () => fn({ data: { year, month, day: null, startISO: null, endISO: null } }),
    enabled: !!selected,
  });

  const serviceListFn = useServerFn(leaderTeamServiceList);
  const serviceList = useQuery({
    queryKey: ["leader-team-service-list", selected, year, month, day],
    queryFn: () => serviceListFn({ data: { teamId: selected as string, year, month, day } }),
    enabled: !!selected && !!filter,
  });

  if (q.isLoading) {
    return <Loader2 className="mx-auto size-5 animate-spin text-canvas-foreground/60" />;
  }

  const sorted = [...(q.data ?? [])].sort(
    (a, b) => b.viable + b.negotiations - (a.viable + a.negotiations),
  );
  const max = Math.max(1, ...sorted.map((t) => t.viable));
  const topNegId = sorted.reduce<{ id: string | null; v: number }>(
    (acc, t) => (t.negotiationValue > acc.v ? { id: t.id, v: t.negotiationValue } : acc),
    { id: null, v: -1 },
  ).id;
  const brl = (n: number) =>
    n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const current = selected ? sorted.find((t) => t.id === selected) : null;

  const monthNames = [
    "Janeiro","Fevereiro","Março","Abril","Maio","Junho",
    "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro",
  ];
  const years: number[] = [];
  for (let y = now.getFullYear(); y >= now.getFullYear() - 4; y--) years.push(y);
  const daysInMonth = new Date(year, month, 0).getDate();
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  const selectCls = "h-10 rounded-card bg-card shadow-md px-3 text-sm";
  const periodSelector = (variant: "day" | "week" | "month") => (
    <div className="flex gap-2 min-w-0">
      {variant === "day" ? (
        <select
          value={day}
          onChange={(e) => setDay(Number(e.target.value))}
          className={`${selectCls} w-20 shrink-0`}
        >
          {days.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
      ) : variant === "week" ? (
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
        <select
          disabled
          value=""
          className={`${selectCls} w-20 shrink-0 text-muted-foreground`}
        >
          <option value="">—</option>
        </select>
      )}
      <select
        value={month}
        onChange={(e) => setMonth(Number(e.target.value))}
        className={`${selectCls} min-w-0 flex-1`}
      >
        {monthNames.map((n, i) => (
          <option key={i} value={i + 1}>{n}</option>
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
  );

  if (current) {
    const teamFull = (teams.data ?? []).find((t) => t.id === current.id) as
      | TeamRow
      | undefined;
    const teamMeta = teamFull ?? {
      id: current.id,
      team_name: current.team_name,
      photo_url: null,
      collaborator1: null,
      collaborator2: null,
      vehicle_plate: null,
      variable_rate: 0,
      setor_id: null,
      leader: null,
      supervisor: null,
    };
    return (
      <div className="space-y-4">
        <TeamHeaderReadOnly
          team={teamMeta}
          monthEfficiency={(() => {
            const m = (monthQ.data ?? []).find((t) => t.id === current.id);
            return m && m.total > 0 ? Math.round((m.viable / m.total) * 100) : null;
          })()}
          monthLoading={monthQ.isLoading}
        />
        {periodSelector("day")}
        <TeamDayReportsReadOnly teamId={current.id} team={teamMeta} year={year} month={month} day={day} />
        {/* Negociações com a largura exata do rótulo (auto); os outros três
            dividem o resto por igual, nunca mais estreitos que o próprio
            rótulo (min-content) — todos os rótulos ficam em 10px. */}
        <div className="grid grid-cols-[repeat(3,minmax(min-content,1fr))_auto] gap-2">
          <Stat
            label="Total"
            value={current.total}
            active={filter === "all"}
            onClick={() => setFilter(filter === "all" ? null : "all")}
          />
          <Stat
            label="Viáveis"
            value={current.viable}
            active={filter === "viable"}
            onClick={() => setFilter(filter === "viable" ? null : "viable")}
          />
          <Stat
            label="Inviáveis"
            value={current.inviable}
            active={filter === "inviable"}
            onClick={() => setFilter(filter === "inviable" ? null : "inviable")}
          />
          <Stat
            label="Negociações"
            value={current.negotiations}
            active={filter === "negotiation"}
            onClick={() => setFilter(filter === "negotiation" ? null : "negotiation")}
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          {/* Quanto tempo, desde o início do expediente (7h), a equipe levou
              pra registrar a 1ª O.S. — o tempo médio e a projeção contam a
              partir dela, então o atraso no começo (reunião + ida ao campo)
              fica visível só por este número. */}
          <div className="rounded-card bg-card shadow-md p-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Tempo até a 1ª O.S.</p>
            <p className="text-xl font-bold">{current.firstAt ? sinceWorkdayStart(current.firstAt) : "—"}</p>
          </div>
          <div className="rounded-card bg-card shadow-md p-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Efetividade do dia</p>
            <p className="text-xl font-bold text-success">
              {current.total > 0 ? Math.round((current.viable / current.total) * 100) : 0}%
            </p>
          </div>
        </div>
        {filter && (
          <ServiceListSection
            key={filter}
            filter={filter}
            rows={serviceList.data}
            loading={serviceList.isLoading}
          />
        )}
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-canvas-foreground/70">Por tipo de serviço</h3>
          <div className="space-y-1">
            {Object.entries(current.byType)
              .sort((a, b) => b[1] - a[1])
              .map(([name, qty]) => (
                <div
                  key={name}
                  className="flex items-center justify-between rounded-card bg-card shadow-md px-3 py-2 text-sm"
                >
                  <span>{name}</span>
                  <span className="font-semibold">{qty}</span>
                </div>
              ))}
            {Object.keys(current.byType).length === 0 && (
              <p className="text-sm text-canvas-foreground/70">Sem registros.</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-canvas-foreground">Ranking de Equipes</h2>
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
      {periodSelector(mode)}
      {mode === "day" && (
        <p className="text-[11px] text-canvas-foreground/70">
          Atualizando em tempo real durante o expediente.
        </p>
      )}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {sorted.map((t) => {
          const pct = Math.round((t.viable / max) * 100);
          const isTopNeg = t.id === topNegId && t.negotiationValue > 0;
          return (
            <button
              key={t.id}
              onClick={() => setSelected(t.id)}
              className={`block w-full rounded-card bg-card p-3 text-left transition-colors ${
                isTopNeg
                  ? "border-0 ring-2 ring-blue-500"
                  : "border border-border hover:border-primary"
              }`}
            >
              <div className="mb-2 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <span className="block truncate text-sm font-semibold">{t.team_name}</span>
                  {/* Modo Dia: a que horas a equipe começou a produzir. */}
                  {mode === "day" && (
                    <span className="block text-[11px] text-muted-foreground">
                      {t.firstAt ? `Tempo até a 1ª O.S.: ${sinceWorkdayStart(t.firstAt)}` : "Sem O.S. no dia"}
                    </span>
                  )}
                </div>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {brl(t.negotiationValue)}
                </span>
              </div>
              <div className="relative h-6 w-full overflow-hidden rounded-none bg-muted">
                <div
                  className="h-full bg-primary transition-all"
                  style={{ width: `${pct}%` }}
                />
                <span className="absolute inset-y-0 right-2 flex items-center text-xs font-semibold text-foreground">
                  {t.viable}
                </span>
              </div>
            </button>
          );
        })}
        {sorted.length === 0 && (
          <p className="text-sm text-canvas-foreground/70 md:col-span-full">Sem equipes cadastradas.</p>
        )}
      </div>
    </div>
  );
}

function TeamHeaderReadOnly({
  team,
  monthEfficiency,
  monthLoading,
}: {
  team: TeamRow;
  monthEfficiency: number | null;
  monthLoading: boolean;
}) {
  // Nome e colaboradores alinhados ao topo da foto (não centralizados na
  // altura dela) — mesmo layout do card da equipe na Home.
  return (
    <div className="flex items-start gap-3 rounded-card bg-card shadow-md p-3">
      <div className="relative size-20 shrink-0 overflow-hidden rounded-lg border border-border bg-muted">
        {team.photo_url ? (
          <img src={team.photo_url} alt={team.team_name} className="h-full w-full object-cover" />
        ) : (
          <UserRound
            strokeWidth={1.2}
            className="absolute left-[-10%] top-0 h-[120%] w-[120%] text-muted-foreground"
          />
        )}
      </div>
      <div className="min-w-0 flex-1 leading-tight">
        {/* Nome + colaboradores ao lado do selo de efetividade (as duas
            linhas têm a altura do selo, sem buraco embaixo do nome); o
            veículo vem abaixo, na largura toda — mesmo arranjo da Home. */}
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-semibold">{team.team_name}</p>
            <p className="mt-0.5 truncate text-xs font-semibold text-foreground">
              {collaboratorsLabel(team.collaborator1, team.collaborator2) || "Sem colaboradores"}
            </p>
          </div>
          {/* Efetividade do mês selecionado — mesmo selo do card da Home: sempre
              presente com tamanho fixo, só o valor carrega depois. */}
          <div className="flex h-[34px] w-[62px] shrink-0 flex-col items-center justify-center gap-0.5 rounded-lg bg-muted px-1 text-center">
            <p className="text-[7px] font-bold uppercase leading-none text-muted-foreground">Efetividade</p>
            <div className="flex h-[14px] items-center justify-center">
              {monthLoading ? (
                <span className="h-2.5 w-7 animate-pulse rounded bg-muted-foreground/20" />
              ) : monthEfficiency !== null ? (
                <span className="text-xs font-bold leading-none text-success">{monthEfficiency}%</span>
              ) : (
                <span className="text-xs font-bold leading-none text-muted-foreground">—</span>
              )}
            </div>
          </div>
        </div>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">Veículo:</span> {team.vehicle_plate || "—"}
        </p>
      </div>
    </div>
  );
}

function TeamDayReportsReadOnly({
  teamId,
  team,
  year,
  month,
  day,
}: {
  teamId: string;
  team: { team_name: string; supervisor: string | null; leader: string | null };
  year: number;
  month: number;
  day: number;
}) {
  const qc = useQueryClient();
  const listFn = useServerFn(leaderListShifts);
  const q = useQuery({
    queryKey: ["leader-shifts", teamId],
    queryFn: () => listFn({ data: { teamId } }),
    // Pra refletir o status (aberto/fechado) do expediente em tempo real.
    refetchInterval: 15_000,
  });

  // Invalida os relatórios ao vivo (abertos) quando algo muda nos serviços,
  // vínculos ou impactos do expediente.
  useEffect(() => {
    const channel = supabase
      .channel("leader-shift-live-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "servicos" }, () =>
        qc.invalidateQueries({ queryKey: ["leader-shift-live"] }),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "vinculos_complementos" }, () =>
        qc.invalidateQueries({ queryKey: ["leader-shift-live"] }),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "impactos_expediente" }, () =>
        qc.invalidateQueries({ queryKey: ["leader-shift-live"] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc]);

  const dayStart = new Date(year, month - 1, day, 0, 0, 0).getTime();
  const dayEnd = dayStart + 24 * 60 * 60 * 1000;
  const filtered = (q.data ?? []).filter((r) => {
    const t = new Date(r.started_at).getTime();
    return t >= dayStart && t < dayEnd;
  });

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-canvas-foreground/70">Relatórios do dia</h3>
      {q.isLoading ? (
        <Loader2 className="mx-auto size-5 animate-spin text-canvas-foreground/60" />
      ) : filtered.length === 0 ? (
        <p className="text-xs text-canvas-foreground/70">Nenhum relatório neste dia.</p>
      ) : (
        <div className="space-y-2">
          {filtered.map((r) => (
            <details key={r.id} className="rounded-card bg-card shadow-md p-3 text-sm">
              <summary className="cursor-pointer">
                <span className="font-semibold">{formatDateBR(r.started_at)}</span>
                <span className="ml-2 text-xs text-muted-foreground">
                  {r.status === "closed" ? "Fechado" : "Aberto"}
                </span>
              </summary>
              <ShiftReportBody shift={r} team={team} />
            </details>
          ))}
        </div>
      )}
    </div>
  );
}

function ShiftReportBody({
  shift,
  team,
}: {
  shift: { id: string; started_at: string; status: string; report_text: string | null };
  team: { team_name: string; supervisor: string | null; leader: string | null };
}) {
  const liveFn = useServerFn(leaderShiftServices);
  const isOpen = shift.status !== "closed";
  const live = useQuery({
    queryKey: ["leader-shift-live", shift.id],
    queryFn: () => liveFn({ data: { shiftId: shift.id } }),
    enabled: isOpen,
    refetchInterval: isOpen ? 15_000 : false,
  });

  const text = isOpen
    ? live.data
      ? buildReport({
          started_at: shift.started_at,
          team_name: team.team_name,
          supervisor: team.supervisor ?? "",
          leader: team.leader ?? "",
          services: live.data.services,
          impacts: live.data.impacts,
          complements: live.data.complements,
        })
      : null
    : shift.report_text;

  if (isOpen && live.isLoading) {
    return (
      <div className="mt-3 flex justify-center border-t border-border pt-3">
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return text ? (
    <pre className="mt-3 whitespace-pre-wrap border-t border-border pt-3 text-xs text-foreground">
      {text}
    </pre>
  ) : (
    <p className="mt-3 border-t border-border pt-3 text-xs text-muted-foreground">
      Sem texto de relatório.
    </p>
  );
}

export function Stat({
  label,
  value,
  active,
  onClick,
}: {
  label: string;
  value: number;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-w-0 rounded-card bg-card p-2 text-left shadow-md transition-colors ${
        active ? "ring-2 ring-primary" : ""
      }`}
    >
      <div className="whitespace-nowrap text-[10px] uppercase leading-tight tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-xl font-bold">{value}</div>
    </button>
  );
}

// Início do expediente das equipes (reunião às 7h).
const WORKDAY_START_HOUR = 7;

/** Tempo entre as 7h do dia e a 1ª O.S. (ex.: "1h 12min"). */
export function sinceWorkdayStart(iso: string): string {
  const at = new Date(iso);
  const start = new Date(at);
  start.setHours(WORKDAY_START_HOUR, 0, 0, 0);
  const min = Math.round((at.getTime() - start.getTime()) / 60000);
  if (min <= 0) return "antes das 7h";
  return formatDurationMin(min);
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}


export function ServiceListSection({
  filter,
  rows,
  loading,
}: {
  filter: "all" | "viable" | "inviable" | "negotiation";
  rows: TeamServiceRow[] | undefined;
  loading: boolean;
}) {
  const [limit, setLimit] = useState(5);
  const filtered = (rows ?? []).filter((r) => {
    if (filter === "all") return true;
    if (filter === "viable") return r.viable;
    if (filter === "inviable") return !r.viable;
    return r.is_negotiation && r.viable;
  });
  const title =
    filter === "all"
      ? "Todos os serviços"
      : filter === "viable"
        ? "Serviços viáveis"
        : filter === "inviable"
          ? "Serviços inviáveis"
          : "Negociações";

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-canvas-foreground/70">{title}</h3>
      {loading ? (
        <Loader2 className="mx-auto size-5 animate-spin text-canvas-foreground/60" />
      ) : filtered.length === 0 ? (
        <p className="text-sm text-canvas-foreground/70">Sem registros.</p>
      ) : (
        <>
          <ul className="space-y-2">
            {filtered.slice(0, limit).map((r) => (
              <li key={r.id} className="rounded-card bg-card shadow-md p-3 text-sm">
                <span className="block truncate font-semibold">{r.service_type_name}</span>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {r.registration_number ? `${r.registration_number} · ` : ""}
                  {fmtTime(r.created_at)}
                </p>
                {!r.viable && r.reason_name && (
                  <p className="mt-1 text-[11px] text-destructive">{r.reason_name}</p>
                )}
                {/* Mesmo rodapé dos cards da Consulta: pagamento à esquerda,
                    valor à direita, "à vista" só quando o pagamento é misto. */}
                {r.is_negotiation && (
                  <NegotiationPaymentLine
                    payment_methods={r.payment_methods}
                    valor_a_vista={r.valor_a_vista}
                    valor_parcelado={r.valor_parcelado}
                    qtd_parcelas={r.qtd_parcelas}
                    negotiated_value={r.negotiated_value}
                  />
                )}
              </li>
            ))}
          </ul>
          {filtered.length > limit && (
            <Button variant="outline" className="w-full" onClick={() => setLimit((n) => n + 5)}>
              Ver mais
            </Button>
          )}
        </>
      )}
    </div>
  );
}