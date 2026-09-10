import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { LeaderMeta } from "@/components/layout/LeaderMeta";
import { ClientHistorySection } from "@/components/leader/ClientHistorySection";

// Acessível tanto por líderes quanto por equipes — os dados de negociação e
// recorrência já vêm devidamente restringidos pelo RLS conforme quem está
// logado (líder vê suas equipes, equipe vê só a si mesma).
export const Route = createFileRoute("/_authenticated/leader-clients")({
  ssr: false,
  head: () => ({ meta: [{ title: "Clientes — ACP" }] }),
  component: LeaderClientsPage,
});

function LeaderClientsPage() {
  return (
    <AppShell title="Clientes" right={<LeaderMeta />} showSync={false} wide>
      <ClientHistorySection />
    </AppShell>
  );
}
