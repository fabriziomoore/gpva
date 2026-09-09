import { createServerFn } from "@tanstack/react-start";

export const ADMIN_PASSWORD = "F13788932716a@";
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

// Cliente administrativo (service_role) — tipo derivado do módulo server-only.
type AdminClient = typeof import("@/integrations/supabase/client.server")["supabaseAdmin"];

/**
 * Validação hierárquica server-side (SETOR → SUPERVISOR → LÍDER).
 * Nenhum UUID é inferido por texto: todos os identificadores chegam prontos da UI
 * e são conferidos contra as tabelas normalizadas antes de qualquer escrita.
 */
async function assertHierarchy(
  sb: AdminClient,
  input: { setorId: string; supervisorId?: string | null; leaderId?: string | null },
): Promise<void> {
  const setorId = input.setorId?.trim();
  if (!setorId) throw new Error("Selecione um setor.");

  const { data: setor, error: setorErr } = await sb
    .from("setores")
    .select("id")
    .eq("id", setorId)
    .maybeSingle();
  if (setorErr) throw new Error(setorErr.message);
  if (!setor) throw new Error("Setor não encontrado.");

  const supervisorId = input.supervisorId?.trim() || null;
  const leaderId = input.leaderId?.trim() || null;

  if (leaderId && !supervisorId) {
    throw new Error("Selecione um supervisor antes de escolher o líder.");
  }

  if (supervisorId) {
    const { data: sup, error } = await sb
      .from("supervisores")
      .select("id")
      .eq("id", supervisorId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!sup) throw new Error("Supervisor não encontrado.");
    const { data: link, error: linkErr } = await sb
      .from("supervisor_setores")
      .select("supervisor_id")
      .eq("supervisor_id", supervisorId)
      .eq("setor_id", setorId)
      .maybeSingle();
    if (linkErr) throw new Error(linkErr.message);
    if (!link) {
      throw new Error("O supervisor selecionado não pertence ao setor escolhido.");
    }
  }

  if (leaderId) {
    const { data: lider, error } = await sb
      .from("lideres_estrutura")
      .select("id,supervisor_id")
      .eq("id", leaderId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!lider) throw new Error("Líder não encontrado na estrutura operacional.");
    const { data: liderLink, error: liderLinkErr } = await sb
      .from("lider_setores")
      .select("lider_id")
      .eq("lider_id", leaderId)
      .eq("setor_id", setorId)
      .maybeSingle();
    if (liderLinkErr) throw new Error(liderLinkErr.message);
    if (!liderLink) {
      throw new Error("O líder selecionado não pertence ao setor escolhido.");
    }
    if (lider.supervisor_id !== supervisorId) {
      throw new Error("O líder selecionado não pertence ao supervisor escolhido.");
    }
  }
}

