import { createServerFn } from "@tanstack/react-start";

const ADMIN_PASSWORD = "137889";

function assertAdmin(pw: string) {
  if (pw !== ADMIN_PASSWORD) {
    throw new Error("Senha de administrador inválida.");
  }
}

type CrudTable = "tipos_servico" | "motivos_inviabilidade" | "impactos" | "complementos_servico";

const HIDDEN_TEAM_NAMES = new Set(["RIOCERLT-TESTE"]);

export const listTeams = createServerFn({ method: "POST" })
  .inputValidator((data: { adminPassword: string }) => data)
  .handler(async ({ data }) => {
    assertAdmin(data.adminPassword);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("equipes")
      .select("id,team_name,variable_rate,photo_url,collaborator1,collaborator2")
      .order("team_name");
    if (error) throw new Error(error.message);
    return (rows ?? []).filter((r) => !HIDDEN_TEAM_NAMES.has(r.team_name));
  });

export const adminListRows = createServerFn({ method: "POST" })
  .inputValidator((data: { adminPassword: string; table: CrudTable }) => data)
  .handler(async ({ data }) => {
    assertAdmin(data.adminPassword);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from(data.table)
      .select("id,name")
      .eq("active", true)
      .order("name");
    if (error) throw new Error(error.message);
    return (rows ?? []) as { id: string; name: string }[];
  });

