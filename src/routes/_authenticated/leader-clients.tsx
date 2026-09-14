import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { LeaderMeta } from "@/components/layout/LeaderMeta";
import { ClientHistorySection } from "@/components/leader/ClientHistorySection";
import { useAuthSession } from "@/hooks/use-auth";
import { useIsLeader } from "@/hooks/use-is-leader";

// Acessível tanto por líderes quanto por equipes — os dados de negociação e
// recorrência já vêm devidamente restringidos pelo RLS conforme quem está
// logado (líder vê suas equipes, equipe vê só a si mesma).
export const Route = createFileRoute("/_authenticated/leader-clients")({
  ssr: false,
  head: () => ({ meta: [{ title: "Clientes — ACP" }] }),
  component: LeaderClientsPage,
});

function LeaderClientsPage() {
  const { userId } = useAuthSession();
  const isLeader = useIsLeader(userId);
  // Líder não tem fila de sincronização própria (só lê dados) — igual ao
  // resto das telas dele (Painel, Ranking, Configuração, Mapa). Conta
  // equipe usa essa fila pra registrar serviços, então precisa ver a linha.
  return (
    <AppShell title="Clientes" right={<LeaderMeta />} showSync={!isLeader.data} wide>
      <ClientHistorySection />
    </AppShell>
  );
}
