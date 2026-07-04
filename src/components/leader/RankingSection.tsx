import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import {
  leaderTeamsRanking,
  leaderListShifts,
  leaderListTeams,
} from "@/lib/leader.functions";
import { formatDateBR } from "@/lib/format";

type TeamRow = {
  id: string;
  team_name: string;
  photo_url: string | null;
  collaborator1: string | null;
  collaborator2: string | null;
  variable_rate: number;
  setor_id: string | null;
  leader: string | null;
};

export function LeaderRankingSection() {
  const fn = useServerFn(leaderTeamsRanking);
  const teamsFn = useServerFn(leaderListTeams);
  const teams = useQuery({
    queryKey: ["leader-ranking-teams"],
    queryFn: () => teamsFn(),
    staleTime: 60_000,
  });
  const [selected, setSelected] = useState<string | null>(null);
  const now = useMemo(() => new Date(), []);
  const [year, setYear] = useState<number>(now.getFullYear());
  const [month, setMonth] = useState<number>(now.getMonth() + 1);
  const [day, setDay] = useState<number>(now.getDate());
  const q = useQuery({
    queryKey: ["leader-ranking", year, month],
    queryFn: () => fn({ data: { year, month } }),
  });

  if (q.isLoading) {
    return <Loader2 className="mx-auto size-5 animate-spin text-muted-foreground" />;
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

  const periodSelector = (withDay: boolean) => (
    <div className="flex gap-2">
      {withDay && (
        <select
          value={day}
          onChange={(e) => setDay(Number(e.target.value))}
          className="h-10 w-20 rounded-lg border border-border bg-card px-3 text-sm"
        >
          {days.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
      )}
      <select
        value={month}
        onChange={(e) => setMonth(Number(e.target.value))}
        className="h-10 flex-1 rounded-lg border border-border bg-card px-3 text-sm"
      >
        {monthNames.map((n, i) => (
          <option key={i} value={i + 1}>{n}</option>
        ))}
      </select>
      <select
        value={year}
        onChange={(e) => setYear(Number(e.target.value))}
        className="h-10 w-28 rounded-lg border border-border bg-card px-3 text-sm"
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
    return (
      <div className="space-y-4">
        <TeamHeaderReadOnly
          team={
            teamFull ?? {
              id: current.id,
              team_name: current.team_name,
              photo_url: null,
              collaborator1: null,
              collaborator2: null,
              variable_rate: 0,
              setor_id: null,
              leader: null,
            }
          }
        />
        {periodSelector(true)}
        <TeamDayReportsReadOnly teamId={current.id} year={year} month={month} day={day} />
        <div className="grid grid-cols-2 gap-3">
          <Stat label="Total" value={current.total} />
          <Stat label="Viáveis" value={current.viable} />
          <Stat label="Inviáveis" value={current.inviable} />
          <Stat label="Negociações" value={current.negotiations} />
        </div>
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-muted-foreground">Por tipo de serviço</h3>
          <div className="space-y-1">
            {Object.entries(current.byType)
              .sort((a, b) => b[1] - a[1])
              .map(([name, qty]) => (
                <div
                  key={name}
                  className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2 text-sm"
                >
                  <span>{name}</span>
                  <span className="font-semibold">{qty}</span>
                </div>
              ))}
            {Object.keys(current.byType).length === 0 && (
              <p className="text-sm text-muted-foreground">Sem registros.</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-base font-semibold">Ranking de Equipes</h2>
      {periodSelector(false)}
      <div className="space-y-3">
        {sorted.map((t) => {
          const pct = Math.round((t.viable / max) * 100);
          const isTopNeg = t.id === topNegId && t.negotiationValue > 0;
          return (
            <button
              key={t.id}
              onClick={() => setSelected(t.id)}
              className={`block w-full rounded-xl bg-card p-3 text-left transition-colors ${
                isTopNeg
                  ? "border-0 ring-2 ring-blue-500"
                  : "border border-border hover:border-primary"
              }`}
            >
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-semibold">{t.team_name}</span>
                <span className="text-xs text-muted-foreground">
                  {brl(t.negotiationValue)}
                </span>
              </div>
              <div className="relative h-6 w-full overflow-hidden rounded-full bg-muted">
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
          <p className="text-sm text-muted-foreground">Sem equipes cadastradas.</p>
        )}
      </div>
    </div>
  );
}

function TeamHeaderReadOnly({ team }: { team: TeamRow }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
      <div className="size-20 shrink-0 overflow-hidden rounded-lg border border-border bg-muted">
        {team.photo_url ? (
          <img src={team.photo_url} alt={team.team_name} className="h-full w-full object-cover" />
        ) : null}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-base font-semibold">{team.team_name}</p>
        <p className="truncate text-xs text-muted-foreground">
          {[team.collaborator1, team.collaborator2].filter(Boolean).join(" e ") ||
            "Sem colaboradores"}
        </p>
        {team.leader && (
          <p className="truncate text-xs text-muted-foreground">Líder: {team.leader}</p>
        )}
      </div>
    </div>
  );
}

function TeamDayReportsReadOnly({
  teamId,
  year,
  month,
  day,
}: {
  teamId: string;
  year: number;
  month: number;
  day: number;
}) {
  const listFn = useServerFn(leaderListShifts);
  const q = useQuery({
    queryKey: ["leader-shifts", teamId],
    queryFn: () => listFn({ data: { teamId } }),
  });

  const dayStart = new Date(year, month - 1, day, 0, 0, 0).getTime();
  const dayEnd = dayStart + 24 * 60 * 60 * 1000;
  const filtered = (q.data ?? []).filter((r) => {
    const t = new Date(r.started_at).getTime();
    return t >= dayStart && t < dayEnd;
  });

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-muted-foreground">Relatórios do dia</h3>
      {q.isLoading ? (
        <Loader2 className="mx-auto size-5 animate-spin text-muted-foreground" />
      ) : filtered.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nenhum relatório neste dia.</p>
      ) : (
        <div className="space-y-2">
          {filtered.map((r) => (
            <details
              key={r.id}
              className="rounded-xl border border-border bg-card p-3 text-sm"
            >
              <summary className="cursor-pointer">
                <span className="font-semibold">{formatDateBR(r.started_at)}</span>
                <span className="ml-2 text-xs text-muted-foreground">
                  {r.status === "closed" ? "Fechado" : "Aberto"}
                </span>
              </summary>
              {r.report_text ? (
                <pre className="mt-3 whitespace-pre-wrap border-t border-border pt-3 text-xs text-foreground">
                  {r.report_text}
                </pre>
              ) : (
                <p className="mt-3 border-t border-border pt-3 text-xs text-muted-foreground">
                  Sem texto de relatório.
                </p>
              )}
            </details>
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-bold">{value}</div>
    </div>
  );
}