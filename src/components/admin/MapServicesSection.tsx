import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  adminListMapServices,
  adminDeleteMapService,
  adminDataSummary,
  listTeams,
} from "@/lib/admin.functions";

export function MapServicesSection({ adminPw }: { adminPw: string }) {
  const qc = useQueryClient();
  const listFn = useServerFn(adminListMapServices);
  const delFn = useServerFn(adminDeleteMapService);
  const summaryFn = useServerFn(adminDataSummary);
  const teamsFn = useServerFn(listTeams);

  const today = new Date();
  const [teamId, setTeamId] = useState<string>("");
  const [start, setStart] = useState<string>(
    new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10),
  );
  const [end, setEnd] = useState<string>(today.toISOString().slice(0, 10));

  const range = useMemo(() => {
    const startISO = start ? new Date(start + "T00:00:00-03:00").toISOString() : undefined;
    const endISO = end
      ? new Date(new Date(end + "T00:00:00-03:00").getTime() + 24 * 3600 * 1000).toISOString()
      : undefined;
    return { startISO, endISO };
  }, [start, end]);

  const teams = useQuery({
    queryKey: ["admin-teams"],
    queryFn: () => teamsFn({ data: { adminPassword: adminPw } }),
  });

  const list = useQuery({
    queryKey: ["admin-map-services", teamId, range.startISO, range.endISO],
    queryFn: () =>
      listFn({
        data: {
          adminPassword: adminPw,
          teamId: teamId || undefined,
          startISO: range.startISO,
          endISO: range.endISO,
        },
      }),
  });

  const summary = useQuery({
    queryKey: ["admin-data-summary", "map-services", teamId, range.startISO, range.endISO],
    queryFn: () =>
      summaryFn({
        data: {
          adminPassword: adminPw,
          teamId: teamId || undefined,
          startISO: range.startISO,
          endISO: range.endISO,
        },
      }),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => delFn({ data: { adminPassword: adminPw, id } }),
    onSuccess: () => {
      toast.success("Registro excluído");
      qc.invalidateQueries({ queryKey: ["admin-map-services"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold">Serviços no Mapa</h2>
        <p className="text-xs text-muted-foreground">
          Lista todas as marcações (viáveis e inviáveis) do período. A exclusão remove apenas a marcação selecionada e é permanente.
        </p>
      </div>

      <div className="space-y-2 rounded-lg border border-border bg-card p-3">
        <div>
          <Label>Equipe</Label>
          <select
            value={teamId}
            onChange={(e) => setTeamId(e.target.value)}
            className="mt-1 h-10 w-full rounded-md border border-input bg-background px-2 text-sm"
          >
            <option value="">Todas</option>
            {teams.data?.map((t) => (
              <option key={t.id} value={t.id}>{t.team_name}</option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label>De</Label>
            <input
              type="date"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className="mt-1 h-10 w-full rounded-md border border-input bg-background px-2 text-sm"
            />
          </div>
          <div>
            <Label>Até</Label>
            <input
              type="date"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              className="mt-1 h-10 w-full rounded-md border border-input bg-background px-2 text-sm"
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <SummaryTile label="Equipes" loading={summary.isLoading} value={summary.data?.teams ?? 0} />
        <SummaryTile label="Expedientes" loading={summary.isLoading} value={summary.data?.shifts ?? 0} />
        <SummaryTile label="Serviços" loading={summary.isLoading} value={summary.data?.services ?? 0} />
      </div>

      <div className="rounded-lg border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border bg-muted/50 p-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          {list.isLoading ? (
            <span>Carregando...</span>
          ) : (
            <>
              <span>{list.data?.length ?? 0} Listados</span>
              <span className="text-green-600 dark:text-green-400">{list.data?.filter(r => r.viable).length ?? 0} Viáveis</span>
              <span className="text-red-600 dark:text-red-400">{list.data?.filter(r => !r.viable).length ?? 0} Inviáveis</span>
            </>
          )}
        </div>
        <ul className="max-h-[480px] divide-y divide-border overflow-y-auto">
          {list.data?.length === 0 && !list.isLoading && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <p className="text-sm font-medium text-muted-foreground">Nenhuma marcação encontrada</p>
              <p className="text-xs text-muted-foreground/60">Ajuste equipe/período; isso não significa que o banco esteja vazio.</p>
            </div>
          )}
          {list.data?.map((r) => (
            <li key={r.id} className="flex items-start justify-between gap-2 p-2 text-xs">
              <div className="min-w-0 flex-1">
                <div className="font-medium">
                  {r.team_name} — {r.service_type_name || (r.viable ? "Viável" : "Inviável")}
                </div>
                <div className="text-muted-foreground">
                  {new Date(r.created_at).toLocaleString("pt-BR")}
                  {r.is_negotiation && r.negotiated_value ? ` · R$ ${Number(r.negotiated_value).toFixed(2)}` : ""}
                  {r.lat != null && r.lng != null ? ` · ${r.lat.toFixed(5)}, ${r.lng.toFixed(5)}` : " · sem GPS"}
                </div>
              </div>
              <button
                className="rounded p-1 text-muted-foreground hover:text-destructive"
                disabled={delMut.isPending}
                onClick={() => {
                  const when = new Date(r.created_at).toLocaleString("pt-BR");
                  const label = r.service_type_name || (r.viable ? "Viável" : "Inviável");
                  const msg = `Excluir APENAS esta marcação?\n\nEquipe: ${r.team_name}\nTipo: ${label}\nData: ${when}\n\nEsta ação remove somente este registro e é irreversível.`;
                  if (confirm(msg)) delMut.mutate(r.id);
                }}
                aria-label="Excluir"
              >
                {delMut.isPending && delMut.variables === r.id ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Trash2 className="size-4" />
                )}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function SummaryTile({
  label,
  loading,
  value,
}: {
  label: string;
  loading: boolean;
  value: number;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-2">
      <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-lg font-semibold text-foreground">
        {loading ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> : value}
      </div>
    </div>
  );
}
