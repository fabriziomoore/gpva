// Mobile-safe equivalents of the server functions in
// src/lib/leader.functions.ts. The Capacitor SPA has no server runtime, so
// these run directly against Supabase from the client — RLS + the `leader`
// role policies still enforce authorization.

import { supabase } from "@/integrations/supabase/client";

type Callable<T, I = void> = I extends void
  ? (arg?: undefined) => Promise<T>
  : (arg: { data: I }) => Promise<T>;

export const leaderListTeams: Callable<
  Array<{
    id: string;
    team_name: string;
    variable_rate: number;
    photo_url: string | null;
    collaborator1: string | null;
    collaborator2: string | null;
    setor_id: string | null;
    leader: string | null;
    is_test: boolean | null;
  }>
> = async () => {
  const { data, error } = await supabase
    .from("equipes")
    .select(
      "id,team_name,variable_rate,photo_url,collaborator1,collaborator2,setor_id,leader,is_test",
    )
    .order("team_name");
  if (error) throw new Error(error.message);
  return (data ?? []).filter((r) => !(r as { is_test?: boolean }).is_test);
};

export const leaderTeamsRanking: Callable<
  Array<{
    id: string;
    team_name: string;
    total: number;
    viable: number;
    inviable: number;
    negotiations: number;
    negotiationValue: number;
    byType: Record<string, number>;
  }>,
  { year: number; month: number; day?: number | null }
> = async ({ data }) => {
  const { data: teams, error: teamsErr } = await supabase
    .from("equipes")
    .select("id,team_name,is_test");
  if (teamsErr) throw new Error(teamsErr.message);
  const visibleTeams = (teams ?? []).filter(
    (t) => !(t as { is_test?: boolean }).is_test,
  );
  const hiddenIds = new Set(
    (teams ?? [])
      .filter((t) => (t as { is_test?: boolean }).is_test)
      .map((t) => t.id),
  );

  const TZ_OFFSET_MS = 3 * 60 * 60 * 1000;
  const start = data.day
    ? new Date(Date.UTC(data.year, data.month - 1, data.day) + TZ_OFFSET_MS).toISOString()
    : new Date(Date.UTC(data.year, data.month - 1, 1)).toISOString();
  const end = data.day
    ? new Date(Date.UTC(data.year, data.month - 1, data.day + 1) + TZ_OFFSET_MS).toISOString()
    : new Date(Date.UTC(data.year, data.month, 1)).toISOString();

  const all: Array<{
    team_id: string;
    viable: boolean;
    is_negotiation: boolean;
    service_type_name: string;
    negotiated_value: number | null;
  }> = [];
  const pageSize = 1000;
  let from = 0;
  while (true) {
    const { data: rows, error } = await supabase
      .from("servicos")
      .select("team_id,viable,is_negotiation,service_type_name,negotiated_value")
      .gte("created_at", start)
      .lt("created_at", end)
      .range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    if (!rows?.length) break;
    all.push(...rows.filter((r) => !hiddenIds.has(r.team_id)));
    if (rows.length < pageSize) break;
    from += pageSize;
  }

  return visibleTeams.map((t) => {
    const mine = all.filter((s) => s.team_id === t.id);
    const viable = mine.filter((s) => s.viable).length;
    const inviable = mine.filter((s) => !s.viable).length;
    const negotiations = mine.filter((s) => s.is_negotiation && s.viable).length;
    const negotiationValue = mine
      .filter((s) => s.is_negotiation && s.viable)
      .reduce((sum, s) => sum + (Number(s.negotiated_value) || 0), 0);
    const byType: Record<string, number> = {};
    for (const s of mine) {
      if (!s.viable) continue;
      const k = (s.service_type_name || "").trim();
      if (!k) continue;
      byType[k] = (byType[k] ?? 0) + 1;
    }
    return {
      id: t.id,
      team_name: t.team_name,
      total: mine.length,
      viable,
      inviable,
      negotiations,
      negotiationValue,
      byType,
    };
  });
};

export const leaderListShifts: Callable<
  Array<{
    id: string;
    started_at: string;
    ended_at: string | null;
    status: string;
    report_text: string | null;
  }>,
  { teamId: string }
> = async ({ data }) => {
  const { data: rows, error } = await supabase
    .from("expedientes")
    .select("id,started_at,ended_at,status,report_text")
    .eq("team_id", data.teamId)
    .order("started_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);
  return (rows ?? []) as Array<{
    id: string;
    started_at: string;
    ended_at: string | null;
    status: string;
    report_text: string | null;
  }>;
};