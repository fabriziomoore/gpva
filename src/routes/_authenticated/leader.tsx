import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuthSession } from "@/hooks/use-auth";
import { useIsLeader } from "@/hooks/use-is-leader";
import { AppShell } from "@/components/layout/AppShell";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import {
  Loader2,
  TrendingUp,
  TrendingDown,
  Minus,
  LogOut,
} from "lucide-react";
import { toast } from "sonner";
import {
  type Period,
  periodRange,
  previousRange,
  inRange,
  deltaPct,
  paceProjection,
  previousLabel,
  projectionLabel,
  elapsedRatio,
} from "@/lib/analytics";
import { buildPeriodReport } from "@/lib/report";
import { renderLeaderPdfBlob, type PeriodAgg, type TeamBreakdown } from "@/lib/leader-pdf";
import { downloadOrShare, slugFilename } from "@/lib/download";
import { FileDown } from "lucide-react";

export const Route = createFileRoute("/_authenticated/leader")({
  ssr: false,
  head: () => ({ meta: [{ title: "Painel do Líder — GPVA" }] }),
  component: LeaderPage,
});

type SvcRow = {
  id: string;
  team_id: string;
  shift_id: string;
  service_type_name: string;
  is_negotiation: boolean;
  viable: boolean;
  reason_name: string | null;
  negotiated_value: number | null;
  created_at: string;
};
type ShiftRow = { id: string; team_id: string; started_at: string };
type ImpactRow = { shift_id: string; impact_name: string };
type CompRow = { shift_id: string; complement_name: string };
type TeamRow = {
  id: string;
  team_name: string;
  leader: string;
  supervisor: string;
  variable_rate: number;
  setor_id: string | null;
  setor_nome: string | null;
  setor_supervisor: string | null;
};

const ALL = "__all__";
const PAGE = 1000;

