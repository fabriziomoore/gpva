// Mobile (APK Android) equivalents of google-form server functions.
import { callAdminApi } from "./admin-api.mobile";
import { supabase } from "@/integrations/supabase/client";

export type FormEntries = {
  data: string; lider: string; setor: string; matricula: string;
  pagamento: string; valorAVista: string; valorTotalParcelado: string; qtdParcelas?: string;
};
export type FormSettingsRow = {
  mode: "prod" | "test"; prod_form_id: string; test_form_id: string;
  prod_entries: FormEntries; test_entries: FormEntries;
};

export function parseGoogleFormId(input: string): string {
  const s = input.trim();
  const m = s.match(/\/d\/e\/([a-zA-Z0-9_-]+)/) || s.match(/\/forms\/d\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : s;
}

function stripDiacritics(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
}

// Espelha src/lib/google-form.functions.ts#extractEntriesFromForm — só usa
// fetch/JSON.parse, então roda igual no WebView do Capacitor.
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
    qtdParcelas: map.get(stripDiacritics("QUANTIDADE DE PARCELAS")),
  };
}

export const getGoogleFormSettings = async (): Promise<FormSettingsRow | null> => {
  const { data, error } = await supabase
    .from("google_form_settings")
    .select("mode,prod_form_id,test_form_id,prod_entries,test_entries")
    .eq("id", "singleton").maybeSingle();
  if (error) throw new Error(error.message);
  return data as FormSettingsRow | null;
};

type Args<T> = { data: T & { adminPassword: string } };
const call = <R,>(op: string) => async <T,>(arg: Args<T>): Promise<R> => {
  const { adminPassword, ...rest } = arg.data as { adminPassword: string } & Record<string, unknown>;
  return callAdminApi<R>(op, rest, adminPassword);
};

export const adminGetGoogleFormSettings = call<(FormSettingsRow & { updated_at: string }) | null>("adminGetGoogleFormSettings");
export const adminSetGoogleFormMode = call<{ ok: true }>("adminSetGoogleFormMode");
export const adminUpdateGoogleForm = call<{ ok: true; formId: string; entries: FormEntries }>("adminUpdateGoogleForm");