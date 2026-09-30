import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { LeaderMeta } from "@/components/layout/LeaderMeta";
import { ClientHistorySection } from "@/components/leader/ClientHistorySection";
import { useAuthSession } from "@/hooks/use-auth";
import { useIsLeader } from "@/hooks/use-is-leader";

// Exclusiva de líder — conta equipe é redirecionada pra Home assim que a
// checagem de papel resolve (mesmo padrão de guarda usado em Variável).
export const Route = createFileRoute("/_authenticated/leader-clients")({
  ssr: false,
  head: () => ({ meta: [{ title: "Consulta — ACP" }] }),
  component: LeaderClientsPage,
});

function LeaderClientsPage() {
  const { userId } = useAuthSession();
  const isLeader = useIsLeader(userId);
  const navigate = useNavigate();

  useEffect(() => {
    if (isLeader.data === false) navigate({ to: "/" });
  }, [isLeader.data, navigate]);

  return (
    <AppShell title="Consulta" right={<LeaderMeta />} showSync={false} wide>
      <ClientHistorySection />
    </AppShell>
  );
}
