import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useIsLeader(userId: string | null) {
  return useQuery({
    queryKey: ["is-leader", userId],
    enabled: !!userId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId!)
        .eq("role", "leader")
        .maybeSingle();
      if (error) throw error;
      return !!data;
    },
  });
}