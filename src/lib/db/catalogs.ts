import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getLocalDB } from "./local-db";
import { useAuthSession } from "@/hooks/use-auth";
import { useLiveQuery } from "dexie-react-hooks";
import { useMemo } from "react";

// Reads from network and caches into Dexie kv. When the network fails
// (offline / first load without connectivity after a successful run),
// we transparently return the last cached snapshot so the UI keeps working.

type Fetcher<T> = () => Promise<T>;
const CATALOG_FETCH_TIMEOUT_MS = 2_500;

function isOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

function withTimeout<T>(promise: PromiseLike<T>, ms = CATALOG_FETCH_TIMEOUT_MS): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error("Consulta excedeu o tempo limite")), ms);
    }),
  ]).finally(() => {
    if (timeoutId) clearTimeout(timeoutId);
  });
}

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

function useCachedQuery<T>(key: string, fetcher: Fetcher<T>, queryKey: unknown[], enabled: boolean = true): UseQueryResult<T> {
  const liveCached = useLiveQuery(() => readCache<T>(key), [key]);
  const query = useQuery({
    queryKey,
    queryFn: async (): Promise<T> => {
      const cached = await readCache<T>(key);
      if (isOffline() && cached != null) return cached;
      try {
        const fresh = await withTimeout(fetcher());
        await writeCache(key, fresh);
        return fresh;
      } catch (err) {
        if (cached != null) return cached;
        throw err;
      }
    },
    initialData: () => undefined,
    staleTime: 5 * 60 * 1000,
    retry: false,
    networkMode: "always",
    refetchOnWindowFocus: false,
    enabled,
  });

  if (query.data == null && liveCached != null) {
    return {
      ...query,
      data: liveCached,
      isLoading: false,
      isPending: false,
      isSuccess: true,
      status: "success",
    } as UseQueryResult<T>;
  }

  return query;
}

export type CatServiceType = { id: string; name: string; is_negotiation: boolean; sort_order: number };
export type CatReason = { id: string; name: string };
export type CatComplement = { id: string; name: string; sort_order: number };
export type CatImpact = { id: string; name: string };

export function useServiceTypesCached() {
  const { userId } = useAuthSession();
  return useCachedQuery<CatServiceType[]>(
    `cat:service_types:global`,
    async () => {
      const { data, error } = await supabase
        .from("tipos_servico")
        .select("id,name,is_negotiation,sort_order")
        .eq("active", true)
        .order("sort_order")
        .order("name");
      if (error) throw error;
      return (data ?? []) as CatServiceType[];
    },
    ["cached", "tipos_servico", "global"],
    !!userId,
  );
}

export function useReasonsCached() {
  const { userId } = useAuthSession();
  return useCachedQuery<CatReason[]>(
    `cat:inviability_reasons:global`,
    async () => {
      const { data, error } = await supabase
        .from("motivos_inviabilidade")
        .select("id,name")
        .eq("active", true)
        .order("name");
      if (error) throw error;
      return (data ?? []) as CatReason[];
    },
    ["cached", "motivos_inviabilidade", "global"],
    !!userId,
  );
}

export function useComplementsCached() {
  const { userId } = useAuthSession();
  return useCachedQuery<CatComplement[]>(
    `cat:service_complements:global`,
    async () => {
      const { data, error } = await supabase
        .from("complementos_servico")
        .select("id,name,sort_order")
        .eq("active", true)
        .order("sort_order")
        .order("name");
      if (error) throw error;
      return (data ?? []) as CatComplement[];
    },
    ["cached", "complementos_servico", "global"],
    !!userId,
  );
}

export function useImpactsCached() {
  const { userId } = useAuthSession();
  return useCachedQuery<CatImpact[]>(
    `cat:impacts:global`,
    async () => {
      const { data, error } = await supabase
        .from("impactos")
        .select("id,name")
        .eq("active", true)
        .order("name");
      if (error) throw error;
      return (data ?? []) as CatImpact[];
    },
    ["cached", "impactos", "global"],
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
  collaborator1: string | null;
  collaborator2: string | null;
  setor_id?: string | null;
  setor_nome?: string | null;
  setor_supervisor?: string | null;
};

export async function getCachedTeam(teamId: string): Promise<CatTeam | null> {
  return readCache<CatTeam>(`cat:team:${teamId}`);
}

export async function cacheTeam(team: CatTeam): Promise<void> {
  await writeCache(`cat:team:${team.id}`, team);
}

// ---------- Per-team catalog ordering ----------

export type CatalogKind =
  | "tipos_servico"
  | "motivos_inviabilidade"
  | "complementos_servico"
  | "impactos";

function orderKey(teamId: string, catalog: CatalogKind): string {
  return `catord:${teamId}:${catalog}`;
}

export function applyOrder<T extends { id: string; name: string }>(
  items: T[],
  orderIds: string[] | null | undefined,
): T[] {
  if (!orderIds || orderIds.length === 0) return items;
  const byId = new Map(items.map((i) => [i.id, i]));
  const ordered: T[] = [];
  const seen = new Set<string>();
  for (const id of orderIds) {
    const it = byId.get(id);
    if (it && !seen.has(id)) {
      ordered.push(it);
      seen.add(id);
    }
  }
  const leftover = items
    .filter((i) => !seen.has(i.id))
    .sort((a, b) => a.name.localeCompare(b.name));
  return [...ordered, ...leftover];
}

/** Reactive per-team order list, kept in the local kv (offline-first). */
export function useCatalogOrder(catalog: CatalogKind): string[] {
  const { userId } = useAuthSession();
  const value = useLiveQuery(async () => {
    if (!userId) return [];
    const row = await getLocalDB().kv.get(orderKey(userId, catalog));
    return (row?.value as string[] | undefined) ?? [];
  }, [userId, catalog]);
  return value ?? [];
}

/** Combine a catalog list with the team's preferred order. */
export function useOrdered<T extends { id: string; name: string }>(
  items: T[] | undefined,
  catalog: CatalogKind,
): T[] {
  const order = useCatalogOrder(catalog);
  return useMemo(() => applyOrder(items ?? [], order), [items, order]);
}

/** One-shot fetch of the server-stored order (used on login / catalog refresh). */
export async function fetchAndCacheCatalogOrder(teamId: string): Promise<void> {
  try {
    const { data, error } = await supabase
      .from("catalog_order")
      .select("catalog,item_ids")
      .eq("team_id", teamId);
    if (error) throw error;
    const db = getLocalDB();
    for (const row of (data ?? []) as { catalog: CatalogKind; item_ids: string[] }[]) {
      await db.kv.put({ key: orderKey(teamId, row.catalog), value: row.item_ids });
    }
  } catch {
    /* offline — keep local */
  }
}
