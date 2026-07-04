import { createServerFn } from "@tanstack/react-start";
import { ADMIN_PASSWORD } from "../admin.functions";
import type { CheckResult } from "./types";
import type { JsonValue } from "./types";

function assertAdmin(pw: string) {
  if (pw !== ADMIN_PASSWORD) throw new Error("Senha de administrador inválida.");
}

type AdminInput = { adminPassword: string };

// -------- DB checks --------
export const runDbAudit = createServerFn({ method: "POST" })
  .inputValidator((d: AdminInput) => d)
  .handler(async ({ data }): Promise<CheckResult[]> => {
    assertAdmin(data.adminPassword);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const results: CheckResult[] = [];

    // Ping / latência
    const t0 = Date.now();
    try {
      const { error } = await supabaseAdmin.from("equipes").select("id", { count: "exact", head: true });
      const ms = Date.now() - t0;
      if (error) {
        results.push({ id: "db.connection", category: "banco", title: "Conexão com o banco", severity: "error", message: error.message });
      } else {
        results.push({
          id: "db.connection", category: "banco", title: "Conexão com o banco",
          severity: ms > 800 ? "warning" : "info",
          message: `Latência: ${ms}ms`,
          evidence: { latency_ms: ms },
          suggestion: ms > 800 ? "Latência acima de 800ms. Verificar região do projeto." : undefined,
        });
      }
    } catch (e) {
      results.push({ id: "db.connection", category: "banco", title: "Conexão com o banco", severity: "error", message: (e as Error).message });
    }

    // Contagem de linhas por tabela conhecida
    const tables = [
      "servicos", "expedientes", "equipes", "setores", "tipos_servico",
      "complementos_servico", "vinculos_complementos", "impactos", "impactos_expediente",
      "motivos_inviabilidade", "user_roles", "active_sessions", "catalog_order",
      "google_form_settings", "audit_reports",
    ] as const;
    for (const t of tables) {
      try {
        const { count, error } = await supabaseAdmin.from(t).select("*", { count: "exact", head: true });
        if (error) {
          results.push({ id: `db.table.${t}`, category: "banco", title: `Tabela ${t}`, severity: "error", message: error.message, location: `public.${t}` });
        } else {
          results.push({
            id: `db.table.${t}`, category: "banco", title: `Tabela ${t}`,
            severity: "info", message: `${count ?? 0} registros`,
            evidence: { rows: count ?? 0 }, location: `public.${t}`,
          });
        }
      } catch (e) {
        results.push({ id: `db.table.${t}`, category: "banco", title: `Tabela ${t}`, severity: "error", message: (e as Error).message });
      }
    }

    // Órfãos
    const orphanChecks: { id: string; title: string; sql: () => Promise<number> }[] = [
      {
        id: "db.orphans.servicos_shift",
        title: "Serviços apontando para expediente inexistente",
        sql: async () => {
          const { data: sv } = await supabaseAdmin.from("servicos").select("shift_id");
          const { data: ex } = await supabaseAdmin.from("expedientes").select("id");
          const set = new Set((ex ?? []).map((r) => r.id));
          return (sv ?? []).filter((s) => s.shift_id && !set.has(s.shift_id)).length;
        },
      },
      {
        id: "db.orphans.servicos_type",
        title: "Serviços com tipo inexistente",
        sql: async () => {
          const { data: sv } = await supabaseAdmin.from("servicos").select("service_type_id");
          const { data: tp } = await supabaseAdmin.from("tipos_servico").select("id");
          const set = new Set((tp ?? []).map((r) => r.id));
          return (sv ?? []).filter((s) => s.service_type_id && !set.has(s.service_type_id)).length;
        },
      },
      {
        id: "db.orphans.expedientes_team",
        title: "Expedientes com equipe inexistente",
        sql: async () => {
          const { data: ex } = await supabaseAdmin.from("expedientes").select("team_id");
          const { data: eq } = await supabaseAdmin.from("equipes").select("id");
          const set = new Set((eq ?? []).map((r) => r.id));
          return (ex ?? []).filter((e) => e.team_id && !set.has(e.team_id)).length;
        },
      },
    ];
    for (const c of orphanChecks) {
      try {
        const n = await c.sql();
        results.push({
          id: c.id, category: "banco", title: c.title,
          severity: n === 0 ? "info" : n < 5 ? "warning" : "error",
          message: n === 0 ? "Nenhum órfão" : `${n} registros órfãos`,
          evidence: { count: n },
          suggestion: n > 0 ? "Rodar limpeza ou adicionar ON DELETE CASCADE nas FKs." : undefined,
        });
      } catch (e) {
        results.push({ id: c.id, category: "banco", title: c.title, severity: "warning", message: `Não executado: ${(e as Error).message}` });
      }
    }

    // Integridade: negociações sem valor / matrícula
    try {
      const { data: neg } = await supabaseAdmin
        .from("servicos")
        .select("id, negotiated_value, registration_number, is_negotiation")
        .eq("is_negotiation", true);
      const semValor = (neg ?? []).filter((s) => s.negotiated_value == null || Number(s.negotiated_value) <= 0).length;
      const semMatricula = (neg ?? []).filter((s) => !s.registration_number).length;
      results.push({
        id: "db.integrity.negociacoes_sem_valor",
        category: "banco", title: "Negociações sem valor válido",
        severity: semValor === 0 ? "info" : "warning",
        message: semValor === 0 ? "Todas com valor" : `${semValor} negociações sem valor > 0`,
        evidence: { count: semValor },
      });
      results.push({
        id: "db.integrity.negociacoes_sem_matricula",
        category: "banco", title: "Negociações sem matrícula",
        severity: semMatricula === 0 ? "info" : "warning",
        message: semMatricula === 0 ? "Todas com matrícula" : `${semMatricula} negociações sem matrícula`,
        evidence: { count: semMatricula },
      });
    } catch (e) {
      results.push({ id: "db.integrity", category: "banco", title: "Integridade de negociações", severity: "warning", message: (e as Error).message });
    }

    return results;
  });

