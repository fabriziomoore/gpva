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

    // Segredos esperados. Alguns projetos usam variações com plural (ex.: SUPABASE_PUBLISHABLE_KEYS).
    const expected: Array<{ name: string; aliases?: string[] }> = [
      { name: "SUPABASE_URL" },
      { name: "SUPABASE_PUBLISHABLE_KEY", aliases: ["SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_ANON_KEY"] },
      { name: "SUPABASE_SERVICE_ROLE_KEY" },
    ];
    for (const { name, aliases = [] } of expected) {
      const present = Boolean(process.env[name]) || aliases.some((a) => Boolean(process.env[a]));
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

export const getAuditReport = createServerFn({ method: "POST" })
  .inputValidator((d: AdminInput & { id: string }) => d)
  .handler(async ({ data }) => {
    assertAdmin(data.adminPassword);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("audit_reports")
      .select("id, created_at, duration_ms, overall_score, counts, report")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Relatório não encontrado");
    return row;
  });

// ============================================================
// Módulos adicionais (RLS, storage, edge, integridade, coords, auth)
// ============================================================

// -------- RLS efetivo + grants --------
export const runRlsAudit = createServerFn({ method: "POST" })
  .inputValidator((d: AdminInput) => d)
  .handler(async ({ data }): Promise<CheckResult[]> => {
    assertAdmin(data.adminPassword);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const results: CheckResult[] = [];
    const { data: snap, error } = await supabaseAdmin.rpc("audit_schema_snapshot");
    if (error) {
      return [{ id: "sec.rls.snapshot", category: "seguranca", title: "Snapshot de RLS", severity: "error", message: error.message }];
    }
    const rows = (snap ?? []) as Array<{
      table: string; rls_enabled: boolean; policy_count: number;
      grants: Record<string, string[]>;
    }>;
    if (rows.length === 0) {
      return [{ id: "sec.rls.empty", category: "seguranca", title: "Snapshot vazio", severity: "warning", message: "Nenhuma tabela pública encontrada" }];
    }
    for (const r of rows) {
      if (!r.rls_enabled) {
        results.push({
          id: `sec.rls.${r.table}`, category: "seguranca",
          title: `RLS em ${r.table}`, severity: "error",
          message: "RLS DESABILITADA — dados expostos via Data API",
          location: `public.${r.table}`,
          suggestion: `ALTER TABLE public.${r.table} ENABLE ROW LEVEL SECURITY;`,
        });
      } else if (r.policy_count === 0) {
        results.push({
          id: `sec.rls.${r.table}.nopolicy`, category: "seguranca",
          title: `RLS em ${r.table}`, severity: "warning",
          message: "RLS ativa sem políticas — nenhuma leitura/escrita permitida",
          location: `public.${r.table}`,
        });
      } else {
        results.push({
          id: `sec.rls.${r.table}`, category: "seguranca",
          title: `RLS em ${r.table}`, severity: "info",
          message: `${r.policy_count} política(s) ativa(s)`,
          evidence: { policies: r.policy_count as JsonValue },
          location: `public.${r.table}`,
        });
      }
      const g = r.grants ?? {};
      if (!g.service_role || g.service_role.length === 0) {
        results.push({
          id: `sec.grant.${r.table}.service`, category: "seguranca",
          title: `Grants em ${r.table}`, severity: "warning",
          message: "service_role sem GRANT — Edge/admin pode falhar",
          location: `public.${r.table}`,
          suggestion: `GRANT ALL ON public.${r.table} TO service_role;`,
        });
      }
    }
    return results;
  });

// -------- Storage --------
export const runStorageAudit = createServerFn({ method: "POST" })
  .inputValidator((d: AdminInput) => d)
  .handler(async ({ data }): Promise<CheckResult[]> => {
    assertAdmin(data.adminPassword);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const results: CheckResult[] = [];
    const { data: buckets, error } = await supabaseAdmin.storage.listBuckets();
    if (error) return [{ id: "storage.list", category: "banco", title: "Storage", severity: "error", message: error.message }];
    if (!buckets || buckets.length === 0) {
      results.push({
        id: "storage.empty", category: "banco", title: "Buckets de Storage",
        severity: "info", message: "Nenhum bucket criado (fotos são armazenadas como data URL no banco)",
      });
    } else {
      for (const b of buckets) {
        results.push({
          id: `storage.${b.name}`, category: "banco", title: `Bucket ${b.name}`,
          severity: b.public ? "warning" : "info",
          message: b.public ? "Bucket PÚBLICO — revisar exposição" : "Privado",
          evidence: { public: b.public as JsonValue },
        });
      }
    }
    return results;
  });

// -------- Edge Function health (auto-teste do admin-api) --------
export const runEdgeFnAudit = createServerFn({ method: "POST" })
  .inputValidator((d: AdminInput) => d)
  .handler(async ({ data }): Promise<CheckResult[]> => {
    assertAdmin(data.adminPassword);
    const results: CheckResult[] = [];
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      return [{ id: "edge.env", category: "seguranca", title: "Ambiente Edge", severity: "error", message: "SUPABASE_URL/SERVICE_ROLE_KEY ausentes" }];
    }
    const t0 = Date.now();
    try {
      const res = await fetch(`${url}/functions/v1/admin-api`, {
        method: "POST",
        headers: { "content-type": "application/json", Authorization: `Bearer ${key}`, apikey: key },
        body: JSON.stringify({ op: "adminListSetores", args: {}, adminPassword: data.adminPassword }),
      });
      const ms = Date.now() - t0;
      const body = await res.text();
      results.push({
        id: "edge.admin-api", category: "seguranca", title: "Edge Function admin-api",
        severity: res.ok ? (ms > 1500 ? "warning" : "info") : "error",
        message: res.ok ? `HTTP ${res.status} em ${ms}ms` : `HTTP ${res.status}: ${body.slice(0, 120)}`,
        evidence: { status: res.status, latency_ms: ms },
      });
    } catch (e) {
      results.push({ id: "edge.admin-api", category: "seguranca", title: "Edge Function admin-api", severity: "error", message: (e as Error).message });
    }
    return results;
  });

