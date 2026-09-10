import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { ShiftMeta } from "@/components/layout/ShiftMeta";
import { TeamsRankingSection } from "@/components/team/TeamsRankingSection";

export const Route = createFileRoute("/_authenticated/equipes")({
  ssr: false,
  head: () => ({ meta: [{ title: "Equipes — ACP" }] }),
  component: EquipesPage,
});

function EquipesPage() {
  return (
    <AppShell title="Equipes" right={<ShiftMeta />} showSync={false} wide>
      <TeamsRankingSection />
    </AppShell>
  );
}
