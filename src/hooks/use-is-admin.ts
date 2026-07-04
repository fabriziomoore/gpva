import { useUserRoles } from "@/hooks/use-user-roles";

export function useIsAdmin(userId: string | null) {
  const q = useUserRoles(userId);
  return { ...q, data: q.data ? q.data.includes("admin") : q.data } as typeof q & {
    data: boolean | undefined;
  };
}