// -------- Segurança / permissões --------
export const runSecurityAudit = createServerFn({ method: "POST" })
  .inputValidator((d: AdminInput) => d)
  .handler(async ({ data }): Promise<CheckResult[]> => {
    assertAdmin(data.adminPassword);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const results: CheckResult[] = [];

    // Verifica RLS via pg_class
    try {
      const { data: rows, error } = await supabaseAdmin.rpc("has_role", {
        _user_id: "00000000-0000-0000-0000-000000000000", _role: "admin",
      });
      results.push({
        id: "sec.rpc.has_role", category: "seguranca", title: "Função has_role acessível",
        severity: error ? "error" : "info",
        message: error ? error.message : `Retorno: ${String(rows)}`,
      });
    } catch (e) {
      results.push({ id: "sec.rpc.has_role", category: "seguranca", title: "Função has_role", severity: "error", message: (e as Error).message });
    }

    // Segredos esperados
    const expected = ["SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SERVICE_ROLE_KEY", "LOVABLE_API_KEY"];
    for (const name of expected) {
      const present = Boolean(process.env[name]);
      results.push({
        id: `sec.secret.${name}`, category: "seguranca", title: `Segredo ${name}`,
        severity: present ? "info" : "error",
        message: present ? "Configurado" : "Ausente",
        suggestion: present ? undefined : `Adicionar ${name} nos segredos do projeto.`,
      });
    }

    return results;
  });

