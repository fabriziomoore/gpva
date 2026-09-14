// Redireciona sempre para o APK da release mais recente em app_releases.
// Pública (sem JWT) de propósito — é o link que o QR code da tela de login
// aponta, pra um celular novo (sem conta, sem sessão) conseguir baixar o
// instalador direto. O arquivo em si já é público no Storage; essa função só
// evita ter que atualizar o QR/link a cada release (o version_code muda).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) {
    return new Response("Server misconfigured", { status: 500, headers: cors });
  }

  const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await sb
    .from("app_releases")
    .select("url,version_name")
    .order("version_code", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return new Response(`Erro ao consultar releases: ${error.message}`, { status: 500, headers: cors });
  }
  if (!data?.url) {
    return new Response("Nenhuma versão publicada ainda.", { status: 404, headers: cors });
  }

  return new Response(null, { status: 302, headers: { ...cors, Location: data.url } });
});
