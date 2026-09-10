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
  .inputValidator(
    (data: {
      year: number;
      month: number;
      day?: number | null;
      startISO?: string | null;
      endISO?: string | null;
    }) => data,
  )
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
    const start = data.startISO
      ? data.startISO
      : data.day
        ? new Date(Date.UTC(data.year, data.month - 1, data.day) + TZ_OFFSET_MS).toISOString()
        : new Date(Date.UTC(data.year, data.month - 1, 1)).toISOString();
    const end = data.endISO
      ? data.endISO
      : data.day
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

export type ClientHistoryRow = {
  id: string;
  team_id: string;
  team_name: string;
  registration_number: string | null;
  service_type_name: string;
  is_negotiation: boolean;
  viable: boolean;
  reason_name: string | null;
  negotiated_value: number | null;
  payment_methods: string[] | null;
  valor_a_vista: number | null;
  valor_parcelado: number | null;
  qtd_parcelas: number | null;
  created_at: string;
};

// Histórico completo de um cliente (matrícula): toda negociação e toda
// tentativa inviável já registrada para esse número, de qualquer equipe
// visível ao líder (RLS via operational_visible_team_ids() já restringe
// isso às equipes que ele realmente lidera).
export const leaderClientHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { registrationNumber: string }) => data)
  .handler(async ({ data, context }) => {
    await assertLeader(context);
    const reg = data.registrationNumber.trim();
    if (!reg) return [];
    const { data: rows, error } = await context.supabase
      .from("servicos")
      .select(
        "id,team_id,service_type_name,is_negotiation,viable,reason_name,registration_number,negotiated_value,payment_methods,valor_a_vista,valor_parcelado,qtd_parcelas,created_at,equipes(team_name)",
      )
      .ilike("registration_number", reg)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return (rows ?? []).map((r) => ({
      id: r.id as string,
      team_id: r.team_id as string,
      team_name: (r.equipes as { team_name: string } | null)?.team_name ?? "-",
      registration_number: r.registration_number as string | null,
      service_type_name: r.service_type_name as string,
      is_negotiation: r.is_negotiation as boolean,
      viable: r.viable as boolean,
      reason_name: r.reason_name as string | null,
      negotiated_value: r.negotiated_value as number | null,
      payment_methods: r.payment_methods as string[] | null,
      valor_a_vista: r.valor_a_vista as number | null,
      valor_parcelado: r.valor_parcelado as number | null,
      qtd_parcelas: r.qtd_parcelas as number | null,
      created_at: r.created_at as string,
    }));
  });

// Negociações de um período (dia/mês/ano), opcionalmente filtradas por
// matrícula — para navegar sem precisar saber a matrícula de antemão.
export const leaderNegotiations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: { startISO: string; endISO: string; registrationNumber?: string | null }) => data,
  )
  .handler(async ({ data, context }) => {
    await assertLeader(context);
    const { data: admins } = await context.supabase.rpc("admin_user_ids");
    const adminIds = new Set(((admins ?? []) as string[]));
    const { data: teams, error: teamsErr } = await context.supabase
      .from("equipes")
      .select("id,team_name,is_test");
    if (teamsErr) throw new Error(teamsErr.message);
    const hiddenIds = new Set(
      (teams ?? [])
        .filter((t) => (t as { is_test?: boolean }).is_test || adminIds.has(t.id) || t.team_name.trim().toLowerCase() === ADMIN_TEAM_LOGIN)
        .map((t) => t.id),
    );
    const teamNameById = new Map((teams ?? []).map((t) => [t.id, t.team_name]));
    const reg = data.registrationNumber?.trim();

    type Row = {
      id: string;
      team_id: string;
      service_type_name: string;
      reason_name: string | null;
      registration_number: string | null;
      negotiated_value: number | null;
      payment_methods: string[] | null;
      valor_a_vista: number | null;
      valor_parcelado: number | null;
      qtd_parcelas: number | null;
      created_at: string;
    };
    const all: Row[] = [];
    const pageSize = 1000;
    let from = 0;
    while (true) {
      let query = context.supabase
        .from("servicos")
        .select(
          "id,team_id,service_type_name,reason_name,registration_number,negotiated_value,payment_methods,valor_a_vista,valor_parcelado,qtd_parcelas,created_at",
        )
        .eq("is_negotiation", true)
        .eq("viable", true)
        .gte("created_at", data.startISO)
        .lt("created_at", data.endISO)
        .order("created_at", { ascending: false })
        .range(from, from + pageSize - 1);
      if (reg) query = query.ilike("registration_number", reg);
      const { data: rows, error } = await query;
      if (error) throw new Error(error.message);
      if (!rows?.length) break;
      all.push(...(rows as Row[]).filter((r) => !hiddenIds.has(r.team_id)));
      if (rows.length < pageSize) break;
      from += pageSize;
    }

    return all.map((r) => ({
      id: r.id,
      team_id: r.team_id,
      team_name: teamNameById.get(r.team_id) ?? "-",
      registration_number: r.registration_number,
      service_type_name: r.service_type_name,
      is_negotiation: true,
      viable: true,
      reason_name: r.reason_name,
      negotiated_value: r.negotiated_value,
      payment_methods: r.payment_methods,
      valor_a_vista: r.valor_a_vista,
      valor_parcelado: r.valor_parcelado,
      qtd_parcelas: r.qtd_parcelas,
      created_at: r.created_at,
    })) as ClientHistoryRow[];
  });

