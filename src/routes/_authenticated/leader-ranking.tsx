import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Loader2 } from "lucide-react";
import { useAuthSession } from "@/hooks/use-auth";
import { useIsLeader } from "@/hooks/use-is-leader";
import { AppShell } from "@/components/layout/AppShell";
import { LeaderMeta } from "@/components/layout/LeaderMeta";
import { LeaderRankingSection } from "@/components/leader/RankingSection";

export const Route = createFileRoute("/_authenticated/leader-ranking")({
  ssr: false,
  head: () => ({ meta: [{ title: "Ranking do Líder — GPVA" }] }),
  component: LeaderRankingPage,
});

function LeaderRankingPage() {
  const navigate = useNavigate();
  const { userId } = useAuthSession();
  const isLeader = useIsLeader(userId);

  useEffect(() => {
    if (isLeader.data === false) navigate({ to: "/" });
  }, [isLeader.data, navigate]);

  if (isLeader.isLoading || isLeader.data === undefined) {
    return (
      <AppShell title="Ranking & Perfis" showBack={false}>
        <div className="flex justify-center py-20">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      </AppShell>
    );
  }
  if (isLeader.data === false) return null;

  return (
    <AppShell title="Ranking & Perfis" right={<LeaderMeta />}>
      <LeaderRankingSection />
    </AppShell>
  );
}