import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Loader2 } from "lucide-react";
import { useAuthSession } from "@/hooks/use-auth";
import { useIsLeader } from "@/hooks/use-is-leader";
import { AppShell } from "@/components/layout/AppShell";
import { LeaderMeta } from "@/components/layout/LeaderMeta";
import { LeaderMapSection } from "@/components/leader/MapSection";

export const Route = createFileRoute("/_authenticated/leader-map")({
  ssr: false,
  head: () => ({ meta: [{ title: "Mapa do Líder — GPVA" }] }),
  component: LeaderMapPage,
});

function LeaderMapPage() {
  const navigate = useNavigate();
  const { userId } = useAuthSession();
  const isLeader = useIsLeader(userId);

  useEffect(() => {
    if (isLeader.data === false) navigate({ to: "/" });
  }, [isLeader.data, navigate]);

  if (isLeader.isLoading || isLeader.data === undefined) {
    return (
      <AppShell title="Mapa" showBack={false}>
        <div className="flex justify-center py-20">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      </AppShell>
    );
  }
  if (isLeader.data === false) return null;

  return (
    <AppShell title="Mapa" right={<LeaderMeta />}>
      <LeaderMapSection />
    </AppShell>
  );
}