export type RecurringIssueRow = {
  registration_number: string;
  reason_name: string;
  count: number;
  last_at: string;
  team_names: string[];
};

// Clientes recorrentes: matrículas com 2+ serviços inviáveis pelo mesmo
// motivo, em qualquer época — o mesmo dado que hoje só aparece dentro do
// PDF (flag "repeat_prev"), aqui de forma proativa e sem precisar buscar
// uma matrícula específica.
export const leaderRecurringIssues = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertLeader(context);
    const { data: admins } = await context.supabase.rpc("admin_user_ids");
    const adminIds = new Set(((admins ?? []) as string[]));
    const { data: teams, error: teamsErr } = await context.supabase
      .from("equipes")
      .select("id,team_name,is_test");
    if (teamsErr) throw new Error(teamsErr.message);
    const hiddenIds = new Set(
      (teams ?? [])
        .filter((t) => (t as { is_test?: boolean }).is_test || adminIds.has(t.id) || t.team_name.trim().toLowerCase() === ADMIN_TEAM_LOGIN)
        .map((t) => t.id),
    );
    const teamNameById = new Map((teams ?? []).map((t) => [t.id, t.team_name]));

    type Row = { team_id: string; registration_number: string | null; reason_name: string | null; created_at: string };
    const all: Row[] = [];
    const pageSize = 1000;
    let from = 0;
    while (true) {
      const { data: rows, error } = await context.supabase
        .from("servicos")
        .select("team_id,registration_number,reason_name,created_at")
        .eq("viable", false)
        .not("registration_number", "is", null)
        .order("created_at", { ascending: false })
        .range(from, from + pageSize - 1);
      if (error) throw new Error(error.message);
      if (!rows?.length) break;
      all.push(...(rows as Row[]).filter((r) => !hiddenIds.has(r.team_id)));
      if (rows.length < pageSize) break;
      from += pageSize;
    }

    type Group = {
      registration_number: string;
      reason_name: string;
      count: number;
      last_at: string;
      team_names: Set<string>;
    };
    const groups = new Map<string, Group>();
    for (const r of all) {
      const reg = (r.registration_number || "").trim();
      const reason = (r.reason_name || "").trim();
      if (!reg || !reason) continue;
      const key = `${reg.toUpperCase()}|${reason.toLowerCase()}`;
      const g = groups.get(key);
      if (g) {
        g.count += 1;
        if (r.created_at > g.last_at) g.last_at = r.created_at;
        g.team_names.add(teamNameById.get(r.team_id) ?? "-");
      } else {
        groups.set(key, {
          registration_number: reg,
          reason_name: reason,
          count: 1,
          last_at: r.created_at,
          team_names: new Set([teamNameById.get(r.team_id) ?? "-"]),
        });
      }
    }

    return Array.from(groups.values())
      .filter((g) => g.count >= 2)
      .sort((a, b) => b.count - a.count || (a.last_at < b.last_at ? 1 : -1))
      .slice(0, 50)
      .map((g) => ({
        registration_number: g.registration_number,
        reason_name: g.reason_name,
        count: g.count,
        last_at: g.last_at,
        team_names: Array.from(g.team_names),
      }));
  });