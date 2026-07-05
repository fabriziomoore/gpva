// Edge function que expõe TODAS as operações administrativas via service_role.
// Usada pelo APK Android (que não tem runtime de server functions do TanStack).
// A versão web continua chamando os createServerFn diretos em src/lib/admin.functions.ts.
//
// Segurança: cada requisição precisa vir com { adminPassword: "137889" } no body.
// A senha é a mesma constante ADMIN_PASSWORD do frontend admin.
//
// Contrato: POST /admin-api  body = { op: string, args?: object, adminPassword: string }
//           => 200 { data } | 400 { error }
// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const ADMIN_PASSWORD = "137889";
const ADMIN_LOGIN = "adm";
const ADMIN_EMAIL = `${ADMIN_LOGIN}@gpva.local`;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "content-type": "application/json" },
  });
}

function err(msg: string, status = 400) {
  return json({ error: msg }, status);
}

function slugify(s: string): string {
  const slug = s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug;
}

function stripDiacritics(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim();
}
function parseGoogleFormId(input: string): string {
  const s = String(input || "").trim();
  const m = s.match(/\/d\/e\/([a-zA-Z0-9_-]+)/) || s.match(/\/forms\/d\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : s;
}
async function extractEntriesFromForm(formId: string) {
  const url = `https://docs.google.com/forms/d/e/${formId}/viewform`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Não foi possível abrir o formulário (${res.status}).`);
  const html = await res.text();
  const m = html.match(/FB_PUBLIC_LOAD_DATA_ = (.*?);<\/script>/s);
  if (!m) throw new Error("Formato do formulário não reconhecido.");
  const data = JSON.parse(m[1]);
  const fields: any[] = data?.[1]?.[1] ?? [];
  const map = new Map<string, string>();
  for (const f of fields) {
    const label = typeof f?.[1] === "string" ? stripDiacritics(f[1]) : "";
    const entryArr = f?.[4];
    if (!label || !Array.isArray(entryArr) || !entryArr[0]) continue;
    const id = entryArr[0][0];
    if (typeof id === "number") map.set(label, `entry.${id}`);
  }
  const need = (labels: string[], key: string) => {
    for (const l of labels) { const v = map.get(stripDiacritics(l)); if (v) return v; }
    throw new Error(`Campo "${key}" não encontrado no formulário.`);
  };
  return {
    data: need(["DATA"], "DATA"),
    lider: need(["LIDER", "LÍDER"], "LIDER"),
    setor: need(["SETOR"], "SETOR"),
    matricula: need(["MATRICULA", "MATRÍCULA"], "MATRICULA"),
    pagamento: need(["FORMA DE PAGAMENTO"], "FORMA DE PAGAMENTO"),
    valorAVista: need(["VALOR A VISTA", "VALOR Á VISTA"], "VALOR À VISTA"),
    valorTotalParcelado: need(["VALOR TOTAL PARCELADO"], "VALOR TOTAL PARCELADO"),
    qtdParcelas: map.get(stripDiacritics("QUANTIDADE DE PARCELAS")),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return err("Method not allowed", 405);

  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return err("Server misconfigured", 500);

  let payload: { op?: string; args?: any; adminPassword?: string } = {};
  try { payload = await req.json(); } catch { return err("Invalid JSON"); }

  if (payload.adminPassword !== ADMIN_PASSWORD) return err("Senha de administrador inválida.", 401);
  const op = String(payload.op || "");
  const args = payload.args ?? {};
  const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  try {
    const data = await dispatch(sb, op, args);
    return json({ data });
  } catch (e) {
    return err((e as Error).message || String(e));
  }
});

async function dispatch(sb: any, op: string, args: any): Promise<any> {
  switch (op) {
    // ---------- Bootstrap ----------
    case "adminBootstrap": {
      const list = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 });
      if (list.error) throw new Error(list.error.message);
      let user = list.data.users.find((u: any) => u.email === ADMIN_EMAIL);
      if (!user) {
        const { data: created, error } = await sb.auth.admin.createUser({
          email: ADMIN_EMAIL, password: ADMIN_PASSWORD, email_confirm: true,
          user_metadata: { is_admin: true, display_name: "Administrador" },
        });
        if (error) throw new Error(error.message);
        user = created.user;
      }
      if (user?.id) {
        await sb.from("user_roles").upsert({ user_id: user.id, role: "admin" }, { onConflict: "user_id,role" });
      }
      return { ok: true, login: ADMIN_LOGIN.toUpperCase() };
    }

    // ---------- Teams ----------
    case "listTeams": {
      const { data, error } = await sb.from("equipes")
        .select("id,team_name,variable_rate,photo_url,collaborator1,collaborator2,setor_id,leader,is_test")
        .order("team_name");
      if (error) throw new Error(error.message);
      return (data ?? []).filter((r: any) => !r.is_test);
    }
    case "adminUpdateRate": {
      const { error } = await sb.from("equipes").update({ variable_rate: args.rate }).eq("id", args.teamId);
      if (error) throw new Error(error.message);
      return { ok: true };
    }
    case "adminCreateTeam": {
      const slug = slugify(args.teamName);
      if (!slug) throw new Error("Nome de equipe inválido.");
      if (String(args.password).length < 6) throw new Error("Senha precisa ter ao menos 6 caracteres.");
      if (!args.setorId) throw new Error("Selecione um setor.");
      const leaderName = String(args.leaderName || "").trim();
      if (!leaderName) throw new Error("Informe o nome do líder.");
      const email = `${slug}@gpva.local`;
      const { data: created, error } = await sb.auth.admin.createUser({
        email, password: args.password, email_confirm: true,
        user_metadata: { team_name: args.teamName.trim() },
      });
      if (error) throw new Error(error.message);
      if (created.user?.id) {
        const { error: e2 } = await sb.from("equipes")
          .update({ setor_id: args.setorId, leader: leaderName, onboarded: true })
          .eq("id", created.user.id);
        if (e2) throw new Error(e2.message);
      }
      return { ok: true };
    }
    case "adminUpdateTeam": {
      const patch: any = {};
      if (args.teamName !== undefined) { const n = String(args.teamName).trim(); if (!n) throw new Error("Nome inválido."); patch.team_name = n; }
      if (args.collaborator1 !== undefined) patch.collaborator1 = String(args.collaborator1 ?? "").trim() || null;
      if (args.collaborator2 !== undefined) patch.collaborator2 = String(args.collaborator2 ?? "").trim() || null;
      if (args.setorId !== undefined) { if (!args.setorId) throw new Error("Setor obrigatório."); patch.setor_id = args.setorId; }
      if (args.leaderName !== undefined) { const l = String(args.leaderName).trim(); if (!l) throw new Error("Informe líder."); patch.leader = l; patch.onboarded = true; }
      if (Object.keys(patch).length === 0) return { ok: true };
      const { error } = await sb.from("equipes").update(patch).eq("id", args.teamId);
      if (error) throw new Error(error.message);
      return { ok: true };
    }
    case "adminDeleteTeam": {
      const tables = ["vinculos_complementos","impactos_expediente","servicos","expedientes","tipos_servico","motivos_inviabilidade","impactos","complementos_servico"];
      for (const t of tables) {
        const { error } = await sb.from(t).delete().eq("team_id", args.teamId);
        if (error) throw new Error(error.message);
      }
      const { error: eqErr } = await sb.from("equipes").delete().eq("id", args.teamId);
      if (eqErr) throw new Error(eqErr.message);
      const { error: authErr } = await sb.auth.admin.deleteUser(args.teamId);
      if (authErr) throw new Error(authErr.message);
      return { ok: true };
    }

    // ---------- CRUD tables ----------
    case "adminListRows": {
      const { data, error } = await sb.from(args.table).select("id,name").eq("active", true).order("name");
      if (error) throw new Error(error.message);
      return data ?? [];
    }
    case "adminAddRow": {
      const { error } = await sb.from(args.table).insert({ team_id: null, name: String(args.name).trim() });
      if (error) throw new Error(error.message);
      return { ok: true };
    }
    case "adminDeleteRow": {
      const { error } = await sb.from(args.table).update({ active: false }).eq("id", args.id);
      if (error) throw new Error(error.message);
      return { ok: true };
    }

    // ---------- Test accounts ----------
    case "adminListTestTeams": {
      const { data, error } = await sb.from("equipes")
        .select("id,team_name,variable_rate,photo_url,collaborator1,collaborator2,setor_id,leader,is_test")
        .eq("is_test", true).order("team_name");
      if (error) throw new Error(error.message);
      return data ?? [];
    }
    case "adminCreateTestTeam": {
      const slug = slugify(args.teamName);
      if (!slug) throw new Error("Nome de equipe inválido.");
      if (String(args.password).length < 6) throw new Error("Senha precisa ter ao menos 6 caracteres.");
      const email = `${slug}@gpva.local`;
      const { data: created, error } = await sb.auth.admin.createUser({
        email, password: args.password, email_confirm: true,
        user_metadata: { team_name: args.teamName.trim() },
      });
      if (error) throw new Error(error.message);
      if (created.user?.id) {
        const { error: e2 } = await sb.from("equipes")
          .update({ is_test: true, onboarded: true, leader: "TESTE" })
          .eq("id", created.user.id);
        if (e2) throw new Error(e2.message);
      }
      return { ok: true };
    }

    // ---------- Ranking ----------
    case "adminTeamsRanking": {
      const { data: teams, error: teamsErr } = await sb.from("equipes").select("id,team_name,is_test");
      if (teamsErr) throw new Error(teamsErr.message);
      const isTest = (t: any) => t.is_test === true || t.team_name === "TESTANDO";
      const visible = (teams ?? []).filter((t: any) => !isTest(t));
      const hidden = new Set((teams ?? []).filter(isTest).map((t: any) => t.id));
      const start = new Date(Date.UTC(args.year, args.month - 1, 1)).toISOString();
      const end = new Date(Date.UTC(args.year, args.month, 1)).toISOString();
      const all: any[] = [];
      const pageSize = 1000; let from = 0;
      while (true) {
        const { data: rows, error } = await sb.from("servicos")
          .select("team_id,viable,is_negotiation,service_type_name,negotiated_value")
          .gte("created_at", start).lt("created_at", end)
          .range(from, from + pageSize - 1);
        if (error) throw new Error(error.message);
        if (!rows?.length) break;
        all.push(...rows.filter((r: any) => !hidden.has(r.team_id)));
        if (rows.length < pageSize) break;
        from += pageSize;
      }
      return visible.map((t: any) => {
        const mine = all.filter((s) => s.team_id === t.id);
        const viable = mine.filter((s) => s.viable).length;
        const inviable = mine.filter((s) => !s.viable).length;
        const negotiations = mine.filter((s) => s.is_negotiation && s.viable).length;
        const negotiationValue = mine.filter((s) => s.is_negotiation && s.viable)
          .reduce((sum, s) => sum + (Number(s.negotiated_value) || 0), 0);
        const byType: Record<string, number> = {};
        for (const s of mine) {
          if (!s.viable) continue;
          const k = (s.service_type_name || "").trim(); if (!k) continue;
          byType[k] = (byType[k] ?? 0) + 1;
        }
        return { id: t.id, team_name: t.team_name, total: mine.length, viable, inviable, negotiations, negotiationValue, byType };
      });
    }

    // ---------- Shifts ----------
    case "adminListShifts": {
      const { data, error } = await sb.from("expedientes")
        .select("id,started_at,ended_at,status,report_text")
        .eq("team_id", args.teamId).order("started_at", { ascending: false }).limit(200);
      if (error) throw new Error(error.message);
      return data ?? [];
    }
    case "adminDeleteShift": {
      for (const [t, col] of [
        ["vinculos_complementos", "shift_id"], ["servicos", "shift_id"],
        ["impactos_expediente", "shift_id"], ["expedientes", "id"],
      ] as const) {
        const { error } = await sb.from(t).delete().eq(col, args.shiftId);
        if (error) throw new Error(error.message);
      }
      return { ok: true };
    }
    case "adminUpdateShiftReport": {
      const { error } = await sb.from("expedientes").update({ report_text: args.reportText }).eq("id", args.shiftId);
      if (error) throw new Error(error.message);
      return { ok: true };
    }

    // ---------- Leaders ----------
    case "adminCreateLeader": {
      if (String(args.password).length < 6) throw new Error("Senha mínima de 6 caracteres.");
      const slug = slugify(args.login);
      if (!slug || slug.length < 3) throw new Error("Login inválido.");
      const email = `${slug}@gpva.local`;
      const { data: created, error } = await sb.auth.admin.createUser({
        email, password: args.password, email_confirm: true,
        user_metadata: { is_leader: true, display_name: String(args.leaderName).trim() },
      });
      if (error) throw new Error(error.message);
      if (created.user?.id) {
        await sb.from("user_roles").upsert({ user_id: created.user.id, role: "leader" }, { onConflict: "user_id,role" });
      }
      return { ok: true, login: slug.toUpperCase() };
    }
    case "adminListLeaders": {
      const { data: roles, error } = await sb.from("user_roles").select("user_id,created_at").eq("role", "leader");
      if (error) throw new Error(error.message);
      const ids = (roles ?? []).map((r: any) => r.user_id);
      if (!ids.length) return [];
      const list = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 });
      if (list.error) throw new Error(list.error.message);
      const byId = new Map(list.data.users.map((u: any) => [u.id, u]));
      return ids.map((id: string) => {
        const u = byId.get(id); if (!u) return null;
        const display = (u.user_metadata as any)?.display_name ?? "";
        return { id, email: u.email ?? "", login: (u.email ?? "").split("@")[0].toUpperCase(), display_name: display };
      }).filter(Boolean).sort((a: any, b: any) => a.login.localeCompare(b.login));
    }
    case "adminDeleteLeader": {
      const { error } = await sb.auth.admin.deleteUser(args.leaderId);
      if (error) throw new Error(error.message);
      return { ok: true };
    }

    // ---------- Setores ----------
    case "adminListSetores": {
      const { data, error } = await sb.from("setores").select("id,nome,supervisor_nome").order("nome");
      if (error) throw new Error(error.message);
      return data ?? [];
    }
    case "adminCreateSetor": {
      const nome = String(args.nome).trim(); if (!nome) throw new Error("Nome obrigatório.");
      const { error } = await sb.from("setores").insert({ nome, supervisor_nome: String(args.supervisorNome ?? "").trim() });
      if (error) throw new Error(error.message);
      return { ok: true };
    }
    case "adminUpdateSetor": {
      const patch: any = {};
      if (args.nome !== undefined) { const n = String(args.nome).trim(); if (!n) throw new Error("Nome obrigatório."); patch.nome = n; }
      if (args.supervisorNome !== undefined) patch.supervisor_nome = String(args.supervisorNome).trim();
      if (Object.keys(patch).length === 0) return { ok: true };
      const { error } = await sb.from("setores").update(patch).eq("id", args.setorId);
      if (error) throw new Error(error.message);
      return { ok: true };
    }
    case "adminDeleteSetor": {
      const { count, error: e1 } = await sb.from("equipes").select("id", { count: "exact", head: true }).eq("setor_id", args.setorId);
      if (e1) throw new Error(e1.message);
      if ((count ?? 0) > 0) throw new Error("Setor possui equipes vinculadas.");
      const { error } = await sb.from("setores").delete().eq("id", args.setorId);
      if (error) throw new Error(error.message);
      return { ok: true };
    }

    // ---------- Google form ----------
    case "adminGetGoogleFormSettings": {
      const { data, error } = await sb.from("google_form_settings")
        .select("mode,prod_form_id,test_form_id,prod_entries,test_entries,updated_at")
        .eq("id", "singleton").maybeSingle();
      if (error) throw new Error(error.message);
      return data;
    }
    case "adminSetGoogleFormMode": {
      const { error } = await sb.from("google_form_settings")
        .update({ mode: args.mode, updated_at: new Date().toISOString() }).eq("id", "singleton");
      if (error) throw new Error(error.message);
      return { ok: true };
    }
    case "adminUpdateGoogleForm": {
      const formId = parseGoogleFormId(args.formIdOrUrl);
      const entries = await extractEntriesFromForm(formId);
      const patch = args.target === "prod"
        ? { prod_form_id: formId, prod_entries: entries }
        : { test_form_id: formId, test_entries: entries };
      const { error } = await sb.from("google_form_settings")
        .update({ ...patch, updated_at: new Date().toISOString() }).eq("id", "singleton");
      if (error) throw new Error(error.message);
      return { ok: true, formId, entries };
    }

    // ---------- Audit ----------
    case "auditDb": return await auditDb(sb);
    case "auditSecurity": return await auditSecurity(sb);
    case "auditAccounts": return await auditAccounts(sb);
    case "auditConfig": return await auditConfig(sb);
    case "auditSave": {
      const { data, error } = await sb.from("audit_reports").insert({
        duration_ms: args.duration_ms, overall_score: args.overall_score,
        counts: args.counts, report: args.report,
      }).select("id,created_at").single();
      if (error) throw new Error(error.message);
      return data;
    }
    case "auditList": {
      const { data, error } = await sb.from("audit_reports")
        .select("id,created_at,duration_ms,overall_score,counts")
        .order("created_at", { ascending: false }).limit(30);
      if (error) throw new Error(error.message);
      return data;
    }
    case "auditDelete": {
      const { error } = await sb.from("audit_reports").delete().eq("id", args.id);
      if (error) throw new Error(error.message);
      return { ok: true };
    }
    case "auditGet": {
      const { data, error } = await sb.from("audit_reports")
        .select("id,created_at,duration_ms,overall_score,counts,report")
        .eq("id", args.id).maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) throw new Error("Relatório não encontrado");
      return data;
    }

    // ---------- Map services (marcações do mapa) ----------
    case "adminListMapServices": {
      // args: { teamId?: string, startISO?: string, endISO?: string, limit?: number }
      let q = sb.from("servicos")
        .select("id,created_at,team_id,lat,lng,viable,is_negotiation,service_type_name,negotiated_value,registration_number")
        .order("created_at", { ascending: false })
        .limit(Math.min(Number(args.limit) || 500, 2000));
      if (args.teamId) q = q.eq("team_id", args.teamId);
      if (args.startISO) q = q.gte("created_at", args.startISO);
      if (args.endISO) q = q.lt("created_at", args.endISO);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      // Enriquecer com nome da equipe
      const teamIds = Array.from(new Set((data ?? []).map((r: any) => r.team_id).filter(Boolean)));
      const teamMap = new Map<string, string>();
      if (teamIds.length) {
        const { data: tRows } = await sb.from("equipes").select("id,team_name").in("id", teamIds);
        for (const t of tRows ?? []) teamMap.set(t.id, t.team_name);
      }
      return (data ?? []).map((r: any) => ({ ...r, team_name: teamMap.get(r.team_id) ?? "—" }));
    }
    case "adminDeleteMapService": {
      // Remove vínculos primeiro (não há CASCADE garantido).
      await sb.from("vinculos_complementos").delete().eq("service_id", args.id);
      const { error } = await sb.from("servicos").delete().eq("id", args.id);
      if (error) throw new Error(error.message);
      return { ok: true };
    }
    case "adminDeleteMapServicesRange": {
      // args: { teamId?, startISO?, endISO? }  → deleta todos que casam
      let q = sb.from("servicos").select("id");
      if (args.teamId) q = q.eq("team_id", args.teamId);
      if (args.startISO) q = q.gte("created_at", args.startISO);
      if (args.endISO) q = q.lt("created_at", args.endISO);
      const { data: rows, error: e1 } = await q;
      if (e1) throw new Error(e1.message);
      const ids = (rows ?? []).map((r: any) => r.id);
      if (!ids.length) return { ok: true, deleted: 0 };
      await sb.from("vinculos_complementos").delete().in("service_id", ids);
      const { error } = await sb.from("servicos").delete().in("id", ids);
      if (error) throw new Error(error.message);
      return { ok: true, deleted: ids.length };
    }

    default: throw new Error(`Operação desconhecida: ${op}`);
  }
}

// -------- audit helpers (mirrors src/lib/audit/audit.functions.ts) --------
async function auditDb(sb: any) {
  const results: any[] = [];
  const t0 = Date.now();
  try {
    const { error } = await sb.from("equipes").select("id", { count: "exact", head: true });
    const ms = Date.now() - t0;
    if (error) results.push({ id: "db.connection", category: "banco", title: "Conexão com o banco", severity: "error", message: error.message });
    else results.push({ id: "db.connection", category: "banco", title: "Conexão com o banco",
      severity: ms > 800 ? "warning" : "info", message: `Latência: ${ms}ms`, evidence: { latency_ms: ms },
      suggestion: ms > 800 ? "Latência acima de 800ms." : undefined });
  } catch (e) { results.push({ id: "db.connection", category: "banco", title: "Conexão com o banco", severity: "error", message: (e as Error).message }); }
  const tables = ["servicos","expedientes","equipes","setores","tipos_servico","complementos_servico","vinculos_complementos","impactos","impactos_expediente","motivos_inviabilidade","user_roles","active_sessions","catalog_order","google_form_settings","audit_reports"];
  for (const t of tables) {
    try {
      const { count, error } = await sb.from(t).select("*", { count: "exact", head: true });
      if (error) results.push({ id: `db.table.${t}`, category: "banco", title: `Tabela ${t}`, severity: "error", message: error.message, location: `public.${t}` });
      else results.push({ id: `db.table.${t}`, category: "banco", title: `Tabela ${t}`, severity: "info", message: `${count ?? 0} registros`, evidence: { rows: count ?? 0 }, location: `public.${t}` });
    } catch (e) { results.push({ id: `db.table.${t}`, category: "banco", title: `Tabela ${t}`, severity: "error", message: (e as Error).message }); }
  }
  return results;
}
async function auditSecurity(sb: any) {
  const results: any[] = [];
  try {
    const { data, error } = await sb.rpc("has_role", { _user_id: "00000000-0000-0000-0000-000000000000", _role: "admin" });
    results.push({ id: "sec.rpc.has_role", category: "seguranca", title: "Função has_role acessível",
      severity: error ? "error" : "info", message: error ? error.message : `Retorno: ${String(data)}` });
  } catch (e) { results.push({ id: "sec.rpc.has_role", category: "seguranca", title: "Função has_role", severity: "error", message: (e as Error).message }); }
  for (const name of ["SUPABASE_URL","SUPABASE_PUBLISHABLE_KEY","SUPABASE_SERVICE_ROLE_KEY","LOVABLE_API_KEY"]) {
    const present = Boolean(Deno.env.get(name));
    results.push({ id: `sec.secret.${name}`, category: "seguranca", title: `Segredo ${name}`,
      severity: present ? "info" : "error", message: present ? "Configurado" : "Ausente" });
  }
  return results;
}
async function auditAccounts(sb: any) {
  const results: any[] = [];
  try {
    const { data: roles } = await sb.from("user_roles").select("user_id,role");
    const admins = (roles ?? []).filter((r: any) => r.role === "admin").length;
    const leaders = (roles ?? []).filter((r: any) => r.role === "leader").length;
    results.push({ id: "acc.admins", category: "contas", title: "Administradores cadastrados",
      severity: admins === 0 ? "error" : "info", message: `${admins} admin(s)` });
    results.push({ id: "acc.leaders", category: "contas", title: "Líderes cadastrados", severity: "info", message: `${leaders} líder(es)` });
  } catch (e) { results.push({ id: "acc.roles", category: "contas", title: "user_roles", severity: "error", message: (e as Error).message }); }
  try {
    const { data: teams } = await sb.from("equipes").select("id,team_name");
    const semNome = (teams ?? []).filter((t: any) => !t.team_name || !t.team_name.trim()).length;
    results.push({ id: "acc.teams.no_name", category: "contas", title: "Equipes sem nome",
      severity: semNome === 0 ? "info" : "warning", message: semNome === 0 ? "OK" : `${semNome} equipe(s) sem team_name` });
  } catch (e) { results.push({ id: "acc.teams", category: "contas", title: "Equipes", severity: "warning", message: (e as Error).message }); }
  return results;
}
async function auditConfig(sb: any) {
  const results: any[] = [];
  try {
    const { data: row } = await sb.from("google_form_settings")
      .select("mode,prod_form_id,test_form_id,prod_entries,test_entries").eq("id", "singleton").maybeSingle();
    if (!row) results.push({ id: "cfg.form.singleton", category: "config", title: "google_form_settings singleton", severity: "error", message: "Singleton ausente" });
    else {
      const r: any = row;
      results.push({ id: "cfg.form.mode", category: "config", title: "Modo do Google Forms",
        severity: r.mode === "prod" || r.mode === "test" ? "info" : "error", message: `Modo: ${r.mode}` });
      const req = ["data","lider","setor","matricula","pagamento","valorAVista","valorTotalParcelado"];
      for (const target of ["prod","test"] as const) {
        const entries = target === "prod" ? r.prod_entries : r.test_entries;
        const missing = req.filter((k) => !entries?.[k]);
        const fid = target === "prod" ? r.prod_form_id : r.test_form_id;
        results.push({ id: `cfg.form.${target}`, category: "config", title: `Formulário ${target}`,
          severity: !fid ? "error" : missing.length ? "warning" : "info",
          message: !fid ? "form_id vazio" : missing.length ? `Campos ausentes: ${missing.join(", ")}` : "OK" });
      }
    }
  } catch (e) { results.push({ id: "cfg.form", category: "config", title: "Google Forms", severity: "error", message: (e as Error).message }); }
  return results;
}