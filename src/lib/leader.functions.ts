import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ADMIN_TEAM_LOGIN = "adm";

async function assertLeader(context: {
  supabase: import("@supabase/supabase-js").SupabaseClient;
  userId: string;
}) {
  const { data, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "leader",
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden");
}

export const leaderListTeams = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertLeader(context);
    const { data: admins } = await context.supabase.rpc("admin_user_ids");
    const adminIds = new Set(((admins ?? []) as string[]));
    const { data, error } = await context.supabase
      .from("equipes")
      .select(
        "id,team_name,variable_rate,photo_url,collaborator1,collaborator2,setor_id,leader,is_test",
      )
      .order("team_name");
    if (error) throw new Error(error.message);
    return (data ?? []).filter(
      (r) => !(r as { is_test?: boolean }).is_test && !adminIds.has(r.id) && r.team_name.trim().toLowerCase() !== ADMIN_TEAM_LOGIN,
    );
  });

export const leaderTeamsRanking = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { year: number; month: number; day?: number | null }) => data)
  .handler(async ({ data, context }) => {
    await assertLeader(context);
    const { data: admins } = await context.supabase.rpc("admin_user_ids");
    const adminIds = new Set(((admins ?? []) as string[]));
    const { data: teams, error: teamsErr } = await context.supabase
      .from("equipes")
      .select("id,team_name,is_test");
    if (teamsErr) throw new Error(teamsErr.message);
    const visibleTeams = (teams ?? []).filter(
      (t) => !(t as { is_test?: boolean }).is_test && !adminIds.has(t.id) && t.team_name.trim().toLowerCase() !== ADMIN_TEAM_LOGIN,
    );
    const hiddenIds = new Set(
      (teams ?? [])
        .filter((t) => (t as { is_test?: boolean }).is_test || adminIds.has(t.id) || t.team_name.trim().toLowerCase() === ADMIN_TEAM_LOGIN)
        .map((t) => t.id),
    );

    // Boundaries em horário de Brasília (UTC-3) para "dia" corresponder ao dia local.
    const TZ_OFFSET_MS = 3 * 60 * 60 * 1000;
    const start = data.day
      ? new Date(Date.UTC(data.year, data.month - 1, data.day) + TZ_OFFSET_MS).toISOString()
      : new Date(Date.UTC(data.year, data.month - 1, 1)).toISOString();
    const end = data.day
      ? new Date(Date.UTC(data.year, data.month - 1, data.day + 1) + TZ_OFFSET_MS).toISOString()
      : new Date(Date.UTC(data.year, data.month, 1)).toISOString();

    const all: {
      team_id: string;
      viable: boolean;
      is_negotiation: boolean;
      service_type_name: string;
      negotiated_value: number | null;
    }[] = [];
    const pageSize = 1000;
    let from = 0;
    while (true) {
      const { data: rows, error } = await context.supabase
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
  });

export const leaderListShifts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { teamId: string }) => data)
  .handler(async ({ data, context }) => {
    await assertLeader(context);
    const { data: rows, error } = await context.supabase
      .from("expedientes")
      .select("id,started_at,ended_at,status,report_text")
      .eq("team_id", data.teamId)
      .order("started_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });