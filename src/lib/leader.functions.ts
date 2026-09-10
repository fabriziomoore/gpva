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
        "id,team_name,variable_rate,photo_url,collaborator1,collaborator2,setor_id,leader,supervisor,is_test,supervisores(nome)",
      )
      .order("team_name");
    if (error) throw new Error(error.message);
    return (data ?? [])
      .filter(
        (r) => !(r as { is_test?: boolean }).is_test && !adminIds.has(r.id) && r.team_name.trim().toLowerCase() !== ADMIN_TEAM_LOGIN,
      )
      .map((r) => ({
        ...r,
        supervisor: (r.supervisores as { nome: string } | null)?.nome || r.supervisor,
      }));
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

export type ShiftServiceRow = {
  service_type_name: string;
  is_negotiation: boolean;
  viable: boolean;
  reason_name: string | null;
  registration_number: string | null;
  negotiated_value: number | null;
};

// Serviços/complementos/impactos de um expediente ainda ABERTO — usado pra
// montar uma prévia do relatório em tempo real (o texto final só é gerado
// e salvo quando a equipe finaliza o expediente).
export const leaderShiftServices = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { shiftId: string }) => data)
  .handler(async ({ data, context }) => {
    await assertLeader(context);
    const [servicesRes, linksRes, impactsRes] = await Promise.all([
      context.supabase
        .from("servicos")
        .select("service_type_name,is_negotiation,viable,reason_name,registration_number,negotiated_value")
        .eq("shift_id", data.shiftId),
      context.supabase
        .from("vinculos_complementos")
        .select("complement_name")
        .eq("shift_id", data.shiftId),
      context.supabase
        .from("impactos_expediente")
        .select("impact_name")
        .eq("shift_id", data.shiftId),
    ]);
    if (servicesRes.error) throw new Error(servicesRes.error.message);
    if (linksRes.error) throw new Error(linksRes.error.message);
    if (impactsRes.error) throw new Error(impactsRes.error.message);
    return {
      services: servicesRes.data ?? [],
      complements: linksRes.data ?? [],
      impacts: impactsRes.data ?? [],
    };
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
// tentativa inviável já registrada para esse número, de QUALQUER equipe —
// serve de consulta pra saber se outra equipe já esteve lá, como terminou
// e se o cliente costuma negociar. Usa a função client_history() (security
// definer) porque esse cruzamento não respeita o RLS normal por equipe.
export const leaderClientHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { registrationNumber: string }) => data)
  .handler(async ({ data, context }) => {
    const reg = data.registrationNumber.trim();
    if (!reg) return [];
    const { data: rows, error } = await context.supabase.rpc("client_history", {
      p_registration: reg,
    });
    if (error) throw new Error(error.message);
    return (rows ?? []) as ClientHistoryRow[];
  });

// Negociações de um período (dia/mês/ano), opcionalmente filtradas por
// matrícula — pra navegar sem precisar saber a matrícula de antemão.
// Mesma lógica cross-equipe da função acima (negotiations_in_period).
export const leaderNegotiations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: { startISO: string; endISO: string; registrationNumber?: string | null }) => data,
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase.rpc("negotiations_in_period", {
      p_start: data.startISO,
      p_end: data.endISO,
      p_registration: data.registrationNumber?.trim() || undefined,
    });
    if (error) throw new Error(error.message);
    return (rows ?? []).map((r) => ({
      ...r,
      is_negotiation: true,
      viable: true,
      reason_name: null,
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
// motivo, em qualquer época e de qualquer equipe — o mesmo dado que hoje só
// aparece dentro do PDF (flag "repeat_prev"), aqui de forma proativa.
export const leaderRecurringIssues = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: rows, error } = await context.supabase.rpc("recurring_issues");
    if (error) throw new Error(error.message);
    return (rows ?? []).map((r) => ({
      registration_number: r.registration_number,
      reason_name: r.reason_name,
      count: Number(r.cnt),
      last_at: r.last_at,
      team_names: r.team_names ?? [],
    })) as RecurringIssueRow[];
  });