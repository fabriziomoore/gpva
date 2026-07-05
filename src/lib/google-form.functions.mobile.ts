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