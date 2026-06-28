import { useAuthSession } from "@/hooks/use-auth";
import { useTeam } from "@/hooks/use-team";

export function ShiftMeta() {
  const { userId } = useAuthSession();
  const { data: team } = useTeam(userId);
  const today = new Date().toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });
  return (
    <div className="flex flex-col items-end leading-tight">
      <span className="text-xs font-semibold uppercase tracking-wide text-primary">
        {team?.team_name ?? "—"}
      </span>
      <span className="text-[10px] text-muted-foreground">{today}</span>
    </div>
  );
}