function LeaderPage() {
  const navigate = useNavigate();
  const { userId } = useAuthSession();
  const isLeader = useIsLeader(userId);
  const [scope, setScope] = useState<string>(ALL);
  const [setorScope, setSetorScope] = useState<string>(ALL);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (isLeader.data === false) navigate({ to: "/" });
  }, [isLeader.data, navigate]);

  // Realtime: invalida as queries do painel quando algo muda no banco.
  useEffect(() => {
    if (!userId || isLeader.data !== true) return;
    const tables: Array<{ table: string; key: string }> = [
      { table: "servicos", key: "leader-services" },
      { table: "expedientes", key: "leader-shifts" },
      { table: "impactos_expediente", key: "leader-impacts" },
      { table: "vinculos_complementos", key: "leader-complements" },
      { table: "equipes", key: "leader-teams" },
    ];
    const channel = supabase.channel("leader-dashboard");
    for (const { table, key } of tables) {
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        () => {
          queryClient.invalidateQueries({ queryKey: [key, userId] });
        },
      );
    }
    channel.subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, isLeader.data, queryClient]);

  const teams = useQuery({
    queryKey: ["leader-teams", userId],
    enabled: !!userId && isLeader.data === true,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("equipes")
        .select("id,team_name,leader,supervisor,variable_rate,setor_id,setores(nome,supervisor_nome)")
        .order("team_name");
      if (error) throw error;
      type Row = {
        id: string; team_name: string; leader: string; supervisor: string; variable_rate: number;
        setor_id: string | null; setores: { nome: string; supervisor_nome: string } | null;
      };
      return ((data ?? []) as unknown as Row[]).map<TeamRow>((r) => ({
        id: r.id,
        team_name: r.team_name,
        leader: r.leader,
        supervisor: r.setores?.supervisor_nome || r.supervisor,
        variable_rate: r.variable_rate,
        setor_id: r.setor_id,
        setor_nome: r.setores?.nome ?? null,
        setor_supervisor: r.setores?.supervisor_nome ?? null,
      }));
    },
  });

  const services = useQuery({
    queryKey: ["leader-services", userId],
    enabled: !!userId && isLeader.data === true,
    queryFn: async () => {
      const rows: SvcRow[] = [];
      let from = 0;
      while (true) {
        const { data, error } = await supabase
          .from("servicos")
          .select("id,team_id,shift_id,service_type_name,is_negotiation,viable,reason_name,negotiated_value,created_at")
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

  const shifts = useQuery({
    queryKey: ["leader-shifts", userId],
    enabled: !!userId && isLeader.data === true,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expedientes")
        .select("id,team_id,started_at,status")
        .eq("status", "closed")
        .order("started_at", { ascending: false })
        .limit(2000);
      if (error) throw error;
      return ((data ?? []) as (ShiftRow & { status: string })[]);
    },
  });

  const impacts = useQuery({
    queryKey: ["leader-impacts", userId],
    enabled: !!userId && isLeader.data === true,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("impactos_expediente")
        .select("shift_id,impact_name")
        .limit(10000);
      if (error) throw error;
      return (data ?? []) as ImpactRow[];
    },
  });

  const complements = useQuery({
    queryKey: ["leader-complements", userId],
    enabled: !!userId && isLeader.data === true,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vinculos_complementos")
        .select("shift_id,complement_name")
        .limit(20000);
      if (error) throw error;
      return (data ?? []) as CompRow[];
    },
  });

  if (isLeader.isLoading || isLeader.data === undefined) {
    return (
      <AppShell title="Painel do Líder" showBack={false}>
        <div className="flex justify-center py-20">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      </AppShell>
    );
  }
  if (isLeader.data === false) return null;

  const loading =
    services.isLoading || shifts.isLoading || teams.isLoading || impacts.isLoading || complements.isLoading;

  const teamList = teams.data ?? [];
  const setores = Array.from(
    new Map(
      teamList
        .filter((t) => t.setor_id)
        .map((t) => [t.setor_id!, { id: t.setor_id!, nome: t.setor_nome ?? "—", supervisor: t.setor_supervisor ?? "" }]),
    ).values(),
  ).sort((a, b) => a.nome.localeCompare(b.nome));
  const filteredTeams = setorScope === ALL ? teamList : teamList.filter((t) => t.setor_id === setorScope);
  // If the currently-selected team is not in the sector, reset to ALL teams for that sector.
  const effectiveScope = scope === ALL || filteredTeams.some((t) => t.id === scope) ? scope : ALL;
  const scopedTeam = effectiveScope === ALL ? null : filteredTeams.find((t) => t.id === effectiveScope) ?? null;
  const setorObj = setorScope === ALL ? null : setores.find((s) => s.id === setorScope) ?? null;
  const setorSupervisor =
    scopedTeam?.setor_supervisor ||
    setorObj?.supervisor ||
    (setorScope === ALL && filteredTeams[0]?.setor_supervisor) ||
    "-";
  const setorName =
    scopedTeam?.setor_nome ||
    setorObj?.nome ||
    (setorScope === ALL ? "Todos os setores" : "—");
  const scopeMeta = scopedTeam
    ? {
        team_name: scopedTeam.team_name,
        leader: scopedTeam.leader,
        supervisor: scopedTeam.supervisor || setorSupervisor,
        rate: scopedTeam.variable_rate,
        setor_nome: setorName,
      }
    : {
        team_name: setorScope === ALL ? "Todas as equipes" : `Todas de ${setorName}`,
        leader: "-",
        supervisor: setorSupervisor,
        rate: filteredTeams[0]?.variable_rate ?? 7,
        setor_nome: setorName,
      };

  const filterByScope = <T extends { team_id?: string; shift_id?: string }>(rows: T[]): T[] => {
    const allowedTeamIds = new Set(filteredTeams.map((t) => t.id));
    if (effectiveScope === ALL) {
      // Filter by sector if a sector is selected
      if (setorScope === ALL) return rows;
      return rows.filter((r) => {
        if (r.team_id) return allowedTeamIds.has(r.team_id);
        if (r.shift_id) {
          const s = (shifts.data ?? []).find((x) => x.id === r.shift_id);
          return s ? allowedTeamIds.has(s.team_id) : false;
        }
        return true;
      });
    }
    // For rows with team_id, filter direct. For rows with only shift_id, filter via shifts scoped.
    return rows.filter((r) => {
      if (r.team_id) return r.team_id === effectiveScope;
      if (r.shift_id) {
        const s = (shifts.data ?? []).find((x) => x.id === r.shift_id);
        return s?.team_id === effectiveScope;
      }
      return true;
    });
  };

  const filteredSvc = filterByScope(services.data ?? []);
  const filteredShifts = (() => {
    const rows = shifts.data ?? [];
    if (effectiveScope !== ALL) return rows.filter((s) => s.team_id === effectiveScope);
    if (setorScope !== ALL) {
      const allowed = new Set(filteredTeams.map((t) => t.id));
      return rows.filter((s) => allowed.has(s.team_id));
    }
    return rows;
  })();
  const filteredImpacts = filterByScope(impacts.data ?? []);
  const filteredComps = filterByScope(complements.data ?? []);

  async function handleSignOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  }

  return (
    <AppShell
      title="Painel do Líder"
      showBack={false}
      right={
        <button
          onClick={handleSignOut}
          className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
        >
          <LogOut className="size-4" /> Sair
        </button>
      }
    >
      <div className="mb-4">
        <label className="text-[10px] uppercase tracking-wide text-muted-foreground">Equipe</label>
        <Select value={effectiveScope} onValueChange={setScope}>
          <SelectTrigger className="h-11">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todas as equipes ({filteredTeams.length})</SelectItem>
            {filteredTeams.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.team_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <Tabs defaultValue="month">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="day">Dia</TabsTrigger>
            <TabsTrigger value="week">Semana</TabsTrigger>
            <TabsTrigger value="month">Mês</TabsTrigger>
            <TabsTrigger value="year">Ano</TabsTrigger>
          </TabsList>
          {(["day", "week", "month", "year"] as const).map((p) => (
            <TabsContent key={p} value={p} className="mt-4">
              <PeriodView
                period={p}
                services={filteredSvc}
                shifts={filteredShifts}
                impacts={filteredImpacts}
                complements={filteredComps}
                meta={scopeMeta}
                allTeams={teamList}
                allServices={services.data ?? []}
                allShifts={shifts.data ?? []}
                scopeIsAll={scope === ALL}
              />
            </TabsContent>
          ))}
        </Tabs>
      )}
    </AppShell>
  );
}

