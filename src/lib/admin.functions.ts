import { createServerFn } from "@tanstack/react-start";

export const ADMIN_PASSWORD = "137889";
export const ADMIN_LOGIN = "adm";
export const ADMIN_EMAIL = `${ADMIN_LOGIN}@gpva.local`;

type TeamIdentity = { id: string; team_name: string; is_test?: boolean | null };

function isReservedAdminTeam(team: TeamIdentity, adminIds: ReadonlySet<string>): boolean {
  return adminIds.has(team.id) || team.team_name.trim().toLowerCase() === ADMIN_LOGIN;
}

function assertAdmin(pw: string) {
  if (pw !== ADMIN_PASSWORD) {
    throw new Error("Senha de administrador inválida.");
  }
}

type CrudTable = "tipos_servico" | "motivos_inviabilidade" | "impactos" | "complementos_servico";

export const listTeams = createServerFn({ method: "POST" })
  .inputValidator((data: { adminPassword: string }) => data)
  .handler(async ({ data }) => {
    assertAdmin(data.adminPassword);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("equipes")
      .select("id,team_name,variable_rate,photo_url,collaborator1,collaborator2,setor_id,leader,is_test")
      .order("team_name");
    if (error) throw new Error(error.message);
    // Exclui contas administrativas (usuários com role admin) da lista de equipes.
    const { data: adminRoles } = await supabaseAdmin
      .from("user_roles")
      .select("user_id")
      .eq("role", "admin");
    const adminIds = new Set((adminRoles ?? []).map((r) => r.user_id));
    return (rows ?? []).filter((r) => !r.is_test && !isReservedAdminTeam(r, adminIds));
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

// Cria (idempotente) a conta de administrador padrão "ADM" / 137889 e
// garante o papel `admin`. Executado a partir do form de login para
// permitir o primeiro acesso sem precisar de dashboard.
export const adminBootstrap = createServerFn({ method: "POST" })
  .inputValidator((data: { adminPassword: string }) => data)
  .handler(async ({ data }) => {
    assertAdmin(data.adminPassword);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Se já existir, apenas garante o papel.
    const list = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (list.error) throw new Error(list.error.message);
    let user = list.data.users.find((u) => u.email === ADMIN_EMAIL);

    if (!user) {
      const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
        email: ADMIN_EMAIL,
        password: ADMIN_PASSWORD,
        email_confirm: true,
        user_metadata: { is_admin: true, display_name: "Administrador" },
      });
      if (error) throw new Error(error.message);
      user = created.user ?? undefined;
    }

    if (user?.id) {
      await supabaseAdmin
        .from("user_roles")
        .upsert({ user_id: user.id, role: "admin" }, { onConflict: "user_id,role" });
    }
    return { ok: true as const, login: ADMIN_LOGIN.toUpperCase() };
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
  .inputValidator((data: { adminPassword: string; teamName: string; password: string; setorId: string; leaderName: string }) => data)
  .handler(async ({ data }) => {
    assertAdmin(data.adminPassword);
    const slug = data.teamName
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    if (!slug) throw new Error("Nome de equipe inválido.");
    if (data.password.length < 6) throw new Error("Senha precisa ter ao menos 6 caracteres.");
    if (!data.setorId) throw new Error("Selecione um setor.");
    const leaderName = data.leaderName.trim();
    if (!leaderName) throw new Error("Informe o nome do líder.");
    const email = `${slug}@gpva.local`;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: data.password,
      email_confirm: true,
      user_metadata: { team_name: data.teamName.trim() },
    });
    if (error) throw new Error(error.message);
    // The handle_new_team trigger creates the equipes row; set setor + leader + onboarded.
    if (created.user?.id) {
      const { error: setorErr } = await supabaseAdmin
        .from("equipes")
        .update({ setor_id: data.setorId, leader: leaderName, onboarded: true })
        .eq("id", created.user.id);
      if (setorErr) throw new Error(setorErr.message);
    }
    return { ok: true as const };
  });

