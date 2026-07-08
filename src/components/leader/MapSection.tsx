import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuthSession } from "@/hooks/use-auth";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { useIsMobile } from "@/hooks/use-mobile";
import { ServicesMap, type MapPoint } from "@/components/leader/ServicesMap";
import { cn } from "@/lib/utils";
import type { Period } from "@/lib/analytics";

type SvcRow = {
  id: string;
  team_id: string;
  service_type_name: string;
  viable: boolean;
  reason_name: string | null;
  created_at: string;
  lat: number | null;
  lng: number | null;
};

type TeamRow = {
  id: string;
  team_name: string;
};

const ALL = "__all__";
const PAGE = 1000;
const ADMIN_TEAM_LOGIN = "adm";

function rangeFor(p: Period, ref: Date): { start: Date; end: Date } {
  const y = ref.getFullYear();
  const m = ref.getMonth();
  const d = ref.getDate();
  if (p === "day") return { start: new Date(y, m, d, 0, 0, 0), end: new Date(y, m, d + 1, 0, 0, 0) };
  if (p === "month") return { start: new Date(y, m, 1), end: new Date(y, m + 1, 1) };
  if (p === "year") return { start: new Date(y, 0, 1), end: new Date(y + 1, 0, 1) };
  const day = ref.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const start = new Date(y, m, d + diffToMonday, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  return { start, end };
}

/**
 * Painel de mapa do líder: seleção de equipe (uma ou todas) + período.
 * Reutiliza os mesmos queryKeys do painel principal para compartilhar cache.
 */
export function LeaderMapSection() {
  const queryClient = useQueryClient();
  const { userId } = useAuthSession();
  const isAdmin = useIsAdmin(userId);
  const isMobile = useIsMobile();

  const [teamScope, setTeamScope] = useState<string>(ALL);
  const [periodFilter, setPeriodFilter] = useState<Period>("day");
  const [viabilityFilter, setViabilityFilter] = useState<"all" | "viable" | "unviable">("all");
  const [refDate, setRefDate] = useState<Date>(() => new Date());

  // Realtime invalidation when rows change.
  useEffect(() => {
    if (!userId) return;
    const ch = supabase.channel("leader-map");
    ch.on("postgres_changes", { event: "*", schema: "public", table: "servicos" }, () => {
      queryClient.invalidateQueries({ queryKey: ["leader-services", userId] });
    });
    ch.on("postgres_changes", { event: "*", schema: "public", table: "equipes" }, () => {
      queryClient.invalidateQueries({ queryKey: ["leader-teams", userId] });
    });
    ch.subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [userId, queryClient]);

  const teamsQ = useQuery({
    queryKey: ["leader-teams", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("equipes")
        .select("id,team_name,is_test")
        .order("team_name");
      if (error) throw error;
      type Row = { id: string; team_name: string; is_test: boolean | null };
      return ((data ?? []) as Row[])
        .filter((r) => !r.is_test && r.team_name.trim().toLowerCase() !== ADMIN_TEAM_LOGIN)
        .map<TeamRow>((r) => ({ id: r.id, team_name: r.team_name }));
    },
  });

  const servicesQ = useQuery({
    queryKey: ["leader-services", userId],
    enabled: !!userId,
    queryFn: async () => {
      const rows: SvcRow[] = [];
      let from = 0;
      while (true) {
        const { data, error } = await supabase
          .from("servicos")
          .select("id,team_id,service_type_name,viable,reason_name,created_at,lat,lng")
          .order("created_at", { ascending: false })
          .range(from, from + PAGE - 1);
        if (error) throw error;
        rows.push(...((data ?? []) as SvcRow[]));
        if (!data || data.length < PAGE) break;
        from += PAGE;
      }
      return rows;
    },
  });

  const teams = teamsQ.data ?? [];
  const services = servicesQ.data ?? [];

  const teamName = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of teams) m.set(t.id, t.team_name);
    return m;
  }, [teams]);

  const range = useMemo(() => rangeFor(periodFilter, refDate), [periodFilter, refDate]);

  const allowedTeamIds = useMemo(() => new Set(teams.map((t) => t.id)), [teams]);

  const baseFiltered = useMemo(() => {
    return services.filter((s) => {
      if (s.lat == null || s.lng == null) return false;
      if (!allowedTeamIds.has(s.team_id)) return false;
      if (teamScope !== ALL && s.team_id !== teamScope) return false;
      const t = new Date(s.created_at).getTime();
      if (t < range.start.getTime() || t >= range.end.getTime()) return false;
      return true;
    });
  }, [services, allowedTeamIds, teamScope, range]);

  const filtered = useMemo(() => {
    if (viabilityFilter === "all") return baseFiltered;
    return baseFiltered.filter((s) =>
      viabilityFilter === "viable" ? s.viable : !s.viable,
    );
  }, [baseFiltered, viabilityFilter]);

  const counts = useMemo(() => {
    let viable = 0;
    let unviable = 0;
    for (const s of baseFiltered) (s.viable ? viable++ : unviable++);
    return { all: baseFiltered.length, viable, unviable };
  }, [baseFiltered]);

  const points = useMemo<MapPoint[]>(() => {
    return filtered.map((s) => ({
      id: s.id,
      lat: Number(s.lat),
      lng: Number(s.lng),
      viable: s.viable,
      label: s.viable ? s.service_type_name : `Inviável — ${s.reason_name ?? "sem motivo"}`,
      sub: teamName.get(s.team_id) ?? undefined,
      when: new Date(s.created_at).toLocaleString("pt-BR"),
    }));
  }, [filtered, teamName]);

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("servicos").delete().eq("id", id);
    if (error) {
      toast.error("Não foi possível apagar", { description: error.message });
      throw error;
    }
    toast.success("Registro apagado");
    queryClient.invalidateQueries({ queryKey: ["leader-services", userId] });
  };

  const segItem = (active: boolean) =>
    `flex-1 h-9 rounded-md px-2 text-xs font-semibold tracking-wide transition ${
      active
        ? "bg-background text-foreground shadow-sm"
        : "text-muted-foreground hover:text-foreground"
    }`;

  const visibilities: Array<["all" | "viable" | "unviable", string, string, number]> = [
    ["all", "Todas", "bg-foreground", counts.all],
    ["viable", "Viáveis", "bg-success", counts.viable],
    ["unviable", "Inviáveis", "bg-destructive", counts.unviable],
  ];

  const monthNamesFull = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
  ];
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 8 }, (_, i) => currentYear - 6 + i);
  const daysInMonth = new Date(refDate.getFullYear(), refDate.getMonth() + 1, 0).getDate();
  const daysArr = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const weeks = useMemo(() => {
    const y = refDate.getFullYear();
    const m = refDate.getMonth();
    const first = new Date(y, m, 1);
    const dow = (first.getDay() + 6) % 7;
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
  }, [refDate]);
  const weekIndex = Math.max(
    0,
    weeks.findIndex(
      (w) => refDate >= w.start && refDate <= new Date(w.end.getFullYear(), w.end.getMonth(), w.end.getDate(), 23, 59, 59),
    ),
  );
  const selectCls = "h-10 rounded-lg border border-border bg-card px-3 text-sm";

  return (
    <div className="space-y-3 pb-24">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold">Mapa de Serviços</h2>
        <div className="inline-flex overflow-hidden rounded-lg border border-border">
          {(["day", "week", "month"] as Period[]).map((p) => {
            const active = periodFilter === p;
            const label = p === "day" ? "Dia" : p === "week" ? "Semana" : "Mês";
            return (
              <button
                key={p}
                type="button"
                onClick={() => setPeriodFilter(p)}
                className={`px-3 py-1 text-xs font-semibold ${active ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground"}`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <label htmlFor="leader-map-team" className="text-[10px] uppercase tracking-wide text-muted-foreground">
          Equipe
        </label>
        <select
          id="leader-map-team"
          value={teamScope}
          onChange={(e) => setTeamScope(e.target.value)}
          className={cn(selectCls, "mt-1 h-11 w-full")}
        >
          <option value={ALL}>Todas as equipes ({teams.length})</option>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.team_name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex gap-2 min-w-0">
        {periodFilter === "day" ? (
          <select
            value={refDate.getDate()}
            onChange={(e) => setRefDate(new Date(refDate.getFullYear(), refDate.getMonth(), Number(e.target.value)))}
            className={cn(selectCls, "w-20 shrink-0")}
          >
            {daysArr.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        ) : periodFilter === "week" ? (
          <select
            value={weekIndex}
            onChange={(e) => {
              const w = weeks[Number(e.target.value)];
              if (w) setRefDate(new Date(w.start));
            }}
            className={cn(selectCls, "w-20 shrink-0")}
          >
            {weeks.map((_, i) => <option key={i} value={i}>Sem. {i + 1}</option>)}
          </select>
        ) : (
          <select disabled value="" className={cn(selectCls, "w-20 shrink-0 text-muted-foreground")}>
            <option value="">—</option>
          </select>
        )}
        <select
          value={refDate.getMonth()}
          onChange={(e) => setRefDate(new Date(refDate.getFullYear(), Number(e.target.value), 1))}
          className={cn(selectCls, "min-w-0 flex-1")}
        >
          {monthNamesFull.map((n, i) => <option key={i} value={i}>{n}</option>)}
        </select>
        <select
          value={refDate.getFullYear()}
          onChange={(e) => setRefDate(new Date(Number(e.target.value), refDate.getMonth(), 1))}
          className={cn(selectCls, "w-24 shrink-0")}
        >
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      {points.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Nenhum registro com localização para os filtros selecionados.
        </div>
      ) : (
        <div className="space-y-3">
          <div className="-mx-4 overflow-hidden border-y border-border">
            <ServicesMap
              points={points}
              height={isMobile ? 340 : 560}
              onDelete={isAdmin.data ? handleDelete : undefined}
              hideLegend
            />
          </div>
          <div className="flex gap-1 rounded-lg border border-border bg-muted p-1">
            {visibilities.map(([k, l, dot, n]) => {
              const active = viabilityFilter === k;
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => setViabilityFilter(k)}
                  className={`${segItem(active)} inline-flex items-center justify-between gap-2`}
                >
                  <span className="inline-flex items-center gap-1.5 min-w-0 truncate">
                    <span className={`inline-block size-2 shrink-0 rounded-full ${dot}`} />
                    {l}
                  </span>
                  <span className={`tabular-nums text-[11px] font-bold ${active ? "text-foreground" : "text-muted-foreground"}`}>
                    {n}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}