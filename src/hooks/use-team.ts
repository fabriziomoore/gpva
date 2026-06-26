import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type Team = {
  id: string;
  team_name: string;
  supervisor: string;
  leader: string;
  variable_rate: number;
  onboarded: boolean;
};

export function useTeam(userId: string | null) {
  return useQuery({
    queryKey: ["team", userId],
    enabled: !!userId,
    queryFn: async (): Promise<Team | null> => {
      const { data, error } = await supabase
        .from("teams")
        .select("id,team_name,supervisor,leader,variable_rate,onboarded")
        .maybeSingle();
      if (error) throw error;
      return data as Team | null;
    },
  });
}