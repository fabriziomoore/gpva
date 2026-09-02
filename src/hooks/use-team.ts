import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cacheTeam, getCachedTeam } from "@/lib/db/catalogs";

const TEAM_QUERY_TIMEOUT_MS = 2_500;

function isOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

async function withTimeout<T>(promise: PromiseLike<T>, ms = TEAM_QUERY_TIMEOUT_MS): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error("Consulta da equipe excedeu o tempo limite")), ms);
      }),
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

export type Team = {
  id: string;
  team_name: string;
  supervisor: string;
  leader: string;
  variable_rate: number;
  onboarded: boolean;
  photo_url: string | null;
  collaborator1: string | null;
  collaborator2: string | null;
  setor_id?: string | null;
  setor_nome?: string | null;
  setor_supervisor?: string | null;
};

export function useTeam(userId: string | null) {
  return useQuery({
    queryKey: ["team", userId],
    enabled: !!userId,
    networkMode: "always",
    retry: false,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    initialData: () => (userId ? undefined : null),
    queryFn: async (): Promise<Team | null> => {
      const cached = userId ? await getCachedTeam(userId) : null;
      if (isOffline() && cached) return cached;
      try {
        const { data, error } = await withTimeout(
          supabase
            .from("equipes")
            .select("id,team_name,supervisor,leader,variable_rate,onboarded,photo_url,collaborator1,collaborator2,setor_id,setores(nome,supervisor_nome),supervisores(nome),lideres_estrutura(nome)")
            .maybeSingle(),
        );
        if (error) throw error;
        if (!data) return cached;
        const setor = (data as unknown as { setores: { nome: string; supervisor_nome: string } | null }).setores;
        // supervisor_id/leader_id (estrutura canonica) sao a fonte da verdade
        // desde a A5; equipes criadas depois nunca tem o texto legado
        // preenchido (so o admin escreve os IDs). Cai pro texto so em
        // equipes antigas/de teste sem vinculo estrutural.
        const supEstrutura = (data as unknown as { supervisores: { nome: string } | null }).supervisores;
        const lidEstrutura = (data as unknown as { lideres_estrutura: { nome: string } | null }).lideres_estrutura;
        const team: Team = {
          id: data.id,
          team_name: data.team_name,
          supervisor: supEstrutura?.nome || data.supervisor,
          leader: lidEstrutura?.nome || data.leader,
          variable_rate: data.variable_rate,
          onboarded: data.onboarded,
          photo_url: data.photo_url,
          collaborator1: data.collaborator1,
          collaborator2: data.collaborator2,
          setor_id: data.setor_id,
          setor_nome: setor?.nome ?? null,
          setor_supervisor: setor?.supervisor_nome ?? null,
        };
        await cacheTeam(team);
        return team;
      } catch (err) {
        if (cached) return cached;
        throw err;
      }
    },
  });
}