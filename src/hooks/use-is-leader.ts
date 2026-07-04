import { useUserRoles } from "@/hooks/use-user-roles";

export function useIsLeader(userId: string | null) {
  const q = useUserRoles(userId);
  return { ...q, data: q.data ? q.data.includes("leader") : q.data } as typeof q & {
    data: boolean | undefined;
  };
}