// ============= Conta de Teste =============

export const adminListTestTeams = createServerFn({ method: "POST" })
  .inputValidator((data: { adminPassword: string }) => data)
  .handler(async ({ data }) => {
    assertAdmin(data.adminPassword);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("equipes")
      .select("id,team_name,variable_rate,photo_url,collaborator1,collaborator2,setor_id,leader,is_test")
      .eq("is_test", true)
      .order("team_name");
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const adminCreateTestTeam = createServerFn({ method: "POST" })
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
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: data.password,
      email_confirm: true,
      user_metadata: { team_name: data.teamName.trim() },
    });
    if (error) throw new Error(error.message);
    if (created.user?.id) {
      const { error: upErr } = await supabaseAdmin
        .from("equipes")
        .update({ is_test: true, onboarded: true, leader: "TESTE" })
        .eq("id", created.user.id);
      if (upErr) throw new Error(upErr.message);
    }
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
      setorId?: string;
      leaderName?: string;
    }) => data,
  )
  .handler(async ({ data }) => {
    assertAdmin(data.adminPassword);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const patch: {
      team_name?: string;
      collaborator1?: string | null;
      collaborator2?: string | null;
      setor_id?: string;
      leader?: string;
      onboarded?: boolean;
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
    if (data.setorId !== undefined) {
      if (!data.setorId) throw new Error("Setor obrigatório.");
      patch.setor_id = data.setorId;
    }
    if (data.leaderName !== undefined) {
      const l = data.leaderName.trim();
      if (!l) throw new Error("Informe o nome do líder.");
      patch.leader = l;
      patch.onboarded = true;
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
  .inputValidator(
    (data: {
      adminPassword: string;
      year: number;
      month: number;
      day?: number | null;
      startISO?: string | null;
      endISO?: string | null;
    }) => data,
  )
  .handler(async ({ data }) => {
    assertAdmin(data.adminPassword);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: teams, error: teamsErr } = await supabaseAdmin
      .from("equipes")
      .select("id,team_name,is_test");
    if (teamsErr) throw new Error(teamsErr.message);
    const { data: adminRoles } = await supabaseAdmin
      .from("user_roles")
      .select("user_id")
      .eq("role", "admin");
    const adminIds = new Set((adminRoles ?? []).map((r) => r.user_id));
    const isTest = (t: TeamIdentity) =>
      t.is_test === true || t.team_name === "TESTANDO";
    const visibleTeams = (teams ?? []).filter((t) => !isTest(t) && !isReservedAdminTeam(t, adminIds));
    const hiddenIds = new Set(
      (teams ?? []).filter((t) => isTest(t) || isReservedAdminTeam(t, adminIds)).map((t) => t.id),
    );

    // Range [start, end) — prioridade: startISO/endISO > day > mês inteiro.
    // Ajuste UTC-3 (Brasília) para day range casar com o dia calendário local.
    const TZ_OFFSET_MS = 3 * 60 * 60 * 1000;
    let start: string;
    let end: string;
    if (data.startISO && data.endISO) {
      start = data.startISO;
      end = data.endISO;
    } else if (typeof data.day === "number" && data.day > 0) {
      start = new Date(
        Date.UTC(data.year, data.month - 1, data.day) + TZ_OFFSET_MS,
      ).toISOString();
      end = new Date(
        Date.UTC(data.year, data.month - 1, data.day + 1) + TZ_OFFSET_MS,
      ).toISOString();
    } else {
      start = new Date(Date.UTC(data.year, data.month - 1, 1)).toISOString();
      end = new Date(Date.UTC(data.year, data.month, 1)).toISOString();
    }

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
      .is("deleted_at", null)
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
    // Soft-delete em cascata (vai para a Lixeira, pode ser restaurado pelo admin)
    const deletedAt = new Date().toISOString();
    const { error: eVinc } = await supabaseAdmin
      .from("vinculos_complementos").update({ deleted_at: deletedAt }).eq("shift_id", data.shiftId).is("deleted_at", null);
    if (eVinc) throw new Error(eVinc.message);
    const { error: e1 } = await supabaseAdmin
      .from("servicos").update({ deleted_at: deletedAt }).eq("shift_id", data.shiftId).is("deleted_at", null);
    if (e1) throw new Error(e1.message);
    const { error: e2 } = await supabaseAdmin
      .from("impactos_expediente").update({ deleted_at: deletedAt }).eq("shift_id", data.shiftId).is("deleted_at", null);
    if (e2) throw new Error(e2.message);
    const { error: e3 } = await supabaseAdmin
      .from("expedientes").update({ deleted_at: deletedAt }).eq("id", data.shiftId).is("deleted_at", null);
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

// ============= Líderes =============

function sanitizeLogin(login: string): string {
  const slug = login
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!slug) throw new Error("Login inválido.");
  if (slug.length < 3) throw new Error("Login precisa ter ao menos 3 caracteres.");
  return slug;
}

export const adminCreateLeader = createServerFn({ method: "POST" })
  .inputValidator((data: { adminPassword: string; leaderName: string; login: string; password: string }) => data)
  .handler(async ({ data }) => {
    assertAdmin(data.adminPassword);
    if (data.password.length < 6) throw new Error("Senha precisa ter ao menos 6 caracteres.");
    const slug = sanitizeLogin(data.login);
    const email = `${slug}@gpva.local`;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: data.password,
      email_confirm: true,
      user_metadata: { is_leader: true, display_name: data.leaderName.trim() },
    });
    if (error) throw new Error(error.message);
    // O trigger handle_new_team já grava o papel; garantia extra:
    if (created.user?.id) {
      await supabaseAdmin
        .from("user_roles")
        .upsert({ user_id: created.user.id, role: "leader" }, { onConflict: "user_id,role" });
    }
    return { ok: true as const, login: slug.toUpperCase() };
  });

export const adminListLeaders = createServerFn({ method: "POST" })
  .inputValidator((data: { adminPassword: string }) => data)
  .handler(async ({ data }) => {
    assertAdmin(data.adminPassword);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: roles, error } = await supabaseAdmin
      .from("user_roles")
      .select("user_id,created_at")
      .eq("role", "leader");
    if (error) throw new Error(error.message);
    const ids = (roles ?? []).map((r) => r.user_id);
    if (ids.length === 0) return [];
    // Fetch emails via admin API
    const list = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (list.error) throw new Error(list.error.message);
    const byId = new Map(list.data.users.map((u) => [u.id, u]));
    return ids
      .map((id) => {
        const u = byId.get(id);
        if (!u) return null;
        const display = (u.user_metadata as { display_name?: string } | null)?.display_name ?? "";
        return {
          id,
          email: u.email ?? "",
          login: (u.email ?? "").split("@")[0].toUpperCase(),
          display_name: display,
        };
      })
      .filter((x): x is { id: string; email: string; login: string; display_name: string } => !!x)
      .sort((a, b) => a.login.localeCompare(b.login));
  });

export const adminDeleteLeader = createServerFn({ method: "POST" })
  .inputValidator((data: { adminPassword: string; leaderId: string }) => data)
  .handler(async ({ data }) => {
    assertAdmin(data.adminPassword);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.leaderId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

// ============= Setores =============

export type SetorRow = {
  id: string;
  nome: string;
  supervisor_nome: string;
};

export const adminListSetores = createServerFn({ method: "POST" })
  .inputValidator((data: { adminPassword: string }) => data)
  .handler(async ({ data }): Promise<SetorRow[]> => {
    assertAdmin(data.adminPassword);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("setores")
      .select("id,nome,supervisor_nome")
      .order("nome");
    if (error) throw new Error(error.message);
    return (rows ?? []) as SetorRow[];
  });

export const adminCreateSetor = createServerFn({ method: "POST" })
  .inputValidator((data: { adminPassword: string; nome: string; supervisorNome: string }) => data)
  .handler(async ({ data }) => {
    assertAdmin(data.adminPassword);
    const nome = data.nome.trim();
    if (!nome) throw new Error("Nome do setor obrigatório.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("setores")
      .insert({ nome, supervisor_nome: data.supervisorNome.trim() });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const adminUpdateSetor = createServerFn({ method: "POST" })
  .inputValidator((data: { adminPassword: string; setorId: string; nome?: string; supervisorNome?: string }) => data)
  .handler(async ({ data }) => {
    assertAdmin(data.adminPassword);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const patch: { nome?: string; supervisor_nome?: string } = {};
    if (data.nome !== undefined) {
      const nome = data.nome.trim();
      if (!nome) throw new Error("Nome do setor obrigatório.");
      patch.nome = nome;
    }
    if (data.supervisorNome !== undefined) patch.supervisor_nome = data.supervisorNome.trim();
    if (Object.keys(patch).length === 0) return { ok: true as const };
    const { error } = await supabaseAdmin
      .from("setores")
      .update(patch)
      .eq("id", data.setorId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const adminDeleteSetor = createServerFn({ method: "POST" })
  .inputValidator((data: { adminPassword: string; setorId: string }) => data)
  .handler(async ({ data }) => {
    assertAdmin(data.adminPassword);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Bloqueia se ainda existirem equipes vinculadas
    const { count, error: countErr } = await supabaseAdmin
      .from("equipes")
      .select("id", { count: "exact", head: true })
      .eq("setor_id", data.setorId);
    if (countErr) throw new Error(countErr.message);
    if ((count ?? 0) > 0) throw new Error("Setor possui equipes vinculadas. Mova as equipes antes de excluir.");
    const { error } = await supabaseAdmin
      .from("setores")
      .delete()
      .eq("id", data.setorId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

// ============= Serviços do Mapa =============

export type MapServiceRow = {
  id: string;
  created_at: string;
  team_id: string;
  team_name: string;
  lat: number | null;
  lng: number | null;
  viable: boolean;
  is_negotiation: boolean;
  service_type_name: string | null;
  negotiated_value: number | null;
  registration_number: string | null;
};

export const adminListMapServices = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      adminPassword: string;
      teamId?: string;
      startISO?: string;
      endISO?: string;
      limit?: number;
    }) => data,
  )
  .handler(async ({ data }): Promise<MapServiceRow[]> => {
    assertAdmin(data.adminPassword);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = supabaseAdmin
      .from("servicos")
      .select(
        "id,created_at,team_id,lat,lng,viable,is_negotiation,service_type_name,negotiated_value,registration_number",
      )
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(Math.min(Number(data.limit) || 500, 2000));
    if (data.teamId) q = q.eq("team_id", data.teamId);
    if (data.startISO) q = q.gte("created_at", data.startISO);
    if (data.endISO) q = q.lt("created_at", data.endISO);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const teamIds = Array.from(new Set((rows ?? []).map((r) => r.team_id).filter(Boolean)));
    const teamMap = new Map<string, string>();
    if (teamIds.length) {
      const { data: tRows } = await supabaseAdmin
        .from("equipes")
        .select("id,team_name")
        .in("id", teamIds);
      for (const t of tRows ?? []) teamMap.set(t.id, t.team_name);
    }
    return (rows ?? []).map((r) => ({
      ...r,
      team_name: teamMap.get(r.team_id) ?? "—",
    })) as MapServiceRow[];
  });

export const adminDeleteMapService = createServerFn({ method: "POST" })
  .inputValidator((data: { adminPassword: string; id: string }) => data)
  .handler(async ({ data }) => {
    assertAdmin(data.adminPassword);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const deletedAt = new Date().toISOString();
    await supabaseAdmin.from("vinculos_complementos").update({ deleted_at: deletedAt }).eq("service_id", data.id).is("deleted_at", null);
    const { error } = await supabaseAdmin.from("servicos").update({ deleted_at: deletedAt }).eq("id", data.id).is("deleted_at", null);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const adminDeleteMapServicesRange = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      adminPassword: string;
      teamId?: string;
      startISO?: string;
      endISO?: string;
    }) => data,
  )
  .handler(async ({ data }) => {
    assertAdmin(data.adminPassword);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = supabaseAdmin.from("servicos").select("id");
    if (data.teamId) q = q.eq("team_id", data.teamId);
    if (data.startISO) q = q.gte("created_at", data.startISO);
    if (data.endISO) q = q.lt("created_at", data.endISO);
    q = q.is("deleted_at", null);
    const { data: rows, error: e1 } = await q;
    if (e1) throw new Error(e1.message);
    const ids = (rows ?? []).map((r) => r.id);
    if (!ids.length) return { ok: true as const, deleted: 0 };
    const deletedAt = new Date().toISOString();
    await supabaseAdmin.from("vinculos_complementos").update({ deleted_at: deletedAt }).in("service_id", ids).is("deleted_at", null);
    const { error } = await supabaseAdmin.from("servicos").update({ deleted_at: deletedAt }).in("id", ids).is("deleted_at", null);
    if (error) throw new Error(error.message);
    return { ok: true as const, deleted: ids.length };
  });

// ============= Devices (sessões ativas) =============

export type DeviceRow = {
  user_id: string;
  session_id: string;
  user_agent: string | null;
  last_seen_at: string;
  updated_at: string;
  account_label: string;
  account_kind: "admin" | "leader" | "team" | "unknown";
};

export const adminListDevices = createServerFn({ method: "POST" })
  .inputValidator((data: { adminPassword: string }) => data)
  .handler(async ({ data }): Promise<DeviceRow[]> => {
    assertAdmin(data.adminPassword);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: sessions, error } = await supabaseAdmin
      .from("active_sessions")
      .select("user_id,session_id,user_agent,last_seen_at,updated_at")
      .order("last_seen_at", { ascending: false });
    if (error) throw new Error(error.message);
    const rows = sessions ?? [];
    if (!rows.length) return [];
    const ids = rows.map((r) => r.user_id);
    const [{ data: teams }, { data: roles }, usersList] = await Promise.all([
      supabaseAdmin.from("equipes").select("id,team_name").in("id", ids),
      supabaseAdmin.from("user_roles").select("user_id,role").in("user_id", ids),
      supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    ]);
    const teamMap = new Map((teams ?? []).map((t) => [t.id, t.team_name]));
    const roleMap = new Map<string, string>();
    for (const r of roles ?? []) roleMap.set(r.user_id, r.role);
    const userMap = new Map<string, string>();
    if (!usersList.error) {
      for (const u of usersList.data.users) userMap.set(u.id, u.email ?? "");
    }
    return rows.map((r) => {
      const role = roleMap.get(r.user_id);
      let account_kind: DeviceRow["account_kind"] = "unknown";
      let account_label = teamMap.get(r.user_id) ?? "";
      if (role === "admin") { account_kind = "admin"; account_label = "Administrador"; }
      else if (role === "leader") {
        account_kind = "leader";
        const email = userMap.get(r.user_id) ?? "";
        account_label = `Líder — ${email.split("@")[0].toUpperCase()}`;
      } else if (account_label) {
        account_kind = "team";
      } else {
        account_label = userMap.get(r.user_id) ?? r.user_id.slice(0, 8);
      }
      return { ...r, account_label, account_kind };
    });
  });

export const adminSignOutDevice = createServerFn({ method: "POST" })
  .inputValidator((data: { adminPassword: string; userId: string }) => data)
  .handler(async ({ data }) => {
    assertAdmin(data.adminPassword);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("active_sessions")
      .delete()
      .eq("user_id", data.userId);
    if (error) throw new Error(error.message);
    // Também revoga os refresh tokens do usuário — força re-login em todas as abas.
    try {
      await supabaseAdmin.auth.admin.signOut(data.userId, "global");
    } catch {
      /* best-effort */
    }
    return { ok: true as const };
  });