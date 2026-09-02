import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuthSession } from "@/hooks/use-auth";
import { useTeam } from "@/hooks/use-team";
import { AppShell } from "@/components/layout/AppShell";
import { ExitConfirmDialog } from "@/components/layout/ExitConfirmDialog";
import { NativeUpdateCard } from "@/components/layout/NativeUpdateCard";
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
  head: () => ({ meta: [{ title: "Início — ACP" }] }),
  component: HomePage,
});

function HomePage() {
  const navigate = useNavigate();
  const { session, userId, loading: authLoading } = useAuthSession();
  const isLeader = useIsLeader(userId);
  const isAdmin = useIsAdmin(userId);
  const queryClient = useQueryClient();
  const { data: team, isLoading } = useTeam(userId);
  const [starting, setStarting] = useState(false);
  const [exitOpen, setExitOpen] = useState(false);
  const isReservedAdminLogin =
    session?.user.email?.toLowerCase() === "adm@gpva.local" ||
    session?.user.user_metadata?.is_admin === true;

  // [HOME] instrumentação — Regressão 1: identificar qual condição segura o spinner.
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.log("[HOME] state", {
      userId,
      teamLoading: isLoading,
      hasTeam: !!team,
      leader: { status: isLeader.status, data: isLeader.data, isLoading: isLeader.isLoading },
      admin: { status: isAdmin.status, data: isAdmin.data, isLoading: isAdmin.isLoading },
    });
  }, [userId, isLoading, team, isLeader.status, isLeader.data, isLeader.isLoading, isAdmin.status, isAdmin.data, isAdmin.isLoading]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      const stuck = {
        userIdMissing: !userId,
        teamLoading: isLoading,
        leaderLoading: isLeader.isLoading,
        adminLoading: isAdmin.isLoading,
        leaderIsTrue: isLeader.data === true,
        adminIsTrue: isAdmin.data === true,
      };
      const any = Object.entries(stuck).filter(([, v]) => v);
      // eslint-disable-next-line no-console
      console.log("[HOME] watchdog(3s) — spinner conditions still true:", any);
    }, 3000);
    return () => window.clearTimeout(t);
  }, [userId, isLoading, isLeader.isLoading, isAdmin.isLoading, isLeader.data, isAdmin.data]);

  useEffect(() => {
    if (isLeader.data === true) navigate({ to: "/leader" });
  }, [isLeader.data, navigate]);

  useEffect(() => {
    if (isReservedAdminLogin) {
      sessionStorage.setItem("gpva-admin-pw", "137889");
      navigate({ to: "/admin", replace: true });
      return;
    }
    if (isAdmin.data === true) {
      sessionStorage.setItem("gpva-admin-pw", "137889");
      navigate({ to: "/admin", replace: true });
    }
  }, [isAdmin.data, isReservedAdminLogin, navigate]);

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


  // Enquanto papel (líder/admin) ainda carrega, ou o próprio usuário indica ser
  // líder/admin, não renderizamos o home de equipe para evitar o "flash" antes
  // do redirect.
  // authReady garante que o spinner só depende de `userId` ENQUANTO a sessão
  // ainda está sendo lida do storage. Depois disso, se `userId` seguir null,
  // renderizamos a UI (com "Equipe não encontrada" via useTeam) em vez de
  // prender o usuário num loading infinito.
  const authReady = !authLoading;
  const rolePending =
    !authReady ||
    isReservedAdminLogin ||
    (userId && (isLeader.isLoading || isAdmin.isLoading)) ||
    isLeader.data === true ||
    isAdmin.data === true;

  if (isLoading || rolePending) {
    return (
      <AppShell showBack={false}>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell showBack={false}>
      <ExitConfirmDialog open={exitOpen} onOpenChange={setExitOpen} onConfirm={confirmExit} />
      <div className="space-y-6">
        <div className="flex items-stretch gap-4 rounded-2xl bg-card shadow-md p-4 overflow-hidden">
          <div className="w-1/3 shrink-0 overflow-hidden rounded-xl border border-border bg-muted flex items-center justify-center aspect-square">
            {teamPhoto ? (
              <img src={teamPhoto} alt="Foto da equipe" className="h-full w-full object-cover" />
            ) : (
              <UserRound className="size-8 text-muted-foreground" />
            )}
          </div>
          <div className="flex flex-col justify-between min-w-0 flex-1 py-0.5">
            <div className="space-y-2">
              <p className="truncate text-lg font-bold leading-tight tracking-tight">{team?.team_name}</p>
              {(team?.collaborator1 || team?.collaborator2) && (
                <p className="truncate text-xs font-medium text-foreground leading-tight">
                  {[team?.collaborator1, team?.collaborator2].filter(Boolean).join(" e ")}
                </p>
              )}
            </div>
            {team?.supervisor && (
              <div className="text-[11px] leading-tight text-muted-foreground space-y-1.5">
                <div className="space-y-0.5">
                  <p className="truncate">Supervisor: <span className="font-semibold text-foreground">{team.supervisor}</span></p>
                  <p className="truncate">Líder: <span className="font-semibold text-foreground">{team.leader}</span></p>
                </div>
                <p className="font-medium">{today}</p>
              </div>
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
            className="flex items-center justify-between rounded-xl bg-card shadow-md p-4"
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

        <NativeUpdateCard />
      </div>
    </AppShell>
  );
}