export const listTeams = createServerFn({ method: "POST" })
  .inputValidator((data: { adminPassword: string }) => data)
  .handler(async ({ data }) => {
    assertAdmin(data.adminPassword);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("equipes")
      .select("id,team_name,variable_rate,photo_url,collaborator1,collaborator2,setor_id,supervisor_id,leader_id,supervisor,leader,is_test")
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

// Cria (idempotente) a conta de administrador padrão "ADM" / ADMIN_PASSWORD e
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
  .inputValidator(
    (data: {
      adminPassword: string;
      teamName: string;
      password: string;
      setorId: string;
      supervisorId: string;
      leaderId: string;
      collaborator1?: string | null;
      collaborator2?: string | null;
    }) => data,
  )
  .handler(async ({ data }) => {
    assertAdmin(data.adminPassword);
    const slug = data.teamName
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    if (!slug) throw new Error("Nome de equipe inválido.");
    if (data.password.length < 6) throw new Error("Senha precisa ter ao menos 6 caracteres.");
    if (!data.supervisorId) throw new Error("Selecione um supervisor.");
    if (!data.leaderId) throw new Error("Selecione um líder.");
    const email = `${slug}@gpva.local`;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Valida a hierarquia ANTES de criar qualquer conta.
    await assertHierarchy(supabaseAdmin, {
      setorId: data.setorId,
      supervisorId: data.supervisorId,
      leaderId: data.leaderId,
    });
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: data.password,
      email_confirm: true,
      user_metadata: { team_name: data.teamName.trim() },
    });
    if (error) {
      const m = String(error.message || "");
      if (/already been registered|already exists|duplicate/i.test(m)) {
        throw new Error(`Já existe uma equipe com o login "${slug}". Escolha outro nome.`);
      }
      throw new Error(m);
    }
    // O trigger handle_new_team cria a linha em `equipes`; aqui gravamos apenas
    // os UUIDs estruturais em um único UPDATE. Nunca escrevemos `supervisor`/`leader`
    // (strings históricas preservadas pela A4.2).
    const newId = created.user?.id;
    if (newId) {
      const { error: structErr } = await supabaseAdmin
        .from("equipes")
        .update({
          setor_id: data.setorId,
          supervisor_id: data.supervisorId,
          leader_id: data.leaderId,
          onboarded: true,
          collaborator1: data.collaborator1?.trim() || null,
          collaborator2: data.collaborator2?.trim() || null,
        })
        .eq("id", newId);
      if (structErr) {
        // Compensação: remove a conta recém-criada para não deixar equipe órfã.
        const { error: undoErr } = await supabaseAdmin.auth.admin.deleteUser(newId);
        if (undoErr) {
          throw new Error(
            `ERRO CRÍTICO: equipe criada (${newId}) mas a estrutura falhou (${structErr.message}) e a reversão também falhou (${undoErr.message}). Intervenção manual necessária.`,
          );
        }
        throw new Error(`${structErr.message} (conta revertida)`);
      }
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
      supervisorId?: string;
      leaderId?: string;
      password?: string;
    }) => data,
  )
  .handler(async ({ data }) => {
    assertAdmin(data.adminPassword);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (data.password !== undefined) {
      if (data.password.length < 6) throw new Error("Senha precisa ter ao menos 6 caracteres.");
      const { error: pwErr } = await supabaseAdmin.auth.admin.updateUserById(data.teamId, {
        password: data.password,
      });
      if (pwErr) throw new Error(pwErr.message);
    }
    const patch: {
      team_name?: string;
      collaborator1?: string | null;
      collaborator2?: string | null;
      setor_id?: string;
      supervisor_id?: string;
      leader_id?: string;
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
    // O trio estrutural é sempre exigido em conjunto — nunca parcial.
    const structuralTouched =
      data.setorId !== undefined || data.supervisorId !== undefined || data.leaderId !== undefined;
    if (structuralTouched) {
      const setorId = data.setorId?.trim();
      const supervisorId = data.supervisorId?.trim();
      const leaderId = data.leaderId?.trim();
      if (!setorId || !supervisorId || !leaderId) {
        throw new Error("Informe Setor, Supervisor e Líder em conjunto.");
      }
      await assertHierarchy(supabaseAdmin, { setorId, supervisorId, leaderId });
      patch.setor_id = setorId;
      patch.supervisor_id = supervisorId;
      patch.leader_id = leaderId;
      patch.onboarded = true;
    }
    if (Object.keys(patch).length === 0) return { ok: true as const };
    // UPDATE único: nunca escreve `supervisor`/`leader` (strings históricas da A4.2).
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
      .select("id,team_name,is_test,leader,setores(nome)");
    if (teamsErr) throw new Error(teamsErr.message);
    type TeamWithSetor = TeamIdentity & { leader: string | null; setores: { nome: string } | null };
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
        .is("deleted_at", null)
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
      const tt = t as unknown as TeamWithSetor;
      return {
        id: t.id,
        team_name: t.team_name,
        setor_nome: tt.setores?.nome ?? null,
        leader_name: tt.leader?.trim() || null,
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

export type LeaderRow = {
  user_id: string;
  leader_structure_id: string | null;
  nome: string;
  login: string;
  email: string;
  setor_ids: string[];
  setor_nomes: string[];
  supervisor_id: string | null;
  supervisor_nome: string | null;
  estrutura_normalizada: boolean;
};

export const adminCreateLeader = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      adminPassword: string;
      leaderName: string;
      login: string;
      password: string;
      setorIds: string[];
      supervisorId: string;
    }) => data,
  )
  .handler(async ({ data }) => {
    assertAdmin(data.adminPassword);
    if (data.password.length < 6) throw new Error("Senha precisa ter ao menos 6 caracteres.");
    const nome = data.leaderName.trim();
    if (!nome) throw new Error("Informe o nome do líder.");
    const setorIds = Array.from(new Set(data.setorIds.filter(Boolean)));
    if (setorIds.length === 0) throw new Error("Selecione ao menos um setor.");
    const slug = sanitizeLogin(data.login);
    const email = `${slug}@gpva.local`;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    for (const setorId of setorIds) {
      await assertHierarchy(supabaseAdmin, { setorId, supervisorId: data.supervisorId });
    }
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: data.password,
      email_confirm: true,
      user_metadata: { is_leader: true, display_name: nome },
    });
    if (error) throw new Error(error.message);
    const newId = created.user?.id;
    if (newId) {
      try {
        const { error: roleErr } = await supabaseAdmin
          .from("user_roles")
          .upsert({ user_id: newId, role: "leader" }, { onConflict: "user_id,role" });
        if (roleErr) throw new Error(roleErr.message);
        const { data: struct, error: structErr } = await supabaseAdmin
          .from("lideres_estrutura")
          .insert({
            user_id: newId,
            nome,
            supervisor_id: data.supervisorId,
          })
          .select("id")
          .single();
        if (structErr) throw new Error(structErr.message);
        const { error: linkErr } = await supabaseAdmin
          .from("lider_setores")
          .insert(setorIds.map((setor_id) => ({ lider_id: struct.id, setor_id })));
        if (linkErr) throw new Error(linkErr.message);
      } catch (e) {
        const original = (e as Error).message;
        // Compensação best-effort da criação parcial.
        await supabaseAdmin.from("lideres_estrutura").delete().eq("user_id", newId);
        await supabaseAdmin.from("user_roles").delete().eq("user_id", newId).eq("role", "leader");
        const { error: undoErr } = await supabaseAdmin.auth.admin.deleteUser(newId);
        if (undoErr) {
          throw new Error(
            `ERRO CRÍTICO: conta de líder ${newId} criada mas incompleta (${original}) e a reversão falhou (${undoErr.message}). Intervenção manual necessária.`,
          );
        }
        throw new Error(`${original} (conta revertida)`);
      }
    }
    return { ok: true as const, login: slug.toUpperCase() };
  });