// -------- Contas / configuração --------
export const runAccountsAudit = createServerFn({ method: "POST" })
  .inputValidator((d: AdminInput) => d)
  .handler(async ({ data }): Promise<CheckResult[]> => {
    assertAdmin(data.adminPassword);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const results: CheckResult[] = [];

    try {
      const { data: roles } = await supabaseAdmin.from("user_roles").select("user_id, role");
      const admins = (roles ?? []).filter((r) => r.role === "admin").length;
      const leaders = (roles ?? []).filter((r) => r.role === "leader").length;
      results.push({
        id: "acc.admins", category: "contas", title: "Administradores cadastrados",
        severity: admins === 0 ? "error" : "info",
        message: `${admins} admin(s)`,
        suggestion: admins === 0 ? "Sistema sem admin — cadastrar ao menos um." : undefined,
      });
      results.push({
        id: "acc.leaders", category: "contas", title: "Líderes cadastrados",
        severity: "info", message: `${leaders} líder(es)`,
      });

      // Duplicidade de user_roles
      const seen = new Map<string, number>();
      for (const r of roles ?? []) {
        const k = `${r.user_id}|${r.role}`;
        seen.set(k, (seen.get(k) ?? 0) + 1);
      }
      const dups = [...seen.values()].filter((n) => n > 1).length;
      results.push({
        id: "acc.roles.duplicated", category: "contas", title: "Duplicidade em user_roles",
        severity: dups === 0 ? "info" : "warning",
        message: dups === 0 ? "Nenhuma" : `${dups} pares (user, role) duplicados`,
      });
    } catch (e) {
      results.push({ id: "acc.roles", category: "contas", title: "user_roles", severity: "error", message: (e as Error).message });
    }

    try {
      const { data: teams } = await supabaseAdmin.from("equipes").select("id, team_name");
      const semNome = (teams ?? []).filter((t) => !t.team_name || !t.team_name.trim()).length;
      results.push({
        id: "acc.teams.no_name", category: "contas", title: "Equipes sem nome",
        severity: semNome === 0 ? "info" : "warning",
        message: semNome === 0 ? "OK" : `${semNome} equipe(s) sem team_name`,
      });
    } catch (e) {
      results.push({ id: "acc.teams", category: "contas", title: "Equipes", severity: "warning", message: (e as Error).message });
    }

    return results;
  });

// -------- Configurações --------
export const runConfigAudit = createServerFn({ method: "POST" })
  .inputValidator((d: AdminInput) => d)
  .handler(async ({ data }): Promise<CheckResult[]> => {
    assertAdmin(data.adminPassword);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const results: CheckResult[] = [];

    try {
      const { data: row } = await supabaseAdmin
        .from("google_form_settings")
        .select("mode, prod_form_id, test_form_id, prod_entries, test_entries")
        .eq("id", "singleton")
        .maybeSingle();
      if (!row) {
        results.push({ id: "cfg.form.singleton", category: "config", title: "google_form_settings singleton", severity: "error", message: "Registro singleton ausente" });
      } else {
        const r = row as { mode: string; prod_form_id: string; test_form_id: string; prod_entries: Record<string, string>; test_entries: Record<string, string> };
        results.push({
          id: "cfg.form.mode", category: "config", title: "Modo do Google Forms",
          severity: r.mode === "prod" || r.mode === "test" ? "info" : "error",
          message: `Modo atual: ${r.mode}`,
          evidence: { mode: r.mode },
        });
        const req = ["data", "lider", "setor", "matricula", "pagamento", "valorAVista", "valorTotalParcelado"];
        for (const target of ["prod", "test"] as const) {
          const entries = target === "prod" ? r.prod_entries : r.test_entries;
          const missing = req.filter((k) => !entries?.[k]);
          const fid = target === "prod" ? r.prod_form_id : r.test_form_id;
          results.push({
            id: `cfg.form.${target}`, category: "config", title: `Formulário ${target}`,
            severity: !fid ? "error" : missing.length ? "warning" : "info",
            message: !fid ? "form_id vazio" : missing.length ? `Campos ausentes: ${missing.join(", ")}` : "OK",
            evidence: { form_id: fid, missing },
          });
        }
      }
    } catch (e) {
      results.push({ id: "cfg.form", category: "config", title: "Google Forms", severity: "error", message: (e as Error).message });
    }

    return results;
  });

// -------- Histórico --------
export const saveAuditReport = createServerFn({ method: "POST" })
  .inputValidator((d: AdminInput & { report: JsonValue; duration_ms: number; overall_score: number; counts: JsonValue }) => d)
  .handler(async ({ data }) => {
    assertAdmin(data.adminPassword);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("audit_reports")
      .insert({
        duration_ms: data.duration_ms,
        overall_score: data.overall_score,
        counts: data.counts as never,
        report: data.report as never,
      })
      .select("id, created_at")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const listAuditReports = createServerFn({ method: "POST" })
  .inputValidator((d: AdminInput) => d)
  .handler(async ({ data }) => {
    assertAdmin(data.adminPassword);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("audit_reports")
      .select("id, created_at, duration_ms, overall_score, counts")
      .order("created_at", { ascending: false })
      .limit(30);
    if (error) throw new Error(error.message);
    return rows;
  });

export const deleteAuditReport = createServerFn({ method: "POST" })
  .inputValidator((d: AdminInput & { id: string }) => d)
  .handler(async ({ data }) => {
    assertAdmin(data.adminPassword);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("audit_reports").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });