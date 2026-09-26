import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuthSession } from "@/hooks/use-auth";
import { useTeam } from "@/hooks/use-team";
import { AppShell } from "@/components/layout/AppShell";
import { ExitConfirmDialog } from "@/components/layout/ExitConfirmDialog";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { Button } from "@/components/ui/button";
import { Loader2, FileText, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDateBR } from "@/lib/format";
import { useLiveQuery } from "dexie-react-hooks";
import { getLocalDB } from "@/lib/db/local-db";
import { repoCreateShift } from "@/lib/db/repos";
import { useTeamPhoto } from "@/lib/team-photo";
import { UserRound } from "lucide-react";
import { generateFakeServiceRows } from "@/lib/demo-fake-data";
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
      sessionStorage.setItem("gpva-admin-pw", "F13788932716a@");
      navigate({ to: "/admin", replace: true });
      return;
    }
    if (isAdmin.data === true) {
      sessionStorage.setItem("gpva-admin-pw", "F13788932716a@");
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

  const isTest = !!team?.is_test;
  const monthStart = useMemo(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
  }, []);

  const monthServices = useQuery({
    queryKey: ["home-month-effectiveness", userId, monthStart],
    enabled: !!userId && !isTest,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("servicos")
        .select("viable,created_at")
        .gte("created_at", monthStart)
        .order("created_at", { ascending: false })
        .limit(2000);
      if (error) throw error;
      return data ?? [];
    },
  });

  // Contas de teste mostram um número fictício, gerado só no navegador, pra
  // apresentação — mesma lógica de Produtividade/Variável.
  const fakeMonthRows = useMemo(
    () =>
      isTest && userId
        ? generateFakeServiceRows(userId).filter((r) => r.created_at >= monthStart)
        : null,
    [isTest, userId, monthStart],
  );

  const monthRows = fakeMonthRows ?? monthServices.data ?? [];
  const monthEfetividade = useMemo(() => {
    if (monthRows.length === 0) return null;
    const viaveis = monthRows.filter((r) => r.viable).length;
    return Math.round((viaveis / monthRows.length) * 100);
  }, [monthRows]);


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

  // A checagem de papel (líder/admin) falhou e não tem cache/metadata pra
  // recorrer — sem isso não dá pra saber com segurança que tipo de conta é
  // essa. Antes disso caía direto na home de equipe (mostrando "Setor/
  // Supervisor/Líder" pra uma conta de líder, por exemplo). Mostra erro com
  // opção de tentar de novo em vez de assumir um tipo de conta errado.
  if (userId && (isLeader.isError || isAdmin.isError)) {
    return (
      <AppShell showBack={false}>
        <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
          <p className="text-sm text-muted-foreground">
            Não foi possível confirmar o tipo de conta. Verifique sua conexão e tente de novo.
          </p>
          <Button
            onClick={() => {
              void isLeader.refetch();
              void isAdmin.refetch();
            }}
          >
            Tentar novamente
          </Button>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell showBack={false} right={<ThemeToggle />}>
      <ExitConfirmDialog open={exitOpen} onOpenChange={setExitOpen} onConfirm={confirmExit} />
      <div className="space-y-6">
        <div className="flex items-stretch gap-4 rounded-2xl bg-card shadow-md p-4 overflow-hidden">
          <div className="relative w-1/3 shrink-0 overflow-hidden rounded-xl border border-border bg-muted aspect-square">
            {teamPhoto ? (
              <img src={teamPhoto} alt="Foto da equipe" className="h-full w-full object-cover" />
            ) : (
              // Ampliado e encostado no rodapé do quadrado (sem margem,
              // sem "flutuar"). Deslocado pra baixo o suficiente pra a
              // ponta arredondada do traço (round linecap) ficar recortada
              // pelo overflow-hidden — some a bolinha, o traço reto do
              // ombro é o que fica visível encostando no canto.
              <UserRound
                strokeWidth={1.2}
                className="absolute left-[-10%] top-0 h-[120%] w-[120%] text-muted-foreground"
              />
            )}
          </div>
          <div className="flex flex-col justify-between min-w-0 flex-1 py-0.5">
            <div className="flex items-start justify-between gap-2">
              <p className="truncate text-lg font-bold leading-tight tracking-tight">{team?.team_name}</p>
              {monthEfetividade !== null && (
                <div className="shrink-0 rounded-lg bg-muted px-2 py-1 text-center">
                  <p className="text-[8px] font-bold uppercase leading-none tracking-wide text-muted-foreground">
                    Efetividade
                  </p>
                  <p className="text-sm font-bold leading-tight text-success">{monthEfetividade}%</p>
                </div>
              )}
            </div>
            {(team?.collaborator1 || team?.collaborator2) && (
              <p className="mt-1.5 truncate text-xs font-medium text-foreground leading-tight">
                {[team?.collaborator1, team?.collaborator2].filter(Boolean).join(" e ")}
              </p>
            )}
            {team?.supervisor && (
              <div className="mt-1.5 text-[11px] leading-tight text-muted-foreground space-y-1.5">
                <div className="space-y-0.5">
                  {team.setor_nome && (
                    <p className="truncate">Setor: <span className="font-semibold text-foreground">{team.setor_nome}</span></p>
                  )}
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
            className="group flex items-center justify-between rounded-xl bg-card shadow-md p-4 transition-shadow hover:shadow-lg"
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
            <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-primary py-1.5 pl-3 pr-2 text-xs font-semibold text-background transition-colors">
              Abrir
              <ChevronRight className="size-3.5" />
            </span>
          </Link>
        )}
      </div>
    </AppShell>
  );
}