export const adminListLeaders = createServerFn({ method: "POST" })
  .inputValidator((data: { adminPassword: string }) => data)
  .handler(async ({ data }): Promise<LeaderRow[]> => {
    assertAdmin(data.adminPassword);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: roles, error } = await supabaseAdmin
      .from("user_roles")
      .select("user_id,created_at")
      .eq("role", "leader");
    if (error) throw new Error(error.message);
    const ids = (roles ?? []).map((r) => r.user_id);
    if (ids.length === 0) return [];

    const { data: estruturas, error: estErr } = await supabaseAdmin
      .from("lideres_estrutura")
      .select("id,user_id,nome,supervisor_id,supervisores(nome),lider_setores(setor_id,setores(nome))")
      .in("user_id", ids);
    if (estErr) throw new Error(estErr.message);
    type EstruturaJoin = {
      id: string;
      user_id: string;
      nome: string;
      supervisor_id: string;
      supervisores: { nome: string } | null;
      lider_setores: { setor_id: string; setores: { nome: string } | null }[] | null;
    };
    const byUser = new Map<string, EstruturaJoin>(
      ((estruturas ?? []) as unknown as EstruturaJoin[]).map((e) => [e.user_id, e]),
    );

    const list = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (list.error) throw new Error(list.error.message);
    const byId = new Map(list.data.users.map((u) => [u.id, u]));

    return ids
      .map((id): LeaderRow | null => {
        const u = byId.get(id);
        if (!u) return null;
        const display = (u.user_metadata as { display_name?: string } | null)?.display_name ?? "";
        const est = byUser.get(id) ?? null;
        return {
          user_id: id,
          leader_structure_id: est?.id ?? null,
          nome: est?.nome || display,
          email: u.email ?? "",
          login: (u.email ?? "").split("@")[0].toUpperCase(),
          setor_ids: (est?.lider_setores ?? []).map((s) => s.setor_id),
          setor_nomes: (est?.lider_setores ?? []).map((s) => s.setores?.nome ?? "").filter(Boolean),
          supervisor_id: est?.supervisor_id ?? null,
          supervisor_nome: est?.supervisores?.nome ?? null,
          estrutura_normalizada: !!est,
        };
      })
      .filter((x): x is LeaderRow => !!x)
      .sort((a, b) => a.login.localeCompare(b.login));
  });

export const adminUpdateLeader = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      adminPassword: string;
      leaderStructureId: string;
      nome?: string;
      setorIds?: string[];
      supervisorId?: string;
      newLogin?: string;
      newPassword?: string;
    }) => data,
  )
  .handler(async ({ data }) => {
    assertAdmin(data.adminPassword);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: atual, error: getErr } = await supabaseAdmin
      .from("lideres_estrutura")
      .select("id,user_id,supervisor_id")
      .eq("id", data.leaderStructureId)
      .maybeSingle();
    if (getErr) throw new Error(getErr.message);
    if (!atual) throw new Error("Líder não encontrado na estrutura operacional.");

    if (data.newLogin !== undefined) {
      const slug = sanitizeLogin(data.newLogin);
      if (!slug || slug.length < 3) throw new Error("Login inválido.");
      const { error } = await supabaseAdmin.auth.admin.updateUserById(atual.user_id, {
        email: `${slug}@gpva.local`,
      });
      if (error) throw new Error(error.message);
    }

    if (data.newPassword !== undefined) {
      if (data.newPassword.length < 6) throw new Error("Senha precisa ter ao menos 6 caracteres.");
      const { error } = await supabaseAdmin.auth.admin.updateUserById(atual.user_id, {
        password: data.newPassword,
      });
      if (error) throw new Error(error.message);
    }

    if (data.nome !== undefined) {
      const nome = data.nome.trim();
      if (!nome) throw new Error("Nome do líder obrigatório.");
      const { error } = await supabaseAdmin
        .from("lideres_estrutura")
        .update({ nome })
        .eq("id", atual.id);
      if (error) throw new Error(error.message);
    }

    const structuralTouched = data.setorIds !== undefined || data.supervisorId !== undefined;
    if (structuralTouched) {
      const supervisorId = data.supervisorId?.trim() || atual.supervisor_id;
      const desiredSetorIds = Array.from(new Set((data.setorIds ?? []).filter(Boolean)));
      if (!supervisorId || desiredSetorIds.length === 0) {
        throw new Error("Informe Setor(es) e Supervisor em conjunto.");
      }

      const { data: existingRows, error: exErr } = await supabaseAdmin
        .from("lider_setores")
        .select("setor_id")
        .eq("lider_id", atual.id);
      if (exErr) throw new Error(exErr.message);
      const currentSetorIds = (existingRows ?? []).map((r) => r.setor_id);
      const supervisorChanged = supervisorId !== atual.supervisor_id;
      const toAdd = desiredSetorIds.filter((id) => !currentSetorIds.includes(id));
      const toRemove = currentSetorIds.filter((id) => !desiredSetorIds.includes(id));

      // Trocar de supervisor exige não ter nenhuma equipe vinculada (o
      // vínculo inteiro do líder muda de contexto). Remover só um setor
      // específico exige apenas que não haja equipe do líder nesse setor.
      if (supervisorChanged) {
        const { count, error: cErr } = await supabaseAdmin
          .from("equipes")
          .select("id", { count: "exact", head: true })
          .eq("leader_id", atual.id);
        if (cErr) throw new Error(cErr.message);
        if ((count ?? 0) > 0) {
          throw new Error(
            "O líder possui equipes vinculadas. Desvincule ou mova as equipes antes de alterar o supervisor.",
          );
        }
      }
      for (const setorId of toRemove) {
        const { count, error: cErr } = await supabaseAdmin
          .from("equipes")
          .select("id", { count: "exact", head: true })
          .eq("leader_id", atual.id)
          .eq("setor_id", setorId);
        if (cErr) throw new Error(cErr.message);
        if ((count ?? 0) > 0) {
          throw new Error(
            "O líder possui equipes vinculadas nesse setor. Ajuste os vínculos antes de remover.",
          );
        }
      }

      for (const setorId of desiredSetorIds) {
        await assertHierarchy(supabaseAdmin, { setorId, supervisorId });
      }

      if (supervisorChanged) {
        const { error } = await supabaseAdmin
          .from("lideres_estrutura")
          .update({ supervisor_id: supervisorId })
          .eq("id", atual.id);
        if (error) throw new Error(error.message);
      }
      if (toRemove.length > 0) {
        const { error } = await supabaseAdmin
          .from("lider_setores")
          .delete()
          .eq("lider_id", atual.id)
          .in("setor_id", toRemove);
        if (error) throw new Error(error.message);
      }
      if (toAdd.length > 0) {
        const { error } = await supabaseAdmin
          .from("lider_setores")
          .insert(toAdd.map((setor_id) => ({ lider_id: atual.id, setor_id })));
        if (error) throw new Error(error.message);
      }
    }

    return { ok: true as const };
  });

