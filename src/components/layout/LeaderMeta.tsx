import { useAuthSession } from "@/hooks/use-auth";

export function LeaderMeta() {
  const { session } = useAuthSession();
  const meta = session?.user.user_metadata as { display_name?: string } | undefined;
  const name = meta?.display_name?.trim() || session?.user.email?.split("@")[0] || "—";
  const today = new Date().toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });
  return (
    <div className="flex flex-col items-start leading-tight">
      <span className="max-w-[9rem] truncate text-xs font-semibold uppercase tracking-wide text-primary">
        {name}
      </span>
      <span className="text-[10px] text-muted-foreground">{today}</span>
    </div>
  );
}