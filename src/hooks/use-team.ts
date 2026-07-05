import { useQuery } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { cacheTeam, getCachedTeam } from "@/lib/db/catalogs";

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
    queryFn: async (): Promise<Team | null> => {
      try {
        const db = supabase as SupabaseClient;
        const { data, error } = await db
          .from("equipes")
          .select("id,team_name,supervisor,leader,variable_rate,onboarded,photo_url,collaborator1,collaborator2,setor_id,setores(nome,supervisor_nome)")
          .maybeSingle();
        if (error) throw error;
        if (!data) return userId ? await getCachedTeam(userId) : null;
        const setor = (data as unknown as { setores: { nome: string; supervisor_nome: string } | null }).setores;
        const team: Team = {
          id: data.id,
          team_name: data.team_name,
          supervisor: data.supervisor,
          leader: data.leader,
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
        if (userId) {
          const cached = await getCachedTeam(userId);
          if (cached) return cached;
        }
        throw err;
      }
    },
  });
}