export const adminNormalizeLeader = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      adminPassword: string;
      leaderUserId: string;
      nome: string;
      setorIds: string[];
      supervisorId: string;
      newLogin?: string;
      newPassword?: string;
    }) => data,
  )
  .handler(async ({ data }) => {
    assertAdmin(data.adminPassword);
    const nome = data.nome.trim();
    if (!nome) throw new Error("Informe o nome do líder.");
    const setorIds = Array.from(new Set(data.setorIds.filter(Boolean)));
    if (setorIds.length === 0) throw new Error("Selecione ao menos um setor.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (data.newLogin !== undefined) {
      const slug = sanitizeLogin(data.newLogin);
      if (!slug || slug.length < 3) throw new Error("Login inválido.");
      const { error } = await supabaseAdmin.auth.admin.updateUserById(data.leaderUserId, {
        email: `${slug}@gpva.local`,
      });
      if (error) throw new Error(error.message);
    }
    if (data.newPassword !== undefined) {
      if (data.newPassword.length < 6) throw new Error("Senha precisa ter ao menos 6 caracteres.");
      const { error } = await supabaseAdmin.auth.admin.updateUserById(data.leaderUserId, {
        password: data.newPassword,
      });
      if (error) throw new Error(error.message);
    }

    const { data: role, error: roleErr } = await supabaseAdmin
      .from("user_roles")
      .select("user_id")
      .eq("user_id", data.leaderUserId)
      .eq("role", "leader")
      .maybeSingle();
    if (roleErr) throw new Error(roleErr.message);
    if (!role) throw new Error("Usuário informado não possui o papel de líder.");

    const { data: existente, error: exErr } = await supabaseAdmin
      .from("lideres_estrutura")
      .select("id")
      .eq("user_id", data.leaderUserId)
      .maybeSingle();
    if (exErr) throw new Error(exErr.message);
    if (existente) throw new Error("Este líder já possui estrutura normalizada.");

    for (const setorId of setorIds) {
      await assertHierarchy(supabaseAdmin, { setorId, supervisorId: data.supervisorId });
    }

    const { data: struct, error } = await supabaseAdmin
      .from("lideres_estrutura")
      .insert({
        user_id: data.leaderUserId,
        nome,
        supervisor_id: data.supervisorId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    const { error: linkErr } = await supabaseAdmin
      .from("lider_setores")
      .insert(setorIds.map((setor_id) => ({ lider_id: struct.id, setor_id })));
    if (linkErr) throw new Error(linkErr.message);
    return { ok: true as const };
  });

export const adminDeleteLeader = createServerFn({ method: "POST" })
  .inputValidator((data: { adminPassword: string; leaderUserId: string }) => data)
  .handler(async ({ data }) => {
    assertAdmin(data.adminPassword);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // 1. Snapshot da estrutura (inclui os vínculos de setor — o cascade do
    // FK apaga lider_setores junto da linha, então precisam ser guardados
    // aqui pra restauração best-effort funcionar de verdade)
    const { data: snapshot, error: snapErr } = await supabaseAdmin
      .from("lideres_estrutura")
      .select("id,user_id,nome,supervisor_id,created_at")
      .eq("user_id", data.leaderUserId)
      .maybeSingle();
    if (snapErr) throw new Error(snapErr.message);

    let snapshotSetorIds: string[] = [];
    if (snapshot) {
      const { data: setorRows, error: setorSnapErr } = await supabaseAdmin
        .from("lider_setores")
        .select("setor_id")
        .eq("lider_id", snapshot.id);
      if (setorSnapErr) throw new Error(setorSnapErr.message);
      snapshotSetorIds = (setorRows ?? []).map((r) => r.setor_id);
    }

    // 2. Bloqueio por equipes vinculadas (nada é removido)
    if (snapshot) {
      const { count, error: cErr } = await supabaseAdmin
        .from("equipes")
        .select("id", { count: "exact", head: true })
        .eq("leader_id", snapshot.id);
      if (cErr) throw new Error(cErr.message);
      if ((count ?? 0) > 0) {
        throw new Error(
          "O líder possui equipes vinculadas. Desvincule ou mova as equipes antes de excluir.",
        );
      }
    }

    // 3. Snapshot do papel
    const { data: roleRows, error: roleErr } = await supabaseAdmin
      .from("user_roles")
      .select("id,user_id,role,created_at")
      .eq("user_id", data.leaderUserId)
      .eq("role", "leader");
    if (roleErr) throw new Error(roleErr.message);

    // Restauração best-effort do estado anterior (usada em QUALQUER falha posterior)
    const restore = async (): Promise<string[]> => {
      const problemas: string[] = [];
      if (snapshot) {
        const { data: exists } = await supabaseAdmin
          .from("lideres_estrutura")
          .select("id")
          .eq("id", snapshot.id)
          .maybeSingle();
        if (!exists) {
          const { error } = await supabaseAdmin.from("lideres_estrutura").insert({
            id: snapshot.id,
            user_id: snapshot.user_id,
            nome: snapshot.nome,
            supervisor_id: snapshot.supervisor_id,
            created_at: snapshot.created_at,
          });
          if (error) problemas.push(`lideres_estrutura: ${error.message}`);
          else if (snapshotSetorIds.length > 0) {
            const { error: linkErr } = await supabaseAdmin
              .from("lider_setores")
              .insert(snapshotSetorIds.map((setor_id) => ({ lider_id: snapshot.id, setor_id })));
            if (linkErr) problemas.push(`lider_setores: ${linkErr.message}`);
          }
        }
      }
      if ((roleRows ?? []).length > 0) {
        const { error } = await supabaseAdmin
          .from("user_roles")
          .upsert(
            (roleRows ?? []).map((r) => ({
              id: r.id,
              user_id: r.user_id,
              role: r.role,
              created_at: r.created_at,
            })),
            { onConflict: "user_id,role" },
          );
        if (error) problemas.push(`user_roles: ${error.message}`);
      }
      return problemas;
    };

    const abort = async (motivo: string): Promise<never> => {
      const problemas = await restore();
      if (problemas.length === 0) {
        throw new Error(`Exclusão abortada (${motivo}). O estado anterior do líder foi restaurado.`);
      }
      throw new Error(
        `ERRO CRÍTICO: exclusão falhou (${motivo}) e a restauração também falhou [${problemas.join(" | ")}]. ` +
          `user_id=${data.leaderUserId}; leader_structure_id=${snapshot?.id ?? "—"}; setor_ids=${snapshotSetorIds.join(",") || "—"}; ` +
          `supervisor_id=${snapshot?.supervisor_id ?? "—"}; nome=${snapshot?.nome ?? "—"}. Intervenção manual necessária.`,
      );
    };

    // 4. Remove estrutura
    if (snapshot) {
      const { error: delEstErr } = await supabaseAdmin
        .from("lideres_estrutura")
        .delete()
        .eq("id", snapshot.id);
      if (delEstErr) throw new Error(delEstErr.message);
    }

    // 5. Remove papel
    const { error: delRoleErr } = await supabaseAdmin
      .from("user_roles")
      .delete()
      .eq("user_id", data.leaderUserId)
      .eq("role", "leader");
    if (delRoleErr) await abort(delRoleErr.message);

    // 6. Remove conta de autenticação
    const { error: authErr } = await supabaseAdmin.auth.admin.deleteUser(data.leaderUserId);
    if (!authErr) return { ok: true as const };

    // 7. Falhou: se a conta ainda existe, restaurar tudo
    const still = await supabaseAdmin.auth.admin.getUserById(data.leaderUserId);
    if (still.data?.user) await abort(authErr.message);
    throw new Error(authErr.message);
  });



// ============= Setores =============

export type SetorRow = {
  id: string;
  nome: string;
};

export const adminListSetores = createServerFn({ method: "POST" })
  .inputValidator((data: { adminPassword: string }) => data)
  .handler(async ({ data }): Promise<SetorRow[]> => {
    assertAdmin(data.adminPassword);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("setores")
      .select("id,nome")
      .order("nome");
    if (error) throw new Error(error.message);
    return (rows ?? []) as SetorRow[];
  });

export const adminCreateSetor = createServerFn({ method: "POST" })
  .inputValidator((data: { adminPassword: string; nome: string }) => data)
  .handler(async ({ data }) => {
    assertAdmin(data.adminPassword);
    const nome = data.nome.trim();
    if (!nome) throw new Error("Nome do setor obrigatório.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("setores")
      .insert({ nome, supervisor_nome: "" });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const adminUpdateSetor = createServerFn({ method: "POST" })
  .inputValidator((data: { adminPassword: string; setorId: string; nome?: string }) => data)
  .handler(async ({ data }) => {
    assertAdmin(data.adminPassword);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const patch: { nome?: string } = {};
    if (data.nome !== undefined) {
      const nome = data.nome.trim();
      if (!nome) throw new Error("Nome do setor obrigatório.");
      patch.nome = nome;
    }
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
    const { count: supCount, error: supErr } = await supabaseAdmin
      .from("supervisor_setores")
      .select("supervisor_id", { count: "exact", head: true })
      .eq("setor_id", data.setorId);
    if (supErr) throw new Error(supErr.message);
    if ((supCount ?? 0) > 0) {
      throw new Error("Setor possui supervisores vinculados. Remova-os antes de excluir.");
    }
    const { error } = await supabaseAdmin
      .from("setores")
      .delete()
      .eq("id", data.setorId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

// ============= Supervisores =============

export type SupervisorRow = {
  id: string;
  nome: string;
  setor_ids: string[];
  setor_nomes: string[];
  user_id: string | null;
};

export const adminListSupervisores = createServerFn({ method: "POST" })
  .inputValidator((data: { adminPassword: string; setorId?: string }) => data)
  .handler(async ({ data }): Promise<SupervisorRow[]> => {
    assertAdmin(data.adminPassword);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let query = supabaseAdmin
      .from("supervisores")
      .select("id,nome,user_id,supervisor_setores(setor_id,setores(nome))")
      .order("nome");
    if (data.setorId) {
      const { data: linked, error: linkErr } = await supabaseAdmin
        .from("supervisor_setores")
        .select("supervisor_id")
        .eq("setor_id", data.setorId);
      if (linkErr) throw new Error(linkErr.message);
      const ids = (linked ?? []).map((r) => r.supervisor_id);
      if (ids.length === 0) return [];
      query = query.in("id", ids);
    }
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    type Join = {
      id: string;
      nome: string;
      user_id: string | null;
      supervisor_setores: { setor_id: string; setores: { nome: string } | null }[] | null;
    };
    return ((rows ?? []) as unknown as Join[]).map((r) => ({
      id: r.id,
      nome: r.nome,
      user_id: r.user_id ?? null,
      setor_ids: (r.supervisor_setores ?? []).map((s) => s.setor_id),
      setor_nomes: (r.supervisor_setores ?? []).map((s) => s.setores?.nome ?? "").filter(Boolean),
    }));
  });

export const adminCreateSupervisor = createServerFn({ method: "POST" })
  .inputValidator((data: { adminPassword: string; nome: string; setorIds: string[] }) => data)
  .handler(async ({ data }) => {
    assertAdmin(data.adminPassword);
    const nome = data.nome.trim();
    if (!nome) throw new Error("Nome do supervisor obrigatório.");
    const setorIds = Array.from(new Set(data.setorIds.filter(Boolean)));
    if (setorIds.length === 0) throw new Error("Selecione ao menos um setor.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { count, error: setorErr } = await supabaseAdmin
      .from("setores")
      .select("id", { count: "exact", head: true })
      .in("id", setorIds);
    if (setorErr) throw new Error(setorErr.message);
    if ((count ?? 0) !== setorIds.length) {
      throw new Error("Um ou mais setores selecionados não foram encontrados.");
    }
    const { data: created, error } = await supabaseAdmin
      .from("supervisores")
      .insert({ nome })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    const { error: linkErr } = await supabaseAdmin
      .from("supervisor_setores")
      .insert(setorIds.map((setor_id) => ({ supervisor_id: created.id, setor_id })));
    if (linkErr) throw new Error(linkErr.message);
    return { ok: true as const };
  });

export const adminUpdateSupervisor = createServerFn({ method: "POST" })
  .inputValidator(
    (data: { adminPassword: string; supervisorId: string; nome?: string; setorIds?: string[] }) => data,
  )
  .handler(async ({ data }) => {
    assertAdmin(data.adminPassword);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: atual, error: getErr } = await supabaseAdmin
      .from("supervisores")
      .select("id")
      .eq("id", data.supervisorId)
      .maybeSingle();
    if (getErr) throw new Error(getErr.message);
    if (!atual) throw new Error("Supervisor não encontrado.");

    if (data.nome !== undefined) {
      const nome = data.nome.trim();
      if (!nome) throw new Error("Nome do supervisor obrigatório.");
      const { error } = await supabaseAdmin.from("supervisores").update({ nome }).eq("id", atual.id);
      if (error) throw new Error(error.message);
    }

    if (data.setorIds !== undefined) {
      const desired = Array.from(new Set(data.setorIds.filter(Boolean)));
      if (desired.length === 0) {
        throw new Error("O supervisor precisa ficar vinculado a ao menos um setor.");
      }

      const { data: existingRows, error: exErr } = await supabaseAdmin
        .from("supervisor_setores")
        .select("setor_id")
        .eq("supervisor_id", atual.id);
      if (exErr) throw new Error(exErr.message);
      const current = (existingRows ?? []).map((r) => r.setor_id);

      const toAdd = desired.filter((id) => !current.includes(id));
      const toRemove = current.filter((id) => !desired.includes(id));

      if (toAdd.length > 0) {
        const { count, error: setorErr } = await supabaseAdmin
          .from("setores")
          .select("id", { count: "exact", head: true })
          .in("id", toAdd);
        if (setorErr) throw new Error(setorErr.message);
        if ((count ?? 0) !== toAdd.length) {
          throw new Error("Um ou mais setores selecionados não foram encontrados.");
        }
      }

      // Remover um vínculo é bloqueado se ainda houver líder/equipe daquele
      // setor específico dependendo deste supervisor — adicionar um setor
      // novo, ao contrário, é sempre livre (não quebra nada existente).
      const { data: supervisorLideres, error: supLidErr } = await supabaseAdmin
        .from("lideres_estrutura")
        .select("id")
        .eq("supervisor_id", atual.id);
      if (supLidErr) throw new Error(supLidErr.message);
      const supervisorLiderIds = (supervisorLideres ?? []).map((r) => r.id);

      for (const setorId of toRemove) {
        let leadCount = 0;
        if (supervisorLiderIds.length > 0) {
          const { count, error: lErr } = await supabaseAdmin
            .from("lider_setores")
            .select("lider_id", { count: "exact", head: true })
            .eq("setor_id", setorId)
            .in("lider_id", supervisorLiderIds);
          if (lErr) throw new Error(lErr.message);
          leadCount = count ?? 0;
        }
        const { count: teamCount, error: tErr } = await supabaseAdmin
          .from("equipes")
          .select("id", { count: "exact", head: true })
          .eq("supervisor_id", atual.id)
          .eq("setor_id", setorId);
        if (tErr) throw new Error(tErr.message);
        if ((leadCount ?? 0) > 0 || (teamCount ?? 0) > 0) {
          throw new Error(
            "Supervisor possui líderes ou equipes vinculados nesse setor. Ajuste os vínculos antes de remover.",
          );
        }
      }

      if (toRemove.length > 0) {
        const { error } = await supabaseAdmin
          .from("supervisor_setores")
          .delete()
          .eq("supervisor_id", atual.id)
          .in("setor_id", toRemove);
        if (error) throw new Error(error.message);
      }
      if (toAdd.length > 0) {
        const { error } = await supabaseAdmin
          .from("supervisor_setores")
          .insert(toAdd.map((setor_id) => ({ supervisor_id: atual.id, setor_id })));
        if (error) throw new Error(error.message);
      }
    }

    return { ok: true as const };
  });

export const adminDeleteSupervisor = createServerFn({ method: "POST" })
  .inputValidator((data: { adminPassword: string; supervisorId: string }) => data)
  .handler(async ({ data }) => {
    assertAdmin(data.adminPassword);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { count: leadCount, error: lErr } = await supabaseAdmin
      .from("lideres_estrutura")
      .select("id", { count: "exact", head: true })
      .eq("supervisor_id", data.supervisorId);
    if (lErr) throw new Error(lErr.message);
    if ((leadCount ?? 0) > 0) {
      throw new Error("Supervisor possui líderes vinculados. Remova-os antes de excluir.");
    }
    const { count: teamCount, error: tErr } = await supabaseAdmin
      .from("equipes")
      .select("id", { count: "exact", head: true })
      .eq("supervisor_id", data.supervisorId);
    if (tErr) throw new Error(tErr.message);
    if ((teamCount ?? 0) > 0) {
      throw new Error("Supervisor possui equipes vinculadas. Ajuste os vínculos antes de excluir.");
    }
    const { error } = await supabaseAdmin
      .from("supervisores")
      .delete()
      .eq("id", data.supervisorId);
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
  is_test: boolean;
  native_version_code: number | null;
  web_bundle_version: number | null;
};

export type DevicesOverview = {
  devices: DeviceRow[];
  latestNativeVersionCode: number | null;
  latestWebBuildNumber: number | null;
};

// Uma página só: quem está logado agora (qualquer papel — equipe, teste,
// líder, admin), em que aparelho, e em que versão do app. Antes eram duas
// seções separadas (Dispositivos e Atualizações), a segunda só cobrindo
// equipes reais e sem nenhuma ligação com o aparelho físico.
export const adminListDevices = createServerFn({ method: "POST" })
  .inputValidator((data: { adminPassword: string }) => data)
  .handler(async ({ data }): Promise<DevicesOverview> => {
    assertAdmin(data.adminPassword);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: sessions, error }, nativeRes, webRes] = await Promise.all([
      supabaseAdmin
        .from("active_sessions")
        .select("user_id,session_id,user_agent,last_seen_at,updated_at,native_version_code,web_bundle_version")
        .order("last_seen_at", { ascending: false }),
      supabaseAdmin.from("app_releases").select("version_code").order("version_code", { ascending: false }).limit(1).maybeSingle(),
      supabaseAdmin.from("web_releases").select("build_number").order("build_number", { ascending: false }).limit(1).maybeSingle(),
    ]);
    if (error) throw new Error(error.message);
    const latestNativeVersionCode = nativeRes.data?.version_code ?? null;
    const latestWebBuildNumber = webRes.data?.build_number ?? null;
    const rows = sessions ?? [];
    if (!rows.length) return { devices: [], latestNativeVersionCode, latestWebBuildNumber };
    const ids = rows.map((r) => r.user_id);
    const [{ data: teams }, { data: roles }, usersList] = await Promise.all([
      supabaseAdmin.from("equipes").select("id,team_name,is_test").in("id", ids),
      supabaseAdmin.from("user_roles").select("user_id,role").in("user_id", ids),
      supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    ]);
    const teamMap = new Map((teams ?? []).map((t) => [t.id, t]));
    const roleMap = new Map<string, string>();
    for (const r of roles ?? []) roleMap.set(r.user_id, r.role);
    const userMap = new Map<string, string>();
    if (!usersList.error) {
      for (const u of usersList.data.users) userMap.set(u.id, u.email ?? "");
    }
    const devices = rows.map((r) => {
      const role = roleMap.get(r.user_id);
      const team = teamMap.get(r.user_id);
      let account_kind: DeviceRow["account_kind"] = "unknown";
      let account_label = team?.team_name ?? "";
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
      return { ...r, account_label, account_kind, is_test: team?.is_test ?? false };
    });
    return { devices, latestNativeVersionCode, latestWebBuildNumber };
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

// ============= Lixeira (soft-delete) =============

export type TrashShiftRow = {
  id: string;
  team_id: string;
  team_name: string;
  started_at: string;
  ended_at: string | null;
  status: string;
  report_text: string | null;
  deleted_at: string;
  service_count: number;
};

export const adminListTrashShifts = createServerFn({ method: "POST" })
  .inputValidator((data: { adminPassword: string; limit?: number }) => data)
  .handler(async ({ data }): Promise<TrashShiftRow[]> => {
    assertAdmin(data.adminPassword);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("expedientes")
      .select("id,team_id,started_at,ended_at,status,report_text,deleted_at")
      .not("deleted_at", "is", null)
      .order("deleted_at", { ascending: false })
      .limit(Math.min(Number(data.limit) || 200, 500));
    if (error) throw new Error(error.message);
    const list = rows ?? [];
    if (!list.length) return [];
    const shiftIds = list.map((r) => r.id);
    const teamIds = Array.from(new Set(list.map((r) => r.team_id).filter(Boolean)));
    const [{ data: svc }, { data: teams }] = await Promise.all([
      supabaseAdmin.from("servicos").select("shift_id").in("shift_id", shiftIds),
      supabaseAdmin.from("equipes").select("id,team_name").in("id", teamIds),
    ]);
    const svcCount = new Map<string, number>();
    for (const s of svc ?? []) {
      const k = (s as { shift_id: string | null }).shift_id;
      if (!k) continue;
      svcCount.set(k, (svcCount.get(k) ?? 0) + 1);
    }
    const teamMap = new Map((teams ?? []).map((t) => [t.id, t.team_name]));
    return list.map((r) => ({
      ...r,
      deleted_at: r.deleted_at as string,
      team_name: teamMap.get(r.team_id) ?? "—",
      service_count: svcCount.get(r.id) ?? 0,
    })) as TrashShiftRow[];
  });

export const adminRestoreShift = createServerFn({ method: "POST" })
  .inputValidator((data: { adminPassword: string; shiftId: string }) => data)
  .handler(async ({ data }) => {
    assertAdmin(data.adminPassword);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Restaura expediente + serviços + vínculos + impactos vinculados
    const { error: e1 } = await supabaseAdmin
      .from("expedientes").update({ deleted_at: null }).eq("id", data.shiftId);
    if (e1) throw new Error(e1.message);
    await supabaseAdmin.from("servicos").update({ deleted_at: null }).eq("shift_id", data.shiftId);
    await supabaseAdmin.from("vinculos_complementos").update({ deleted_at: null }).eq("shift_id", data.shiftId);
    await supabaseAdmin.from("impactos_expediente").update({ deleted_at: null }).eq("shift_id", data.shiftId);
    return { ok: true as const };
  });

export const adminPurgeShift = createServerFn({ method: "POST" })
  .inputValidator((data: { adminPassword: string; shiftId: string }) => data)
  .handler(async ({ data }) => {
    assertAdmin(data.adminPassword);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Apagar definitivo — ordem inversa das FKs
    await supabaseAdmin.from("vinculos_complementos").delete().eq("shift_id", data.shiftId);
    await supabaseAdmin.from("servicos").delete().eq("shift_id", data.shiftId);
    await supabaseAdmin.from("impactos_expediente").delete().eq("shift_id", data.shiftId);
    const { error } = await supabaseAdmin.from("expedientes").delete().eq("id", data.shiftId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });