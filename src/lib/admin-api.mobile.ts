// Cliente para a Edge Function `admin-api` (usada no APK Android).
import { supabase } from "@/integrations/supabase/client";

export async function callAdminApi<T>(op: string, args: Record<string, unknown>, adminPassword: string): Promise<T> {
  const { data, error } = await supabase.functions.invoke<{ data?: T; error?: string }>(
    "admin-api",
    { body: { op, args, adminPassword } },
  );
  if (error) throw new Error(error.message || "Falha ao chamar admin-api");
  if (!data) throw new Error("Resposta vazia da admin-api");
  if (data.error) throw new Error(data.error);
  return data.data as T;
}