import { supabase } from "@/integrations/supabase/client";
import { useCachedQuery } from "@/lib/db/catalogs";
import { useAuthSession } from "@/hooks/use-auth";
import type { DecisionTree } from "@/lib/procedures/tree-validation";

export type PublishedProcedure = {
  id: string;
  procedimento_id: string;
  titulo: string;
  categoria: string;
  descricao: string | null;
  setor: string | null;
  fonte: string | null;
  arvore_decisao: DecisionTree;
  vigencia_inicio: string;
};

/**
 * Procedimentos publicados e em vigência agora — é o que a equipe pode ver
 * (RLS já restringe a isso; o filtro aqui só evita mostrar algo fora da
 * janela de vigência antes da resposta do banco confirmar).
 *
 * Cacheado offline-first (mesmo padrão dos catálogos): consulta rápida em
 * campo precisa funcionar mesmo sem sinal, então a última lista publicada
 * fica salva localmente e é usada sempre que a rede falhar ou estiver
 * indisponível.
 */
export function usePublishedProcedures() {
  const { userId } = useAuthSession();
  return useCachedQuery<PublishedProcedure[]>(
    "cat:published_procedures:global",
    async () => {
      const nowIso = new Date().toISOString();
      const { data, error } = await supabase
        .from("procedimento_versoes")
        .select("id, procedimento_id, titulo, categoria, descricao, setor, fonte, arvore_decisao, vigencia_inicio, vigencia_fim")
        .eq("status", "published")
        .lte("vigencia_inicio", nowIso)
        .or(`vigencia_fim.is.null,vigencia_fim.gte.${nowIso}`)
        .order("titulo");
      if (error) throw error;
      return (data ?? []).map((row) => ({
        id: row.id,
        procedimento_id: row.procedimento_id,
        titulo: row.titulo,
        categoria: row.categoria,
        descricao: row.descricao,
        setor: row.setor,
        fonte: row.fonte,
        vigencia_inicio: row.vigencia_inicio,
        arvore_decisao: row.arvore_decisao as unknown as DecisionTree,
      }));
    },
    ["cached", "published_procedures", "global"],
    !!userId,
  );
}
