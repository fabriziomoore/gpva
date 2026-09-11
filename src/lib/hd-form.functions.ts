import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ADMIN_PASSWORD } from "./admin.functions";

function assertAdmin(pw: string) {
  if (pw !== ADMIN_PASSWORD) throw new Error("Senha de administrador inválida.");
}

export type HdFormUrlResult = { url: string | null; isTest: boolean };

// Decide qual link do Forms de devolução de HD usar: contas de teste sempre
// recebem test_url (ou null se o admin ainda não configurou uma), equipes
// reais sempre recebem prod_url. Nunca cai para produção numa conta de
// teste — isso é o que evita enviar dado de teste pro formulário real.
export const getHdFormUrl = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<HdFormUrlResult | null> => {
    const { data: eq } = await context.supabase
      .from("equipes")
      .select("is_test,team_name")
      .eq("id", context.userId)
      .maybeSingle();
    const isTest = eq?.is_test === true || eq?.team_name === "TESTANDO";

    const { data, error } = await context.supabase
      .from("hd_form_settings")
      .select("prod_url,test_url")
      .eq("id", "singleton")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    return { url: isTest ? data.test_url : data.prod_url, isTest };
  });

export const adminGetHdFormSettings = createServerFn({ method: "POST" })
  .inputValidator((d: { adminPassword: string }) => d)
  .handler(async ({ data }) => {
    assertAdmin(data.adminPassword);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("hd_form_settings")
      .select("prod_url,test_url,updated_at")
      .eq("id", "singleton")
      .maybeSingle();
    if (error) throw new Error(error.message);
    return row;
  });

export const adminUpdateHdForm = createServerFn({ method: "POST" })
  .inputValidator((d: { adminPassword: string; target: "prod" | "test"; url: string }) => d)
  .handler(async ({ data }) => {
    assertAdmin(data.adminPassword);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const patch = data.target === "prod" ? { prod_url: data.url } : { test_url: data.url };
    const { error } = await supabaseAdmin
      .from("hd_form_settings")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", "singleton");
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
