import { createFileRoute } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { FuelCardView } from "@/components/home/FuelCards";
import { useAuthSession } from "@/hooks/use-auth";
import { useTeam } from "@/hooks/use-team";

export const Route = createFileRoute("/_authenticated/fuel-card/$slot")({
  // Lê os cartões do armazenamento do aparelho — só no cliente.
  ssr: false,
  head: () => ({ meta: [{ title: "Cartão de abastecimento — ACP" }] }),
  component: FuelCardPage,
});

/** Tela só do cartão de abastecimento (em pé) de um colaborador: slot 1 ou 2. */
function FuelCardPage() {
  const { slot } = Route.useParams();
  const { userId } = useAuthSession();
  const { data: team, isLoading } = useTeam(userId);

  const index = slot === "2" ? 1 : 0;
  const first = index === 0 ? team?.collaborator1 : team?.collaborator2;
  const last = index === 0 ? team?.collaborator1_lastname : team?.collaborator2_lastname;
  const name = [first, last].filter(Boolean).join(" ");
  const valid = slot === "1" || slot === "2";

  return (
    <AppShell title="Cartão de abastecimento">
      <div className="space-y-6 pb-8 pt-2">
        {isLoading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="size-6 animate-spin text-canvas-foreground/60" />
          </div>
        ) : !valid || !first ? (
          <p className="py-20 text-center text-sm text-canvas-foreground/70">Cartão não encontrado.</p>
        ) : (
          <>
            <FuelCardView userId={userId} index={index} name={name} />
            <p className="text-center text-xs text-canvas-foreground/60">Toque no cartão para virar</p>
          </>
        )}
      </div>
    </AppShell>
  );
}
