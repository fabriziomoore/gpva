import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getLocalDB } from "./local-db";
import { useAuthSession } from "@/hooks/use-auth";

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

function useCachedQuery<T>(key: string, fetcher: Fetcher<T>, queryKey: unknown[], enabled: boolean = true) {
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
    enabled,
  });
}

export type CatServiceType = { id: string; name: string; is_negotiation: boolean; sort_order: number };
export type CatReason = { id: string; name: string };
export type CatComplement = { id: string; name: string; sort_order: number };
export type CatImpact = { id: string; name: string };

export function useServiceTypesCached() {
  const { userId } = useAuthSession();
  return useCachedQuery<CatServiceType[]>(
    `cat:service_types:${userId ?? "none"}`,
    async () => {
      const { data, error } = await supabase
        .from("tipos_servico")
        .select("id,name,is_negotiation,sort_order")
        .eq("team_id", userId!)
        .eq("active", true)
        .order("sort_order")
        .order("name");
      if (error) throw error;
      return (data ?? []) as CatServiceType[];
    },
    ["cached", "tipos_servico", userId],
    !!userId,
  );
}

export function useReasonsCached() {
  const { userId } = useAuthSession();
  return useCachedQuery<CatReason[]>(
    `cat:inviability_reasons:${userId ?? "none"}`,
    async () => {
      const { data, error } = await supabase
        .from("motivos_inviabilidade")
        .select("id,name")
        .eq("team_id", userId!)
        .eq("active", true)
        .order("name");
      if (error) throw error;
      return (data ?? []) as CatReason[];
    },
    ["cached", "motivos_inviabilidade", userId],
    !!userId,
  );
}

export function useComplementsCached() {
  const { userId } = useAuthSession();
  return useCachedQuery<CatComplement[]>(
    `cat:service_complements:${userId ?? "none"}`,
    async () => {
      const { data, error } = await supabase
        .from("complementos_servico")
        .select("id,name,sort_order")
        .eq("team_id", userId!)
        .eq("active", true)
        .order("sort_order")
        .order("name");
      if (error) throw error;
      return (data ?? []) as CatComplement[];
    },
    ["cached", "complementos_servico", userId],
    !!userId,
  );
}

export function useImpactsCached() {
  const { userId } = useAuthSession();
  return useCachedQuery<CatImpact[]>(
    `cat:impacts:${userId ?? "none"}`,
    async () => {
      const { data, error } = await supabase
        .from("impactos")
        .select("id,name")
        .eq("team_id", userId!)
        .eq("active", true)
        .order("name");
      if (error) throw error;
      return (data ?? []) as CatImpact[];
    },
    ["cached", "impactos", userId],
    !!userId,
  );
}

export type CatTeam = {
  id: string;
  team_name: string;
  supervisor: string;
  leader: string;
  variable_rate: number;
  onboarded: boolean;
  photo_url: string | null;
};

export async function getCachedTeam(teamId: string): Promise<CatTeam | null> {
  return readCache<CatTeam>(`cat:team:${teamId}`);
}

export async function cacheTeam(team: CatTeam): Promise<void> {
  await writeCache(`cat:team:${team.id}`, team);
}
