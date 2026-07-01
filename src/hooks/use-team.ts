import { useQuery } from "@tanstack/react-query";
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
};

export function useTeam(userId: string | null) {
  return useQuery({
    queryKey: ["team", userId],
    enabled: !!userId,
    queryFn: async (): Promise<Team | null> => {
      try {
        const { data, error } = await supabase
          .from("equipes")
          .select("id,team_name,supervisor,leader,variable_rate,onboarded,photo_url,collaborator1,collaborator2")
          .maybeSingle();
        if (error) throw error;
        if (data) await cacheTeam(data as Team);
        return (data as Team) ?? (userId ? await getCachedTeam(userId) : null);
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