function cleanName(name: string | null | undefined) {
  return name?.trim().replace(/\s+/g, " ") || "Sem tipo";
}
function fmtQty(q: number) {
  return q.toLocaleString("pt-BR");
}

type ScopeMeta = {
  team_name: string;
  leader: string;
  supervisor: string;
  rate: number;
  setor_nome?: string;
};

function PeriodView({
  period,
  services,
  shifts,
  impacts,
  complements,
  meta,
  allTeams,
  allServices,
  allShifts,
  scopeIsAll,
}: {
  period: Period;
  services: SvcRow[];
  shifts: ShiftRow[];
  impacts: ImpactRow[];
  complements: CompRow[];
  meta: ScopeMeta;
  allTeams: TeamRow[];
  allServices: SvcRow[];
  allShifts: ShiftRow[];
  scopeIsAll: boolean;
}) {
  const { session } = useAuthSession();
  const stats = useMemo(() => {
    const cur = periodRange(period);
    const prev = previousRange(period);
    const curSvc = services.filter((s) => inRange(s.created_at, cur));
    const prevSvc = services.filter((s) => inRange(s.created_at, prev));
    const curShifts = shifts.filter((s) => inRange(s.started_at, cur));
    const curIds = new Set(curShifts.map((s) => s.id));
    const curImpacts = impacts.filter((i) => curIds.has(i.shift_id));
    const curComps = complements.filter((c) => curIds.has(c.shift_id));

    const agg = (rows: SvcRow[]) => {
      const viable = rows.filter((r) => r.viable);
      const neg = viable.filter((r) => r.is_negotiation);
      return {
        total: rows.length,
        viable: viable.length,
        unviable: rows.length - viable.length,
        negotiations: neg.length,
        negotiated_value: neg.reduce((a, b) => a + (Number(b.negotiated_value) || 0), 0),
      };
    };
    const current = { ...agg(curSvc), shifts: curShifts.length };
    const previous = agg(prevSvc);
    const projected = {
      total: paceProjection(current.total, period),
      negotiated_value: paceProjection(current.negotiated_value, period),
    };
    const variable = current.negotiations * meta.rate;

    const bucket = <T,>(arr: T[], keyFn: (x: T) => string) => {
      const m = new Map<string, { name: string; qty: number }>();
      for (const x of arr) {
        const name = cleanName(keyFn(x));
        const k = name.toLocaleLowerCase("pt-BR");
        const c = m.get(k);
        if (c) c.qty += 1;
        else m.set(k, { name, qty: 1 });
      }
      return Array.from(m.values()).sort((a, b) => b.qty - a.qty || a.name.localeCompare(b.name));
    };

    const byType = bucket(curSvc.filter((s) => s.viable), (s) => s.service_type_name);
    const topReasons = bucket(curSvc.filter((s) => !s.viable && s.reason_name), (s) => s.reason_name!);
    const topImpacts = bucket(curImpacts, (i) => i.impact_name);
    const topComps = bucket(curComps, (c) => c.complement_name);

    const perDay = new Map<string, number>();
    for (const s of curSvc.filter((x) => x.viable)) {
      const k = new Date(s.created_at).toISOString().slice(0, 10);
      perDay.set(k, (perDay.get(k) ?? 0) + 1);
    }
    let bestDay: { date: string; qty: number } | null = null;
    for (const [k, qty] of perDay) {
      if (!bestDay || qty > bestDay.qty) bestDay = { date: formatDateBR(k), qty };
    }

    const evoMap = new Map<string, { date: string; qty: number; unviable: number; sort: number }>();
    for (const s of curSvc) {
      const d = new Date(s.created_at);
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
      const c = evoMap.get(key);
      if (c) {
        if (s.viable) c.qty += 1;
        else c.unviable += 1;
      } else {
        evoMap.set(key, { date: label, qty: s.viable ? 1 : 0, unviable: s.viable ? 0 : 1, sort });
      }
    }
    const evolution = Array.from(evoMap.values())
      .sort((a, b) => a.sort - b.sort)
      .map(({ date, qty, unviable }) => ({ date, qty, unviable }));

    const compareBars = [
      { name: "Total", atual: current.total, anterior: previous.total },
      { name: "Viáveis", atual: current.viable, anterior: previous.viable },
      { name: "Inviáveis", atual: current.unviable, anterior: previous.unviable },
      { name: "Negoc.", atual: current.negotiations, anterior: previous.negotiations },
    ];
    const pctV = current.total ? Math.round((current.viable / current.total) * 100) : 0;
    const pctVPrev = previous.total ? Math.round((previous.viable / previous.total) * 100) : 0;
    const avgPerShift = current.shifts ? +(current.total / current.shifts).toFixed(1) : 0;

    return { current, previous, projected, variable, byType, topReasons, topImpacts, topComps, bestDay, evolution, compareBars, pctV, pctVPrev, avgPerShift };
  }, [period, services, shifts, impacts, complements, meta.rate]);

  const buildText = () =>
    buildPeriodReport({
      period,
      team_name: meta.team_name,
      leader: meta.leader,
      supervisor: meta.supervisor,
      current: stats.current,
      previous: stats.previous,
      projected: stats.projected,
      variable_estimated: stats.variable,
      by_type: stats.byType,
      top_reasons: stats.topReasons,
      top_impacts: stats.topImpacts,
      top_complements: stats.topComps,
      best_day: stats.bestDay,
    });

  const teamsBreakdown = useMemo<TeamBreakdown[]>(() => {
    if (!scopeIsAll) return [];
    const cur = periodRange(period);
    const prev = previousRange(period);
    return allTeams
      .map((t) => {
        const svcCur = allServices.filter((s) => s.team_id === t.id && inRange(s.created_at, cur));
        const svcPrev = allServices.filter((s) => s.team_id === t.id && inRange(s.created_at, prev));
        const shiftsCur = allShifts.filter((s) => s.team_id === t.id && inRange(s.started_at, cur));
        const agg = (rows: SvcRow[]): PeriodAgg => {
          const viable = rows.filter((r) => r.viable);
          const neg = viable.filter((r) => r.is_negotiation);
          return {
            total: rows.length,
            viable: viable.length,
            unviable: rows.length - viable.length,
            negotiations: neg.length,
            negotiated_value: neg.reduce((a, b) => a + (Number(b.negotiated_value) || 0), 0),
            shifts: 0,
          };
        };
        const c = { ...agg(svcCur), shifts: shiftsCur.length };
        const p = agg(svcPrev);
        return {
          team_name: t.team_name,
          leader: t.leader,
          supervisor: t.supervisor,
          current: c,
          previous: p,
          variable_estimated: c.negotiations * (t.variable_rate || 0),
        } as TeamBreakdown;
      })
      .sort((a, b) => b.current.total - a.current.total);
  }, [scopeIsAll, period, allTeams, allServices, allShifts]);

  const [pdfLoading, setPdfLoading] = useState(false);
  const handleExportPdf = async () => {
    if (pdfLoading) return;
    setPdfLoading(true);
    try {
      const blob = await renderLeaderPdfBlob({
        period,
        scope_label: meta.team_name,
        leader: meta.leader,
        supervisor: meta.supervisor,
        setor: meta.setor_nome,
        current: { ...stats.current },
        previous: { ...stats.previous, shifts: 0 } as PeriodAgg,
        projected: stats.projected,
        variable_estimated: stats.variable,
        by_type: stats.byType,
        top_reasons: stats.topReasons,
        top_impacts: stats.topImpacts,
        top_complements: stats.topComps,
        compare_bars: stats.compareBars,
        evolution: stats.evolution,
        company: "GPVA",
        generated_by: session?.user.email ?? meta.leader,
        collaborators_count: null,
        best_day: stats.bestDay,
        teams: teamsBreakdown,
      });
      const filename = `relatorio-${slugFilename(meta.team_name)}-${period}.pdf`;
      await downloadOrShare(blob, filename);
      toast.success("Relatório gerado");
    } catch (e) {
      console.error(e);
      toast.error("Não foi possível gerar o PDF");
    } finally {
      setPdfLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        <Kpi label="Total" value={fmtQty(stats.current.total)} delta={deltaPct(stats.current.total, stats.previous.total)} hint={`vs ${previousLabel(period)}: ${stats.previous.total}`} />
        <Kpi label="Viabilidade" value={`${stats.pctV}%`} delta={deltaPct(stats.pctV, stats.pctVPrev)} hint={`${stats.current.viable} viáv. / ${stats.current.unviable} inviáv.`} tone="success" />
        <Kpi label="Negociado" value={formatBRL(stats.current.negotiated_value)} delta={deltaPct(stats.current.negotiated_value, stats.previous.negotiated_value)} hint={`${stats.current.negotiations} negociações`} small />
        <Kpi label="Expedientes" value={String(stats.current.shifts)} hint="fechados no período" small />
        <Kpi label="Média/expediente" value={String(stats.avgPerShift)} hint="serviços por dia trabalhado" small />
      </div>

      {period !== "day" && (
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{projectionLabel(period)}</p>
          <div className="mt-2 grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-muted-foreground">Serviços</p>
              <p className="text-2xl font-bold text-primary">{stats.projected.total}</p>
              <ProjectionDelta projected={stats.projected.total} previous={stats.previous.total} />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Negociado</p>
              <p className="text-2xl font-bold text-primary">{formatBRL(stats.projected.negotiated_value)}</p>
              <ProjectionDelta projected={stats.projected.negotiated_value} previous={stats.previous.negotiated_value} currency />
            </div>
          </div>
          <PaceBar current={stats.current.total} projected={stats.projected.total} period={period} />
          <p className="mt-2 text-[10px] text-muted-foreground">Baseado no ritmo atual. Não é meta oficial.</p>
        </div>
      )}

      <div className="rounded-2xl border border-border bg-card p-3">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Atual vs {previousLabel(period)}</p>
        <div className="h-52">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={stats.compareBars}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="name" stroke="var(--color-muted-foreground)" fontSize={10} />
              <YAxis stroke="var(--color-muted-foreground)" fontSize={10} allowDecimals={false} />
              <Tooltip contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 8, fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Bar dataKey="anterior" fill="var(--color-muted-foreground)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="atual" fill="var(--color-chart-1)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-3">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Evolução (viáveis)</p>
        <div className="h-44">
          {stats.evolution.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Sem serviços viáveis no período.</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={stats.evolution}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="date" stroke="var(--color-muted-foreground)" fontSize={10} />
                <YAxis stroke="var(--color-muted-foreground)" fontSize={10} allowDecimals={false} />
                <Tooltip contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 8, fontSize: 12 }} />
                <Line type="monotone" dataKey="qty" stroke="var(--color-chart-1)" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <RankList title="Top serviços (viáveis)" items={stats.byType} empty="Sem serviços viáveis." />
      <RankList title="Top motivos de inviabilidade" items={stats.topReasons} empty="Nenhum inviável no período." />
      <RankList title="Complementos mais usados" items={stats.topComps} empty="Nenhum complemento registrado." />
      <RankList title="Impactos recorrentes" items={stats.topImpacts} empty="Nenhum impacto registrado." />

      {stats.bestDay && (
        <div className="rounded-xl border border-border bg-card p-3">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Melhor dia do período</p>
          <p className="text-sm font-semibold">{stats.bestDay.date} — {stats.bestDay.qty} viáveis</p>
        </div>
      )}

      <div className="pt-2">
        <Button
          className="h-12 w-full text-sm font-semibold"
          variant="default"
          onClick={handleExportPdf}
          disabled={pdfLoading}
        >
          {pdfLoading ? (
            <><Loader2 className="mr-2 size-4 animate-spin" /> Gerando PDF…</>
          ) : (
            <><FileDown className="mr-2 size-4" /> Baixar relatório em PDF (paisagem)</>
          )}
        </Button>
        <p className="mt-1 text-center text-[10px] text-muted-foreground">
          Faz o download do arquivo. No app Android, abre a tela de compartilhar após salvar em Documentos.
        </p>
      </div>
    </div>
  );
}

