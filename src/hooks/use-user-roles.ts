import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const ROLE_CACHE_PREFIX = "gpva.userRoles.";
const ROLE_QUERY_TIMEOUT_MS = 2_500;
const LEADER_META_FLAG = "is_leader";
const ADMIN_META_FLAG = "is_admin";

type RoleRow = { role: string };
type RoleResponse = { data: RoleRow[] | null; error: { message: string } | null };

function isOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

function cacheKey(userId: string): string {
  return `${ROLE_CACHE_PREFIX}${userId}`;
}

function readCachedRoles(userId: string | null): string[] | undefined {
  if (!userId || typeof localStorage === "undefined") return undefined;
  try {
    const raw = localStorage.getItem(cacheKey(userId));
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) && parsed.every((role) => typeof role === "string")
      ? parsed
      : undefined;
  } catch {
    return undefined;
  }
}

function writeCachedRoles(userId: string, roles: string[]): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(cacheKey(userId), JSON.stringify(roles));
  } catch {
    /* storage indisponível — ignora */
  }
}

function readRolesFromCurrentSession(userId: string | null): string[] | undefined {
  if (!userId) return undefined;
  if (typeof localStorage === "undefined") return undefined;
  try {
    const rawSession = Object.keys(localStorage)
      .filter((key) => key.startsWith("sb-") && key.endsWith("-auth-token"))
      .map((key) => localStorage.getItem(key))
      .find((value): value is string => !!value);
    if (!rawSession) return undefined;
    const parsed = JSON.parse(rawSession) as {
      user?: { id?: string; user_metadata?: Record<string, unknown> };
    };
    if (parsed.user?.id !== userId) return undefined;
    const metadata = parsed.user.user_metadata ?? {};
    const roles: string[] = [];
    if (metadata[LEADER_META_FLAG] === true) roles.push("leader");
    if (metadata[ADMIN_META_FLAG] === true) roles.push("admin");
    return roles.length ? roles : undefined;
  } catch {
    return undefined;
  }
}

async function withTimeout<T>(promise: PromiseLike<T>, ms: number): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error("Consulta de perfil excedeu o tempo limite")), ms);
      }),
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

export function useUserRoles(userId: string | null) {
  return useQuery({
    queryKey: ["user-roles", userId],
    enabled: !!userId,
    staleTime: 5 * 60 * 1000,
    retry: false,
    networkMode: "always",
    refetchOnWindowFocus: false,
    initialData: () => readCachedRoles(userId) ?? readRolesFromCurrentSession(userId),
    queryFn: async () => {
      const cached = readCachedRoles(userId);
      const metadataRoles = readRolesFromCurrentSession(userId);
      if (!userId || isOffline()) return cached ?? metadataRoles ?? [];
      try {
        const { data, error } = await withTimeout<RoleResponse>(
          supabase
            .from("user_roles")
            .select("role")
            .eq("user_id", userId) as unknown as PromiseLike<RoleResponse>,
          ROLE_QUERY_TIMEOUT_MS,
        );
        if (error) throw error;
        const roles = (data ?? []).map((r) => r.role as string);
        writeCachedRoles(userId, roles);
        return roles;
      } catch (error) {
        if (cached) return cached;
        if (metadataRoles) return metadataRoles;
        return [];
      }
    },
  });
}