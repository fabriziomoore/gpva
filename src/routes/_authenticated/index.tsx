import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useBackHandler } from "@/lib/back-handler";
import { supabase } from "@/integrations/supabase/client";
import { useAuthSession } from "@/hooks/use-auth";
import { useTeam } from "@/hooks/use-team";
import { AppShell } from "@/components/layout/AppShell";
import { ExitConfirmDialog } from "@/components/layout/ExitConfirmDialog";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { Button } from "@/components/ui/button";
import { FitText } from "@/components/ui/fit-text";
import { Loader2, FileText } from "lucide-react";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { collaboratorsLabel, firstName, formatDateBR } from "@/lib/format";
import { useLiveQuery } from "dexie-react-hooks";
import { getLocalDB } from "@/lib/db/local-db";
import { repoCreateShift, repoReopenShift } from "@/lib/db/repos";
import { confirmAction } from "@/components/ui/confirm-dialog";
import { openShiftStartForm } from "@/lib/shift-start-form";
import { StartShiftDialog, type Condutor } from "@/components/home/StartShiftDialog";
import { FuelCardsAccess } from "@/components/home/FuelCards";
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
  const [startDialogOpen, setStartDialogOpen] = useState(false);
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

  // Voltar do Android (APK) na Home pergunta se quer sair do app.
  useBackHandler(true, () => setExitOpen(true));

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

  // Expediente já finalizado hoje (iniciado a partir da meia-noite local) —
  // se existir, "Iniciar Expediente" avisa e reabre ele em vez de criar outro.
  const closedToday = useLiveQuery(async () => {
    if (!userId) return null;
    const db = getLocalDB();
    const rows = await db.shifts
      .where("[team_id+status+started_at]")
      .between([userId, "closed", ""], [userId, "closed", "￿"])
      .toArray();
    const d = new Date();
    const startOfToday = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const today = rows.filter((r) => new Date(r.started_at).getTime() >= startOfToday);
    return today.length ? today[today.length - 1] : null;
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

  // Opções de condutor do popup de início de expediente — primeiro nome
  // como rótulo do botão, nome completo (com sobrenome) pro Forms.
  const collaborators: Condutor[] = useMemo(() => {
    const list: Condutor[] = [];
    if (team?.collaborator1) {
      list.push({
        label: firstName(team.collaborator1),
        fullName: [team.collaborator1, team.collaborator1_lastname].filter(Boolean).join(" "),
      });
    }
    if (team?.collaborator2) {
      list.push({
        label: firstName(team.collaborator2),
        fullName: [team.collaborator2, team.collaborator2_lastname].filter(Boolean).join(" "),
      });
    }
    return list;
  }, [team]);

  async function createShiftAndGo() {
    setStarting(true);
    try {
      await repoCreateShift({
        team_id: userId!,
        variable_rate_snapshot: team?.variable_rate ?? 7,
      });
      navigate({ to: "/shift" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao iniciar");
    } finally {
      setStarting(false);
    }
  }

  async function reopenClosedToday(shiftId: string, startedAt: string) {
    const hora = new Date(startedAt).toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    });
    const ok = await confirmAction({
      title: "Expediente já finalizado hoje",
      description: `Um expediente iniciado hoje às ${hora} já foi finalizado. Continuar irá reabrir esse expediente finalizado.`,
      confirmText: "Continuar",
      cancelText: "Cancelar",
      singleLineTitle: true,
    });
    if (!ok) return;
    setStarting(true);
    try {
      await repoReopenShift(shiftId);
      await queryClient.invalidateQueries();
      navigate({ to: "/shift" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao reabrir");
    } finally {
      setStarting(false);
    }
  }

  function startShift() {
    if (!userId) return;
    if (openShift) {
      navigate({ to: "/shift" });
      return;
    }
    if (closedToday) {
      void reopenClosedToday(closedToday.id, closedToday.started_at);
      return;
    }
    // Contas de teste não abrem o Forms real, e sem colaborador cadastrado
    // não há o que escolher como condutor — segue o fluxo antigo direto.
    if (team?.is_test || collaborators.length === 0) {
      if (!team?.is_test) {
        openShiftStartForm({
          leader: team?.leader,
          teamName: team?.team_name,
          plate: team?.vehicle_plate,
        });
      }
      void createShiftAndGo();
      return;
    }
    setStartDialogOpen(true);
  }

  // Chamado de dentro do clique em "Iniciar expediente" do popup — precisa
  // continuar síncrono até aqui (mesmo gesto de clique) pro Forms abrir sem
  // ser bloqueado como pop-up.
  function confirmStartShift(condutorFullName: string, km: string) {
    openShiftStartForm({
      leader: team?.leader,
      teamName: team?.team_name,
      plate: team?.vehicle_plate,
      condutor: condutorFullName,
      km,
    });
    setStartDialogOpen(false);
    void createShiftAndGo();
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
      <StartShiftDialog
        open={startDialogOpen}
        onOpenChange={setStartDialogOpen}
        collaborators={collaborators}
        onConfirm={confirmStartShift}
      />
      {/* Espaço vertical entre os blocos = o mesmo da grade de quadrados (gap-3). */}
      <div className="space-y-3">
        {/* Card da equipe todo em unidades do container (cqw = 1% da
            largura do card): em qualquer tela ele é a mesma "foto", só maior
            ou menor. Referência: 1cqw ≈ 3,28px num celular de 360px. */}
        <div className="@container">
          <div className="flex items-stretch gap-[3.66cqw] overflow-hidden rounded-[2.44cqw] bg-card p-[4.88cqw] shadow-md">
            <div className="relative w-1/3 shrink-0 overflow-hidden rounded-[1.83cqw] border border-border bg-muted aspect-square">
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
            <div className="min-w-0 flex-1 leading-tight">
              {/* Nome + colaboradores à esquerda, selo de efetividade à
                  direita. O selo é sempre renderizado com tamanho fixo — só o
                  valor carrega depois, sem o card mudar de altura — e é mais
                  baixo que as duas linhas juntas, então não cria espaço em
                  branco acima dos colaboradores. */}
              <div className="flex items-start gap-[1.83cqw]">
                <div className="min-w-0 flex-1">
                  <FitTeamName name={team?.team_name ?? ""} />
                  {(team?.collaborator1 || team?.collaborator2) && (
                    <p className="mt-[0.61cqw] truncate text-[length:3.66cqw] font-medium text-foreground">
                      {collaboratorsLabel(team?.collaborator1, team?.collaborator2)}
                    </p>
                  )}
                </div>
                <div className="flex h-[10.37cqw] w-[18.9cqw] shrink-0 flex-col items-center justify-center gap-[0.61cqw] rounded-[1.22cqw] bg-muted px-[1.22cqw] text-center">
                  <p className="text-[length:2.13cqw] font-bold uppercase leading-none text-muted-foreground">
                    Efetividade
                  </p>
                  <div className="flex h-[4.27cqw] items-center justify-center">
                    {monthServices.isLoading ? (
                      <span className="h-[3.05cqw] w-[8.54cqw] animate-pulse rounded bg-muted-foreground/20" />
                    ) : monthEfetividade !== null ? (
                      <span className="text-[length:3.66cqw] font-bold leading-none text-success">{monthEfetividade}%</span>
                    ) : (
                      <span className="text-[length:3.66cqw] font-bold leading-none text-muted-foreground">—</span>
                    )}
                  </div>
                </div>
              </div>
              <div className="mt-[1.22cqw] text-[length:3.35cqw] leading-[1.2] text-muted-foreground">
                {team?.supervisor && (
                  <div className="space-y-[0.3cqw]">
                    {team.setor_nome && (
                      <p className="truncate"><span className="font-semibold text-foreground">Setor:</span> {team.setor_nome}</p>
                    )}
                    <p className="truncate"><span className="font-semibold text-foreground">Supervisor:</span> {team.supervisor}</p>
                    <p className="truncate"><span className="font-semibold text-foreground">Líder:</span> {team.leader}</p>
                  </div>
                )}
                <p className="mt-[1.22cqw] font-medium">{today}</p>
              </div>
            </div>
          </div>
        </div>

        <Button
          onClick={startShift}
          disabled={starting}
          className="h-24 w-full rounded-card text-xl font-bold shadow-lg"
        >
          {starting ? (
            <Loader2 className="size-7 animate-spin" />
          ) : openShift ? (
            "Continuar Expediente"
          ) : (
            "Iniciar Expediente"
          )}
        </Button>

        {/* Acessos em quadrados lado a lado (3 por linha). */}
        <div className="grid grid-cols-3 gap-3">
          {lastClosed && (
            <Link
              to="/shift/$id/report"
              params={{ id: lastClosed.id }}
              className={ACCESS_TILE}
            >
              <FileText className="size-10 text-primary" strokeWidth={1.6} />
              {/* Mesmo padrão de texto dos outros quadrados (2 linhas iguais). */}
              <p className="text-xs font-semibold leading-tight">
                Último relatório
                <br />
                {formatDateBR(lastClosed.started_at)}
              </p>
            </Link>
          )}
          <FuelCardsAccess userId={userId} owners={collaborators.map((c) => ({ fullName: c.fullName }))} className={ACCESS_TILE} />
        </div>
      </div>
    </AppShell>
  );
}

// Quadrado de acesso da Home (Último relatório, Cartão de abastecimento…):
// ícone grande no centro, nome embaixo, tudo centralizado.
const ACCESS_TILE =
  "flex aspect-square flex-col items-center justify-center gap-2 rounded-card bg-card p-2 text-center shadow-md transition-shadow hover:shadow-lg";

// Nome da equipe no card da Home: nunca corta. Tamanho padrão proporcional à
// largura do card (4.88cqw ≈ 16px num celular de 360px); se um nome mais
// longo não couber ao lado do selo de efetividade, FitText diminui a fonte só
// o necessário pra caber inteiro.
function FitTeamName({ name }: { name: string }) {
  return (
    <FitText className="font-bold tracking-tight" style={{ fontSize: "4.88cqw" }}>
      {name}
    </FitText>
  );
}
