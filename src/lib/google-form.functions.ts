import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ADMIN_PASSWORD } from "./admin.functions";

function assertAdmin(pw: string) {
  if (pw !== ADMIN_PASSWORD) throw new Error("Senha de administrador inválida.");
}

export type FormEntries = {
  data: string;
  lider: string;
  setor: string;
  matricula: string;
  pagamento: string;
  valorAVista: string;
  valorTotalParcelado: string;
  qtdParcelas?: string;
};

export type FormSettingsRow = {
  mode: "prod" | "test";
  prod_form_id: string;
  test_form_id: string;
  prod_entries: FormEntries;
  test_entries: FormEntries;
};

function stripDiacritics(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim();
}

// Extrai o ID do form a partir de uma URL ou aceita o ID puro.
export function parseGoogleFormId(input: string): string {
  const s = input.trim();
  const m = s.match(/\/d\/e\/([a-zA-Z0-9_-]+)/) || s.match(/\/forms\/d\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : s;
}

// Baixa o viewform público e extrai os entry.* de cada campo pelo label.
export async function extractEntriesFromForm(formId: string): Promise<FormEntries> {
  const url = `https://docs.google.com/forms/d/e/${formId}/viewform`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Não foi possível abrir o formulário (${res.status}).`);
  const html = await res.text();
  const m = html.match(/FB_PUBLIC_LOAD_DATA_ = (.*?);<\/script>/s);
  if (!m) throw new Error("Formato do formulário não reconhecido.");
  const data = JSON.parse(m[1]);
  const fields: unknown[] = data?.[1]?.[1] ?? [];
  const map = new Map<string, string>();
  for (const raw of fields) {
    const f = raw as [unknown, string, ...unknown[]];
    const label = typeof f[1] === "string" ? stripDiacritics(f[1]) : "";
    const entryArr = (f as unknown as [unknown, unknown, unknown, unknown, [unknown, ...unknown[]][]])[4];
    if (!label || !Array.isArray(entryArr) || !entryArr[0]) continue;
    const id = entryArr[0][0];
    if (typeof id === "number") map.set(label, `entry.${id}`);
  }
  const need = (labels: string[], key: string): string => {
    for (const l of labels) {
      const v = map.get(stripDiacritics(l));
      if (v) return v;
    }
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
    qtdParcelas: (() => {
      const v = map.get(stripDiacritics("QUANTIDADE DE PARCELAS"));
      return v;
    })(),
  };
}

export const getGoogleFormSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("google_form_settings")
      .select("mode,prod_form_id,test_form_id,prod_entries,test_entries")
      .eq("id", "singleton")
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data as FormSettingsRow | null;
  });

export const adminGetGoogleFormSettings = createServerFn({ method: "POST" })
  .inputValidator((d: { adminPassword: string }) => d)
  .handler(async ({ data }) => {
    assertAdmin(data.adminPassword);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("google_form_settings")
      .select("mode,prod_form_id,test_form_id,prod_entries,test_entries,updated_at")
      .eq("id", "singleton")
      .maybeSingle();
    if (error) throw new Error(error.message);
    return row;
  });

export const adminSetGoogleFormMode = createServerFn({ method: "POST" })
  .inputValidator((d: { adminPassword: string; mode: "prod" | "test" }) => d)
  .handler(async ({ data }) => {
    assertAdmin(data.adminPassword);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("google_form_settings")
      .update({ mode: data.mode, updated_at: new Date().toISOString() })
      .eq("id", "singleton");
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const adminUpdateGoogleForm = createServerFn({ method: "POST" })
  .inputValidator((d: { adminPassword: string; target: "prod" | "test"; formIdOrUrl: string }) => d)
  .handler(async ({ data }) => {
    assertAdmin(data.adminPassword);
    const formId = parseGoogleFormId(data.formIdOrUrl);
    const entries = await extractEntriesFromForm(formId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const patch =
      data.target === "prod"
        ? { prod_form_id: formId, prod_entries: entries }
        : { test_form_id: formId, test_entries: entries };
    const { error } = await supabaseAdmin
      .from("google_form_settings")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", "singleton");
    if (error) throw new Error(error.message);
    return { ok: true as const, formId, entries };
  });