export const adminAddRow = createServerFn({ method: "POST" })
  .inputValidator(
    (data: { adminPassword: string; table: CrudTable; name: string }) => data,
  )
  .handler(async ({ data }) => {
    assertAdmin(data.adminPassword);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from(data.table)
      .insert({ team_id: null, name: data.name.trim() });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const adminDeleteRow = createServerFn({ method: "POST" })
  .inputValidator((data: { adminPassword: string; table: CrudTable; id: string }) => data)
  .handler(async ({ data }) => {
    assertAdmin(data.adminPassword);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from(data.table)
      .update({ active: false })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const adminUpdateRate = createServerFn({ method: "POST" })
  .inputValidator((data: { adminPassword: string; teamId: string; rate: number }) => data)
  .handler(async ({ data }) => {
    assertAdmin(data.adminPassword);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("equipes")
      .update({ variable_rate: data.rate })
      .eq("id", data.teamId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const adminCreateTeam = createServerFn({ method: "POST" })
  .inputValidator((data: { adminPassword: string; teamName: string; password: string }) => data)
  .handler(async ({ data }) => {
    assertAdmin(data.adminPassword);
    const slug = data.teamName
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    if (!slug) throw new Error("Nome de equipe inválido.");
    if (data.password.length < 6) throw new Error("Senha precisa ter ao menos 6 caracteres.");
    const email = `${slug}@gpva.local`;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: data.password,
      email_confirm: true,
      user_metadata: { team_name: data.teamName.trim() },
    });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const adminUpdateTeam = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      adminPassword: string;
      teamId: string;
      teamName?: string;
      collaborator1?: string | null;
      collaborator2?: string | null;
    }) => data,
  )
  .handler(async ({ data }) => {
    assertAdmin(data.adminPassword);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const patch: {
      team_name?: string;
      collaborator1?: string | null;
      collaborator2?: string | null;
    } = {};
    if (data.teamName !== undefined) {
      const name = data.teamName.trim();
      if (!name) throw new Error("Nome de equipe inválido.");
      patch.team_name = name;
    }
    if (data.collaborator1 !== undefined) {
      patch.collaborator1 = data.collaborator1?.trim() || null;
    }
    if (data.collaborator2 !== undefined) {
      patch.collaborator2 = data.collaborator2?.trim() || null;
    }
    if (Object.keys(patch).length === 0) return { ok: true as const };
    const { error } = await supabaseAdmin
      .from("equipes")
      .update(patch)
      .eq("id", data.teamId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const adminDeleteTeam = createServerFn({ method: "POST" })
  .inputValidator((data: { adminPassword: string; teamId: string }) => data)
  .handler(async ({ data }) => {
    assertAdmin(data.adminPassword);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Delete team-owned data first (no CASCADE guaranteed).
    const tables = [
      "vinculos_complementos",
      "impactos_expediente",
      "servicos",
      "expedientes",
      "tipos_servico",
      "motivos_inviabilidade",
      "impactos",
      "complementos_servico",
    ] as const;
    for (const t of tables) {
      const { error } = await supabaseAdmin.from(t).delete().eq("team_id", data.teamId);
      if (error) throw new Error(error.message);
    }
    const { error: eqErr } = await supabaseAdmin.from("equipes").delete().eq("id", data.teamId);
    if (eqErr) throw new Error(eqErr.message);
    const { error: authErr } = await supabaseAdmin.auth.admin.deleteUser(data.teamId);
    if (authErr) throw new Error(authErr.message);
    return { ok: true as const };
  });

export const adminTeamsRanking = createServerFn({ method: "POST" })
  .inputValidator((data: { adminPassword: string; year: number; month: number }) => data)
  .handler(async ({ data }) => {
    assertAdmin(data.adminPassword);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: teams, error: teamsErr } = await supabaseAdmin
      .from("equipes")
      .select("id,team_name");
    if (teamsErr) throw new Error(teamsErr.message);
    const HIDDEN_TEAMS = new Set(["RIOCERLT-TESTE"]);
    const visibleTeams = (teams ?? []).filter((t) => !HIDDEN_TEAMS.has(t.team_name));
    const hiddenIds = new Set((teams ?? []).filter((t) => HIDDEN_TEAMS.has(t.team_name)).map((t) => t.id));

    // Compute month range [start, nextMonthStart) in UTC ISO
    const start = new Date(Date.UTC(data.year, data.month - 1, 1)).toISOString();
    const end = new Date(Date.UTC(data.year, data.month, 1)).toISOString();

    // Fetch all services in pages to bypass row limits
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
      const { data: rows, error } = await supabaseAdmin
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

export const adminListShifts = createServerFn({ method: "POST" })
  .inputValidator((data: { adminPassword: string; teamId: string }) => data)
  .handler(async ({ data }) => {
    assertAdmin(data.adminPassword);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("expedientes")
      .select("id,started_at,ended_at,status,report_text")
      .eq("team_id", data.teamId)
      .order("started_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const adminDeleteShift = createServerFn({ method: "POST" })
  .inputValidator((data: { adminPassword: string; shiftId: string }) => data)
  .handler(async ({ data }) => {
    assertAdmin(data.adminPassword);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Cascade manually: vinculos -> servicos -> impactos_expediente -> expediente
    const { data: svcs } = await supabaseAdmin
      .from("servicos").select("id").eq("shift_id", data.shiftId);
    const svcIds = (svcs ?? []).map((s) => s.id);
    if (svcIds.length) {
      const { error } = await supabaseAdmin
        .from("vinculos_complementos").delete().in("servico_id", svcIds);
      if (error) throw new Error(error.message);
    }
    const { error: e1 } = await supabaseAdmin
      .from("servicos").delete().eq("shift_id", data.shiftId);
    if (e1) throw new Error(e1.message);
    const { error: e2 } = await supabaseAdmin
      .from("impactos_expediente").delete().eq("shift_id", data.shiftId);
    if (e2) throw new Error(e2.message);
    const { error: e3 } = await supabaseAdmin
      .from("expedientes").delete().eq("id", data.shiftId);
    if (e3) throw new Error(e3.message);
    return { ok: true as const };
  });

export const adminUpdateShiftReport = createServerFn({ method: "POST" })
  .inputValidator((data: { adminPassword: string; shiftId: string; reportText: string }) => data)
  .handler(async ({ data }) => {
    assertAdmin(data.adminPassword);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("expedientes")
      .update({ report_text: data.reportText })
      .eq("id", data.shiftId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });