import { useMemo, useState } from "react";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { Loader2, AlertTriangle, ArrowLeft } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatBRL, formatDateBR } from "@/lib/format";
import {
  leaderClientHistory,
  leaderNegotiations,
  leaderRecurringIssues,
  type ClientHistoryRow,
  type RecurringIssueRow,
} from "@/lib/leader.functions";

const MONTHS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const selectCls =
  "h-10 rounded-lg bg-card shadow-md px-3 text-sm focus:ring-1 focus:ring-primary outline-none";

function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  return `${formatDateBR(d)} ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
}

function periodRangeISO(
  mode: "day" | "month" | "year",
  year: number,
  month: number,
  day: number,
): { startISO: string; endISO: string } {
  if (mode === "day") {
    const start = new Date(year, month - 1, day);
    const end = new Date(year, month - 1, day + 1);
    return { startISO: start.toISOString(), endISO: end.toISOString() };
  }
  if (mode === "month") {
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 1);
    return { startISO: start.toISOString(), endISO: end.toISOString() };
  }
  const start = new Date(year, 0, 1);
  const end = new Date(year + 1, 0, 1);
  return { startISO: start.toISOString(), endISO: end.toISOString() };
}

export function ClientHistorySection() {
  const [tab, setTab] = useState<"negotiations" | "recurring">("negotiations");
  const [searched, setSearched] = useState("");

  const runSearch = (value: string) => {
    const v = value.trim();
    if (v) setSearched(v);
  };

  const history = useQuery({
    queryKey: ["leader-client-history", searched],
    queryFn: () => leaderClientHistory({ data: { registrationNumber: searched } }),
    enabled: !!searched,
  });

  if (searched) {
    return <ClientHistoryView searched={searched} history={history} onBack={() => setSearched("")} />;
  }

  return (
    <div className="space-y-4">
      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="negotiations">Negociações</TabsTrigger>
          <TabsTrigger value="recurring">Recorrentes</TabsTrigger>
        </TabsList>
      </Tabs>
      {tab === "negotiations" ? (
        <NegotiationsPeriodList onPickMatricula={runSearch} />
      ) : (
        <RecurringIssuesPanel onPickMatricula={runSearch} />
      )}
    </div>
  );
}

const ALL = "all";

function NegotiationsPeriodList({ onPickMatricula }: { onPickMatricula: (v: string) => void }) {
  const now = useMemo(() => new Date(), []);
  const [year, setYear] = useState(now.getFullYear());
  const [monthSel, setMonthSel] = useState<number | typeof ALL>(now.getMonth() + 1);
  const [daySel, setDaySel] = useState<number | typeof ALL>(now.getDate());
  const [regFilter, setRegFilter] = useState("");

  const years = useMemo(() => {
    const arr: number[] = [];
    for (let y = now.getFullYear(); y >= now.getFullYear() - 4; y--) arr.push(y);
    return arr;
  }, [now]);
  const daysInMonth = monthSel === ALL ? 31 : new Date(year, monthSel, 0).getDate();
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const effectiveDay = daySel === ALL ? ALL : Math.min(daySel, daysInMonth);

  const mode: "day" | "month" | "year" =
    monthSel === ALL ? "year" : effectiveDay === ALL ? "month" : "day";
  const { startISO, endISO } = periodRangeISO(
    mode,
    year,
    monthSel === ALL ? 1 : monthSel,
    effectiveDay === ALL ? 1 : effectiveDay,
  );
  const reg = regFilter.trim();

  const query = useQuery({
    queryKey: ["leader-negotiations", startISO, endISO, reg],
    queryFn: () =>
      leaderNegotiations({ data: { startISO, endISO, registrationNumber: reg || null } }),
  });

  const rows = query.data ?? [];
  const total = rows.reduce((s, r) => s + (Number(r.negotiated_value) || 0), 0);

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <select
          value={effectiveDay}
          disabled={monthSel === ALL}
          onChange={(e) => setDaySel(e.target.value === ALL ? ALL : Number(e.target.value))}
          className={`${selectCls} w-24 shrink-0 disabled:opacity-50`}
        >
          <option value={ALL}>Todos</option>
          {days.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
        <select
          value={monthSel}
          onChange={(e) => {
            const v = e.target.value === ALL ? ALL : Number(e.target.value);
            setMonthSel(v);
            if (v === ALL) setDaySel(ALL);
          }}
          className={`${selectCls} min-w-0 flex-1`}
        >
          <option value={ALL}>Todos</option>
          {MONTHS.map((n, i) => (
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

      <Input
        value={regFilter}
        onChange={(e) => setRegFilter(e.target.value)}
        placeholder="Filtrar por matrícula (opcional)"
        inputMode="numeric"
        className="h-10"
      />

      <div className="grid grid-cols-2 gap-2">
        <Stat label="Negociações" value={String(rows.length)} />
        <Stat label="Total do período" value={formatBRL(total)} small />
      </div>

      {query.isLoading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma negociação no período.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <NegotiationRow
              key={r.id}
              row={r}
              onClick={r.registration_number ? () => onPickMatricula(r.registration_number!) : undefined}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function RecurringIssuesPanel({ onPickMatricula }: { onPickMatricula: (v: string) => void }) {
  const recurring = useQuery({
    queryKey: ["leader-recurring-issues"],
    queryFn: () => leaderRecurringIssues(),
  });

  return (
    <div className="rounded-2xl bg-card shadow-md p-4">
      <p className="mb-1 flex items-center gap-1.5 text-sm font-semibold">
        <AlertTriangle className="size-4 text-destructive" />
        Clientes recorrentes
      </p>
      <p className="mb-3 text-xs text-muted-foreground">
        Matrículas com o mesmo motivo de inviabilidade em 2 ou mais visitas.
      </p>
      {recurring.isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : (recurring.data ?? []).length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Nenhuma recorrência encontrada.</p>
      ) : (
        <ul className="space-y-2">
          {(recurring.data ?? []).map((g: RecurringIssueRow) => (
            <li key={`${g.registration_number}|${g.reason_name}`}>
              <button
                onClick={() => onPickMatricula(g.registration_number)}
                className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-left transition-colors hover:border-primary/50"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-semibold">{g.registration_number}</span>
                  <span className="shrink-0 rounded-full bg-destructive/15 px-2 py-0.5 text-xs font-semibold text-destructive">
                    {g.count}x
                  </span>
                </div>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">{g.reason_name}</p>
                <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
                  {g.team_names.join(", ")} · última em {formatDateBR(g.last_at)}
                </p>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ClientHistoryView({
  searched,
  history,
  onBack,
}: {
  searched: string;
  history: UseQueryResult<ClientHistoryRow[]>;
  onBack: () => void;
}) {
  const rows = history.data ?? [];
  const negotiations = rows.filter((r) => r.is_negotiation && r.viable);
  const inviable = rows.filter((r) => !r.viable);
  const totalNegotiated = negotiations.reduce((s, r) => s + (Number(r.negotiated_value) || 0), 0);
  const reasonCounts = new Map<string, number>();
  for (const r of inviable) {
    const k = (r.reason_name || "").trim();
    if (!k) continue;
    reasonCounts.set(k, (reasonCounts.get(k) ?? 0) + 1);
  }

  return (
    <div className="space-y-4">
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Voltar
      </button>
      <p className="text-lg font-bold">{searched}</p>

      {history.isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : rows.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          Nenhum serviço encontrado para "{searched}".
        </p>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-2">
            <Stat label="Serviços" value={String(rows.length)} />
            <Stat label="Negociações" value={String(negotiations.length)} />
            <Stat label="Total negociado" value={formatBRL(totalNegotiated)} small />
          </div>

          {negotiations.length > 0 && (
            <Section title="Negociações">
              {negotiations.map((r) => (
                <NegotiationRow key={r.id} row={r} />
              ))}
            </Section>
          )}

          {inviable.length > 0 && (
            <Section title="Tentativas inviáveis">
              {inviable.map((r) => (
                <InviableRow
                  key={r.id}
                  row={r}
                  repeated={(reasonCounts.get((r.reason_name || "").trim()) ?? 0) > 1}
                />
              ))}
            </Section>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, small }: { label: string; value: string; small?: boolean }) {
  return (
    <div className="rounded-xl bg-card shadow-md p-3">
      <p className="truncate text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={"truncate font-bold text-foreground " + (small ? "text-sm" : "text-lg")} title={value}>
        {value}
      </p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-card shadow-md p-3">
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</p>
      <ul className="space-y-2">{children}</ul>
    </div>
  );
}

function NegotiationRow({ row, onClick }: { row: ClientHistoryRow; onClick?: () => void }) {
  const inner = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-sm font-semibold">{row.service_type_name}</span>
        <span className="shrink-0 text-sm font-bold text-success">{formatBRL(Number(row.negotiated_value) || 0)}</span>
      </div>
      <p className="mt-0.5 text-xs text-muted-foreground">
        {row.registration_number ? `${row.registration_number} · ` : ""}
        {row.team_name} · {fmtDateTime(row.created_at)}
      </p>
      {(row.payment_methods?.length || row.qtd_parcelas) && (
        <p className="mt-1 text-[11px] text-muted-foreground">
          {row.payment_methods?.join(" + ")}
          {row.valor_a_vista ? ` · à vista ${formatBRL(row.valor_a_vista)}` : ""}
          {row.valor_parcelado ? ` · parcelado ${formatBRL(row.valor_parcelado)}` : ""}
          {row.qtd_parcelas ? ` em ${row.qtd_parcelas}x` : ""}
        </p>
      )}
    </>
  );
  if (onClick) {
    return (
      <li>
        <button
          type="button"
          onClick={onClick}
          className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-left transition-colors hover:border-primary/50"
        >
          {inner}
        </button>
      </li>
    );
  }
  return <li className="rounded-xl border border-border bg-background px-3 py-2.5">{inner}</li>;
}

function InviableRow({ row, repeated }: { row: ClientHistoryRow; repeated: boolean }) {
  return (
    <li className="rounded-xl border border-border bg-background px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-sm font-semibold">{row.reason_name || "Motivo não especificado"}</span>
        {repeated && (
          <span className="shrink-0 rounded-full bg-destructive/15 px-2 py-0.5 text-[10px] font-semibold text-destructive">
            Recorrente
          </span>
        )}
      </div>
      <p className="mt-0.5 text-xs text-muted-foreground">
        {row.team_name} · {row.service_type_name} · {fmtDateTime(row.created_at)}
      </p>
    </li>
  );
}
