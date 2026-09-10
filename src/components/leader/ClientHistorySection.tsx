import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Search, AlertTriangle, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { formatBRL, formatDateBR } from "@/lib/format";
import {
  leaderClientHistory,
  leaderRecurringIssues,
  type ClientHistoryRow,
  type RecurringIssueRow,
} from "@/lib/leader.functions";

function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  return `${formatDateBR(d)} ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
}

export function ClientHistorySection() {
  const [query, setQuery] = useState("");
  const [searched, setSearched] = useState("");

  const recurring = useQuery({
    queryKey: ["leader-recurring-issues"],
    queryFn: () => leaderRecurringIssues(),
    enabled: !searched,
  });

  const history = useQuery({
    queryKey: ["leader-client-history", searched],
    queryFn: () => leaderClientHistory({ data: { registrationNumber: searched } }),
    enabled: !!searched,
  });

  const runSearch = (value: string) => {
    const v = value.trim();
    if (!v) return;
    setQuery(v);
    setSearched(v);
  };

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
      <div className="flex gap-2">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") runSearch(query);
          }}
          placeholder="Buscar por matrícula..."
          inputMode="numeric"
          className="h-11 flex-1"
        />
        <Button className="h-11 px-4" onClick={() => runSearch(query)} disabled={!query.trim()}>
          <Search className="size-4" />
        </Button>
        {searched && (
          <Button
            variant="outline"
            className="h-11 px-3"
            onClick={() => {
              setQuery("");
              setSearched("");
            }}
          >
            <X className="size-4" />
          </Button>
        )}
      </div>

      {!searched ? (
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
                    onClick={() => runSearch(g.registration_number)}
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
      ) : history.isLoading ? (
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

function NegotiationRow({ row }: { row: ClientHistoryRow }) {
  return (
    <li className="rounded-xl border border-border bg-background px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-sm font-semibold">{row.service_type_name}</span>
        <span className="shrink-0 text-sm font-bold text-success">{formatBRL(Number(row.negotiated_value) || 0)}</span>
      </div>
      <p className="mt-0.5 text-xs text-muted-foreground">
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
    </li>
  );
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
