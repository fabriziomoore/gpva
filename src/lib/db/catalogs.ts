import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getLocalDB } from "./local-db";

// Reads from network and caches into Dexie kv. When the network fails
// (offline / first load without connectivity after a successful run),
// we transparently return the last cached snapshot so the UI keeps working.

type Fetcher<T> = () => Promise<T>;

async function readCache<T>(key: string): Promise<T | null> {
  try {
    const row = await getLocalDB().kv.get(key);
    return (row?.value as T) ?? null;
  } catch {
    return null;
  }
}

async function writeCache<T>(key: string, value: T): Promise<void> {
  try {
    await getLocalDB().kv.put({ key, value });
  } catch {
    /* ignore */
  }
}

function useCachedQuery<T>(key: string, fetcher: Fetcher<T>, queryKey: unknown[]) {
  return useQuery({
    queryKey,
    queryFn: async (): Promise<T> => {
      try {
        const fresh = await fetcher();
        await writeCache(key, fresh);
        return fresh;
      } catch (err) {
        const cached = await readCache<T>(key);
        if (cached != null) return cached;
        throw err;
      }
    },
    initialData: () => undefined,
    staleTime: 5 * 60 * 1000,
  });
}

export type CatServiceType = { id: string; name: string; is_negotiation: boolean; sort_order: number };
export type CatReason = { id: string; name: string };
export type CatComplement = { id: string; name: string; sort_order: number };
export type CatImpact = { id: string; name: string };

export function useServiceTypesCached() {
  return useCachedQuery<CatServiceType[]>(
    "cat:service_types",
    async () => {
      const { data, error } = await supabase
        .from("service_types")
        .select("id,name,is_negotiation,sort_order")
        .eq("active", true)
        .order("sort_order")
        .order("name");
      if (error) throw error;
      return (data ?? []) as CatServiceType[];
    },
    ["cached", "service_types"],
  );
}

export function useReasonsCached() {
  return useCachedQuery<CatReason[]>(
    "cat:inviability_reasons",
    async () => {
      const { data, error } = await supabase
        .from("inviability_reasons")
        .select("id,name")
        .eq("active", true)
        .order("name");
      if (error) throw error;
      return (data ?? []) as CatReason[];
    },
    ["cached", "inviability_reasons"],
  );
}

export function useComplementsCached() {
  return useCachedQuery<CatComplement[]>(
    "cat:service_complements",
    async () => {
      const { data, error } = await supabase
        .from("service_complements")
        .select("id,name,sort_order")
        .eq("active", true)
        .order("sort_order")
        .order("name");
      if (error) throw error;
      return (data ?? []) as CatComplement[];
    },
    ["cached", "service_complements"],
  );
}

export function useImpactsCached() {
  return useCachedQuery<CatImpact[]>(
    "cat:impacts",
    async () => {
      const { data, error } = await supabase
        .from("impacts")
        .select("id,name")
        .eq("active", true)
        .order("name");
      if (error) throw error;
      return (data ?? []) as CatImpact[];
    },
    ["cached", "impacts"],
  );
}

export type CatTeam = {
  id: string;
  team_name: string;
  supervisor: string;
  leader: string;
  variable_rate: number;
  onboarded: boolean;
};

export async function getCachedTeam(teamId: string): Promise<CatTeam | null> {
  return readCache<CatTeam>(`cat:team:${teamId}`);
}

export async function cacheTeam(team: CatTeam): Promise<void> {
  await writeCache(`cat:team:${team.id}`, team);
}
