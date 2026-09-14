import { useAuthSession } from "@/hooks/use-auth";
import { useTeam } from "@/hooks/use-team";

// Esse header é usado em telas compartilhadas entre líderes e equipes (ex.:
// Clientes). Equipes têm linha em `equipes` — nesse caso mostramos o nome da
// equipe, igual ao resto do app (ShiftMeta). Líderes não têm equipe própria,
// então caem no nome de exibição/e-mail da conta logada.
export function LeaderMeta() {
  const { session, userId } = useAuthSession();
  const { data: team } = useTeam(userId);
  const meta = session?.user.user_metadata as { display_name?: string } | undefined;
  const name =
    team?.team_name || meta?.display_name?.trim() || session?.user.email?.split("@")[0] || "—";
  const today = new Date().toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });
  return (
    <div className="flex flex-col items-end leading-tight">
      <span className="max-w-[9rem] truncate text-xs font-semibold uppercase tracking-wide text-primary">
        {name}
      </span>
      <span className="text-[10px] text-muted-foreground">{today}</span>
    </div>
  );
}