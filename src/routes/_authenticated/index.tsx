import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuthSession } from "@/hooks/use-auth";
import { useTeam } from "@/hooks/use-team";
import { AppShell } from "@/components/layout/AppShell";
import { ExitConfirmDialog } from "@/components/layout/ExitConfirmDialog";
import { Button } from "@/components/ui/button";
import { Loader2, FileText } from "lucide-react";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDateBR } from "@/lib/format";
import { useLiveQuery } from "dexie-react-hooks";
import { getLocalDB } from "@/lib/db/local-db";
import { repoCreateShift } from "@/lib/db/repos";
import { useTeamPhoto } from "@/lib/team-photo";
import { UserRound } from "lucide-react";
import { useIsLeader } from "@/hooks/use-is-leader";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { prepareLocalSignOut, signOutApp } from "@/lib/auth";

export const Route = createFileRoute("/_authenticated/")({
  ssr: false,
  head: () => ({ meta: [{ title: "Início — GPVA" }] }),
  component: HomePage,
});

function HomePage() {
  const navigate = useNavigate();
  const { userId } = useAuthSession();
  const isLeader = useIsLeader(userId);
  const isAdmin = useIsAdmin(userId);
  const queryClient = useQueryClient();
  const { data: team, isLoading } = useTeam(userId);
  const [starting, setStarting] = useState(false);
  const [exitOpen, setExitOpen] = useState(false);

  useEffect(() => {
    if (isLeader.data === true) navigate({ to: "/leader" });
  }, [isLeader.data, navigate]);

  useEffect(() => {
    if (isAdmin.data === true) {
      sessionStorage.setItem("gpva-admin-pw", "137889");
      navigate({ to: "/admin" });
    }
  }, [isAdmin.data, navigate]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.history.pushState({ __gpvaGuard: true }, "");
    const onPop = () => {
      setExitOpen(true);
      window.history.pushState({ __gpvaGuard: true }, "");
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  async function confirmExit() {
    setExitOpen(false);
    prepareLocalSignOut();
    await navigate({ to: "/auth", replace: true });
    void signOutApp(queryClient);
  }

  // Onboarding is handled by admin at team creation; no auto-redirect.

  const openShift = useLiveQuery(async () => {
    if (!userId) return null;
    const db = getLocalDB();
    const row = await db.shifts
      .where("[team_id+status+started_at]")
      .between([userId, "open", ""], [userId, "open", "\uffff"])
      .last();
    return row ?? null;
  }, [userId]);

  const lastClosedLocal = useLiveQuery(async () => {
    if (!userId) return null;
    const db = getLocalDB();
    const row = await db.shifts
      .where("[team_id+status+started_at]")
      .between([userId, "closed", ""], [userId, "closed", "\uffff"])
      .last();
    return row ?? null;
  }, [userId]);

  const lastClosedRemote = useQuery({
    queryKey: ["last-closed-shift", userId],
    enabled: !!userId && !!team?.onboarded && !lastClosedLocal,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expedientes")
        .select("id,started_at")
        .eq("team_id", userId!)
        .eq("status", "closed")
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const lastClosed = lastClosedLocal ?? lastClosedRemote.data;

  async function startShift() {
    if (!userId) return;
    setStarting(true);
    try {
      if (openShift) {
        navigate({ to: "/shift" });
        return;
      }
      await repoCreateShift({
        team_id: userId,
        variable_rate_snapshot: team?.variable_rate ?? 7,
      });
      navigate({ to: "/shift" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao iniciar");
    } finally {
      setStarting(false);
    }
  }

  const today = useMemo(() => formatDateBR(new Date()), []);
  const teamPhoto = useTeamPhoto(userId);

  const titleNode = (
    <div className="w-full min-w-0">
      <svg
        viewBox="0 0 300 20"
        preserveAspectRatio="none"
        className="block h-auto w-full"
        role="img"
        aria-label="GPVA - Gestão de Produtividade e Variável Autônoma"
      >
        <text x="0" y="15" fontSize="14" fontWeight="700" fill="currentColor" textLength="300" lengthAdjust="spacingAndGlyphs">
          GPVA
          <tspan fontSize="10" fontWeight="500" className="fill-muted-foreground" dx="3">
            - GESTÃO DE PRODUTIVIDADE E VARIÁVEL AUTÔNOMA
          </tspan>
        </text>
      </svg>
    </div>
  );

  // Enquanto papel (líder/admin) ainda carrega, ou o próprio usuário indica ser
  // líder/admin, não renderizamos o home de equipe para evitar o "flash" antes
  // do redirect.
  const rolePending =
    !userId ||
    isLeader.isLoading ||
    isAdmin.isLoading ||
    isLeader.data === true ||
    isAdmin.data === true;

  if (isLoading || rolePending) {
    return (
      <AppShell title={titleNode} showBack={false}>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title={titleNode} showBack={false}>
      <ExitConfirmDialog open={exitOpen} onOpenChange={setExitOpen} onConfirm={confirmExit} />
      <div className="space-y-6">
        <div className="flex items-center gap-4 rounded-2xl border border-border bg-card p-5">
          <div className="size-36 shrink-0 overflow-hidden rounded-xl border border-border bg-muted flex items-center justify-center">
            {teamPhoto ? (
              <img src={teamPhoto} alt="Foto da equipe" className="h-full w-full object-cover" />
            ) : (
              <UserRound className="size-10 text-muted-foreground" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Equipe</p>
            <p className="mt-1 whitespace-nowrap text-2xl font-bold leading-tight tracking-tight">{team?.team_name}</p>
            {(team?.collaborator1 || team?.collaborator2) && (
              <p className="mt-1 whitespace-nowrap text-sm text-muted-foreground">
                <span className="text-foreground">
                  {[team?.collaborator1, team?.collaborator2].filter(Boolean).join(" e ")}
                </span>
              </p>
            )}
            {team?.supervisor && (
              <p className="mt-2 text-sm text-muted-foreground">
                <span className="block whitespace-nowrap">Supervisor: <span className="text-foreground">{team.supervisor}</span></span>
                <span className="block whitespace-nowrap">Líder: <span className="text-foreground">{team.leader}</span></span>
                <span className="mt-1 block whitespace-nowrap">{today}</span>
              </p>
            )}
          </div>
        </div>

        <Button
          onClick={startShift}
          disabled={starting}
          className="h-24 w-full rounded-2xl text-xl font-bold shadow-lg"
        >
          {starting ? (
            <Loader2 className="size-7 animate-spin" />
          ) : openShift ? (
            "Continuar Expediente"
          ) : (
            "Iniciar Expediente"
          )}
        </Button>

        {lastClosed && (
          <Link
            to="/shift/$id/report"
            params={{ id: lastClosed.id }}
            className="flex items-center justify-between rounded-xl border border-border bg-card p-4 hover:bg-accent"
          >
            <div className="flex items-center gap-3">
              <FileText className="size-5 text-primary" />
              <div>
                <p className="text-sm font-medium">Último relatório</p>
                <p className="text-xs text-muted-foreground">
                  {formatDateBR(lastClosed.started_at)}
                </p>
              </div>
            </div>
            <span className="text-xs text-muted-foreground">Abrir →</span>
          </Link>
        )}
      </div>
    </AppShell>
  );
}