function PaceBar({ current, projected, period }: { current: number; projected: number; period: Period }) {
  const elapsed = elapsedRatio(period);
  const paceRatio = projected > 0 ? Math.min(1, current / projected) : 0;
  const elapsedPct = Math.round(elapsed * 100);
  const paceCount = Math.round(paceRatio * 100);
  const onPace = paceCount >= elapsedPct;
  return (
    <div className="mt-3">
      <div className="mb-1 flex items-center justify-between text-[10px] text-muted-foreground">
        <span>
          Ritmo: <span className="font-semibold text-foreground">{current}</span> de{" "}
          <span className="font-semibold text-foreground">{projected}</span> projetados
        </span>
        <span className={onPace ? "text-success font-semibold" : "text-destructive font-semibold"}>
          {paceCount}% da projeção
        </span>
      </div>
      <div className="relative h-3 overflow-hidden rounded-full bg-muted">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-primary to-primary/70 transition-all"
          style={{ width: `${paceCount}%` }}
        />
        <div
          className="absolute -top-0.5 bottom-[-2px] w-[2px] bg-destructive"
          style={{ left: `${elapsedPct}%` }}
          title={`Tempo decorrido: ${elapsedPct}%`}
        />
      </div>
      <div className="mt-1 flex justify-between text-[9px] text-muted-foreground">
        <span>0%</span>
        <span>Marcador vermelho = {elapsedPct}% do {period === "week" ? "semana" : period === "month" ? "mês" : "ano"} decorrido</span>
        <span>100%</span>
      </div>
    </div>
  );
}

