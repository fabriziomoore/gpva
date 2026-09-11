// Mobile (APK Android) equivalent of hd-form server functions.
import { callAdminApi } from "./admin-api.mobile";
import { supabase } from "@/integrations/supabase/client";

export type HdFormUrlResult = { url: string | null; isTest: boolean };

export const getHdFormUrl = async (): Promise<HdFormUrlResult | null> => {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  const { data: eq } = userId
    ? await supabase.from("equipes").select("is_test,team_name").eq("id", userId).maybeSingle()
    : { data: null };
  const isTest = eq?.is_test === true || eq?.team_name === "TESTANDO";

  const { data, error } = await supabase
    .from("hd_form_settings")
    .select("prod_url,test_url")
    .eq("id", "singleton")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return { url: isTest ? data.test_url : data.prod_url, isTest };
};

type Args<T> = { data: T & { adminPassword: string } };
const call = <R,>(op: string) => async <T,>(arg: Args<T>): Promise<R> => {
  const { adminPassword, ...rest } = arg.data as { adminPassword: string } & Record<string, unknown>;
  return callAdminApi<R>(op, rest, adminPassword);
};

export const adminGetHdFormSettings = call<{ prod_url: string; test_url: string | null; updated_at: string } | null>("adminGetHdFormSettings");
export const adminUpdateHdForm = call<{ ok: true }>("adminUpdateHdForm");