// -------- Integridade referencial extra --------
export const runIntegrityAudit = createServerFn({ method: "POST" })
  .inputValidator((d: AdminInput) => d)
  .handler(async ({ data }): Promise<CheckResult[]> => {
    assertAdmin(data.adminPassword);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const results: CheckResult[] = [];
    async function orphan(id: string, title: string, fn: () => Promise<number>, suggestion?: string) {
      try {
        const n = await fn();
        results.push({
          id, category: "banco", title,
          severity: n === 0 ? "info" : n < 5 ? "warning" : "error",
          message: n === 0 ? "Nenhum órfão" : `${n} registro(s) órfão(s)`,
          evidence: { count: n },
          suggestion: n > 0 ? suggestion : undefined,
        });
      } catch (e) {
        results.push({ id, category: "banco", title, severity: "warning", message: (e as Error).message });
      }
    }
    await orphan("db.orphans.vinc_service", "Vínculos de complemento apontando para serviço inexistente", async () => {
      const { data: v } = await supabaseAdmin.from("vinculos_complementos").select("service_id");
      const { data: s } = await supabaseAdmin.from("servicos").select("id");
      const set = new Set((s ?? []).map((r) => r.id));
      return (v ?? []).filter((r) => r.service_id && !set.has(r.service_id)).length;
    }, "Rodar limpeza em vinculos_complementos.");
    await orphan("db.orphans.vinc_complement", "Vínculos apontando para complemento inexistente", async () => {
      const { data: v } = await supabaseAdmin.from("vinculos_complementos").select("complement_id");
      const { data: c } = await supabaseAdmin.from("complementos_servico").select("id");
      const set = new Set((c ?? []).map((r) => r.id));
      return (v ?? []).filter((r) => r.complement_id && !set.has(r.complement_id)).length;
    });
    await orphan("db.orphans.impact_exp_shift", "Impactos de expediente apontando para expediente inexistente", async () => {
      const { data: v } = await supabaseAdmin.from("impactos_expediente").select("shift_id");
      const { data: e } = await supabaseAdmin.from("expedientes").select("id");
      const set = new Set((e ?? []).map((r) => r.id));
      return (v ?? []).filter((r) => r.shift_id && !set.has(r.shift_id)).length;
    });
    await orphan("db.orphans.impact_exp_impact", "Impactos de expediente apontando para impacto inexistente", async () => {
      const { data: v } = await supabaseAdmin.from("impactos_expediente").select("impact_id");
      const { data: i } = await supabaseAdmin.from("impactos").select("id");
      const set = new Set((i ?? []).map((r) => r.id));
      return (v ?? []).filter((r) => r.impact_id && !set.has(r.impact_id)).length;
    });
    await orphan("db.orphans.active_sessions", "Sessões ativas de equipe inexistente", async () => {
      const { data: s } = await supabaseAdmin.from("active_sessions").select("user_id");
      const { data: e } = await supabaseAdmin.from("equipes").select("id");
      const set = new Set((e ?? []).map((r) => r.id));
      return (s ?? []).filter((r) => r.user_id && !set.has(r.user_id)).length;
    });
    await orphan("db.orphans.equipes_setor", "Equipes com setor inexistente", async () => {
      const { data: e } = await supabaseAdmin.from("equipes").select("setor_id");
      const { data: s } = await supabaseAdmin.from("setores").select("id");
      const set = new Set((s ?? []).map((r) => r.id));
      return (e ?? []).filter((r) => r.setor_id && !set.has(r.setor_id)).length;
    });
    return results;
  });

