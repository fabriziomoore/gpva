import { useEffect, useMemo } from "react";
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

const TZ_OFFSET_MS = 3 * 60 * 60 * 1000;

// Versão só-leitura do ranking de equipes (mesmo visual do painel do líder),
// exposta às próprias equipes pra acompanhamento comparativo do dia atual —
// sem filtro de período e sem drill-down, que ficam restritos ao líder.
// O banco (team_ranking) já limita o retorno às equipes do mesmo setor,
// exceto pra conta de teste, que vê todas (uso em apresentações).
export function TeamsRankingSection() {
  const qc = useQueryClient();
  const now = useMemo(() => new Date(), []);

  const range = useMemo(() => {
    const start = new Date(
      Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) + TZ_OFFSET_MS,
    );
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
    return { startISO: start.toISOString(), endISO: end.toISOString() };
  }, [now]);

  const q = useQuery({
    queryKey: ["team-ranking", range.startISO, range.endISO],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("team_ranking", {
        p_start: range.startISO,
        p_end: range.endISO,
      });
      if (error) throw error;
      return (data ?? []) as TeamRankingRow[];
    },
    refetchInterval: 15_000,
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

  const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const sorted = [...(q.data ?? [])].sort(
    (a, b) => b.viable + b.negotiations - (a.viable + a.negotiations),
  );
  const max = Math.max(1, ...sorted.map((t) => t.viable));
  const topNegId = sorted.reduce<{ id: string | null; v: number }>(
    (acc, t) => (t.negotiation_value > acc.v ? { id: t.team_id, v: t.negotiation_value } : acc),
    { id: null, v: -1 },
  ).id;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold">Ranking de Equipes</h2>
        <p className="text-[11px] text-muted-foreground">
          Hoje · atualizando em tempo real durante o expediente.
        </p>
      </div>

      {q.isLoading ? (
        <Loader2 className="mx-auto size-5 animate-spin text-muted-foreground" />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {sorted.map((t) => {
            const pct = Math.round((t.viable / max) * 100);
            const isTopNeg = t.team_id === topNegId && t.negotiation_value > 0;
            return (
              <div
                key={t.team_id}
                className={`block w-full rounded-xl bg-card p-3 text-left ${
                  isTopNeg ? "border-0 ring-2 ring-blue-500" : "border border-border"
                }`}
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
