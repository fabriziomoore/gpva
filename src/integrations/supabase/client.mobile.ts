import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

function isNewSupabaseApiKey(value: string): boolean {
  return value.startsWith("sb_publishable_") || value.startsWith("sb_secret_");
}

function createSupabaseFetch(supabaseKey: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(
      typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined,
    );

    if (init?.headers) {
      new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    }

    if (isNewSupabaseApiKey(supabaseKey) && headers.get("Authorization") === `Bearer ${supabaseKey}`) {
      headers.delete("Authorization");
    }

    headers.set("apikey", supabaseKey);
    // O WebView do Android aplica cache HTTP próprio por padrão quando a
    // resposta não traz Cache-Control explícito (é o caso da API REST do
    // Supabase). Isso fazia consultas repetidas com a mesma URL (ex.: "qual
    // a última atualização publicada?") continuarem retornando uma resposta
    // antiga já guardada, mesmo com dado novo no banco — sem nunca voltar
    // pra rede. no-store garante que toda chamada é sempre uma ida real ao
    // servidor.
    return fetch(input, { ...init, headers, cache: "no-store" });
  };
}

function createMobileSupabaseClient() {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !publishableKey) {
    throw new Error("Configuração do backend ausente no build Android.");
  }

  return createClient<Database>(supabaseUrl, publishableKey, {
    global: {
      fetch: createSupabaseFetch(publishableKey),
    },
    auth: {
      storage: typeof window !== "undefined" ? window.localStorage : undefined,
      persistSession: true,
      autoRefreshToken: true,
    },
  });
}

export const supabase = createMobileSupabaseClient();