// -------- Coordenadas dos serviços --------
export const runCoordsAudit = createServerFn({ method: "POST" })
  .inputValidator((d: AdminInput) => d)
  .handler(async ({ data }): Promise<CheckResult[]> => {
    assertAdmin(data.adminPassword);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const results: CheckResult[] = [];
    const { data: rows, error } = await supabaseAdmin.from("servicos").select("id,lat,lng");
    if (error) return [{ id: "coords.error", category: "banco", title: "Coordenadas", severity: "error", message: error.message }];
    const all = rows ?? [];
    const total = all.length;
    const semGeo = all.filter((r) => r.lat == null || r.lng == null).length;
    const invalid = all.filter((r) => {
      if (r.lat == null || r.lng == null) return false;
      const la = Number(r.lat), ln = Number(r.lng);
      return !Number.isFinite(la) || !Number.isFinite(ln) || Math.abs(la) > 90 || Math.abs(ln) > 180;
    }).length;
    const zeroZero = all.filter((r) => Number(r.lat) === 0 && Number(r.lng) === 0).length;
    const pct = total ? Math.round((semGeo / total) * 100) : 0;
    results.push({ id: "coords.total", category: "banco", title: "Serviços registrados", severity: "info", message: `${total} serviços`, evidence: { total } });
    results.push({
      id: "coords.missing", category: "banco", title: "Serviços sem coordenadas",
      severity: total > 0 && pct > 20 ? "warning" : "info",
      message: `${semGeo} sem lat/lng (${pct}%)`,
      evidence: { count: semGeo, pct },
      suggestion: pct > 20 ? "Verificar permissão de localização no APK." : undefined,
    });
    results.push({
      id: "coords.invalid", category: "banco", title: "Coordenadas fora da faixa válida",
      severity: invalid === 0 ? "info" : "error",
      message: invalid === 0 ? "OK" : `${invalid} registro(s) com lat/lng fora do range`,
      evidence: { count: invalid },
    });
    results.push({
      id: "coords.zero", category: "banco", title: "Coordenadas (0,0)",
      severity: zeroZero === 0 ? "info" : "warning",
      message: zeroZero === 0 ? "Nenhuma" : `${zeroZero} registro(s) no ponto nulo (0,0)`,
      evidence: { count: zeroZero },
    });
    return results;
  });

// -------- Órfãos de Auth --------
export const runAuthOrphansAudit = createServerFn({ method: "POST" })
  .inputValidator((d: AdminInput) => d)
  .handler(async ({ data }): Promise<CheckResult[]> => {
    assertAdmin(data.adminPassword);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const results: CheckResult[] = [];
    try {
      const { data: users, error } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      if (error) throw new Error(error.message);
      const ids = new Set(users.users.map((u) => u.id));
      results.push({
        id: "auth.users.total", category: "contas", title: "Usuários auth",
        severity: "info", message: `${users.users.length} usuário(s)`, evidence: { count: users.users.length },
      });
      const { data: roles } = await supabaseAdmin.from("user_roles").select("user_id,role");
      const rolesOrph = (roles ?? []).filter((r) => !ids.has(r.user_id));
      results.push({
        id: "auth.orphan.roles", category: "contas", title: "user_roles órfãos",
        severity: rolesOrph.length === 0 ? "info" : "error",
        message: rolesOrph.length === 0 ? "Nenhum" : `${rolesOrph.length} papéis apontando para auth.users inexistente`,
        evidence: { count: rolesOrph.length },
        suggestion: rolesOrph.length ? "DELETE FROM user_roles WHERE user_id NOT IN (SELECT id FROM auth.users);" : undefined,
      });
      const { data: teams } = await supabaseAdmin.from("equipes").select("id,team_name");
      const teamOrph = (teams ?? []).filter((t) => !ids.has(t.id));
      results.push({
        id: "auth.orphan.teams", category: "contas", title: "Equipes sem usuário auth",
        severity: teamOrph.length === 0 ? "info" : "error",
        message: teamOrph.length === 0 ? "Nenhuma" : `${teamOrph.length} equipe(s) sem auth.users correspondente`,
        evidence: { count: teamOrph.length },
      });
    } catch (e) {
      results.push({ id: "auth.orphan", category: "contas", title: "Órfãos de auth", severity: "error", message: (e as Error).message });
    }
    return results;
  });