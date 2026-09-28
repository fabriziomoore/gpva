import { createFileRoute, redirect } from "@tanstack/react-router";

// "Variável" foi unificada com "Produtividade" numa aba só (mesmo padrão de
// Consulta com Negociações/Recorrentes) — rota mantida só pra não quebrar
// links/atalhos antigos que ainda apontem pra cá.
export const Route = createFileRoute("/_authenticated/variable")({
  beforeLoad: () => {
    throw redirect({ to: "/productivity" });
  },
});