function ProjectionDelta({ projected, previous, currency }: { projected: number; previous: number; currency?: boolean }) {
  const diff = projected - previous;
  const pct = deltaPct(projected, previous);
  const tone = diff > 0 ? "text-success" : diff < 0 ? "text-destructive" : "text-muted-foreground";
  const Icon = diff > 0 ? TrendingUp : diff < 0 ? TrendingDown : Minus;
  const sign = diff > 0 ? "+" : "";
  return (
    <p className={`mt-1 flex items-center gap-1 text-[11px] ${tone}`}>
      <Icon className="size-3" />
      {sign}
      {currency ? formatBRL(diff) : diff}
      {pct !== null && <span className="opacity-70"> ({sign}{pct}%)</span>}
    </p>
  );
}

function Kpi({ label, value, delta, hint, tone, small }: { label: string; value: string; delta?: number | null; hint?: string; tone?: "success" | "destructive" | "primary"; small?: boolean }) {
  const color = tone === "success" ? "text-success" : tone === "destructive" ? "text-destructive" : tone === "primary" ? "text-primary" : "text-foreground";
  const dTone = delta === null || delta === undefined ? "text-muted-foreground" : delta > 0 ? "text-success" : delta < 0 ? "text-destructive" : "text-muted-foreground";
  const Icon = delta === null || delta === undefined ? Minus : delta > 0 ? TrendingUp : delta < 0 ? TrendingDown : Minus;
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={(small ? "text-base" : "text-xl") + " font-bold " + color}>{value}</p>
      {delta !== undefined && delta !== null && (
        <p className={`mt-0.5 flex items-center gap-1 text-[10px] ${dTone}`}>
          <Icon className="size-3" />
          {delta > 0 ? "+" : ""}
          {delta}%
        </p>
      )}
      {hint && <p className="mt-0.5 text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function RankList({ title, items, empty }: { title: string; items: { name: string; qty: number }[]; empty: string }) {
  const top = items.slice(0, 5);
  const max = top[0]?.qty ?? 1;
  return (
    <div className="rounded-2xl border border-border bg-card p-3">
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</p>
      {top.length === 0 ? (
        <p className="py-4 text-center text-xs text-muted-foreground">{empty}</p>
      ) : (
        <ul className="space-y-1.5">
          {top.map((t) => (
            <li key={t.name} className="space-y-1">
              <div className="flex items-baseline justify-between text-xs">
                <span className="truncate pr-2 font-medium">{t.name}</span>
                <span className="tabular-nums text-muted-foreground">{fmtQty(t.qty)}</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(6, (t.qty / max) * 100)}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}