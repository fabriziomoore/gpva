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
  collaborator1_lastname: string | null;
  collaborator2_lastname: string | null;
  vehicle_plate: string | null;
  setor_id?: string | null;
  setor_nome?: string | null;
  setor_supervisor?: string | null;
  setor_variavel_ativo: boolean;
  setor_negociacao_ativa: boolean;
  /** Cards do Expediente ocultos pro setor (Admin → Setores). */
  setor_kpis_ocultos: string[];
  is_test: boolean;
};

export function useTeam(userId: string | null) {
  return useQuery({
    queryKey: ["team", userId],
    enabled: !!userId,
    networkMode: "always",
    retry: false,
    staleTime: 5 * 60 * 1000,
    // Configurações do setor (variável, negociação) podem mudar no admin
    // enquanto a equipe já está com o app aberto/em segundo plano — sem
    // refetch aqui, o menu e a página Variável ficavam presos no valor
    // antigo pelo resto da sessão (só corrigia com logout/login de novo).
    refetchOnWindowFocus: true,
    refetchInterval: 5 * 60 * 1000,
    initialData: () => (userId ? undefined : null),
    queryFn: async (): Promise<Team | null> => {
      const cachedRaw = userId ? await getCachedTeam(userId) : null;
      const cached: Team | null = cachedRaw
        ? {
            ...cachedRaw,
            vehicle_plate: cachedRaw.vehicle_plate ?? null,
            collaborator1_lastname: cachedRaw.collaborator1_lastname ?? null,
            collaborator2_lastname: cachedRaw.collaborator2_lastname ?? null,
            setor_variavel_ativo: cachedRaw.setor_variavel_ativo ?? true,
            setor_negociacao_ativa: cachedRaw.setor_negociacao_ativa ?? false,
            setor_kpis_ocultos: cachedRaw.setor_kpis_ocultos ?? [],
            is_test: cachedRaw.is_test ?? false,
          }
        : null;
      if (isOffline() && cached) return cached;
      try {
        const { data, error } = await withTimeout(
          supabase
            .from("equipes")
            .select("id,team_name,supervisor,leader,variable_rate,onboarded,photo_url,collaborator1,collaborator2,collaborator1_lastname,collaborator2_lastname,vehicle_plate,setor_id,is_test,setores(nome,supervisor_nome,variavel_ativo,negociacao_ativa,kpis_ocultos),supervisores(nome),lideres_estrutura(nome)")
            .maybeSingle(),
        );
        if (error) throw error;
        if (!data) return cached;
        const setor = (data as unknown as { setores: { nome: string; supervisor_nome: string; variavel_ativo: boolean; negociacao_ativa: boolean; kpis_ocultos: string[] | null } | null }).setores;
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
          collaborator1_lastname: data.collaborator1_lastname,
          collaborator2_lastname: data.collaborator2_lastname,
          vehicle_plate: data.vehicle_plate,
          setor_id: data.setor_id,
          setor_nome: setor?.nome ?? null,
          setor_supervisor: setor?.supervisor_nome ?? null,
          setor_variavel_ativo: setor?.variavel_ativo ?? true,
          setor_negociacao_ativa: setor?.negociacao_ativa ?? false,
          setor_kpis_ocultos: setor?.kpis_ocultos ?? [],
          is_test: !!data.is_test,
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