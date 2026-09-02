import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuthSession } from "@/hooks/use-auth";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Loader2, Plus, Trash2, LogOut, Menu, X, LayoutDashboard,
  Building2, Users, UserCog, ClipboardList, Ban, ListPlus, AlertTriangle,
  Percent, MapPin, FileSpreadsheet, FlaskConical, ShieldCheck, ChevronRight,
  Smartphone, Trash, RotateCcw, RefreshCw,
} from "lucide-react";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { toast } from "sonner";
import * as Dialog from "@radix-ui/react-dialog";
import { ExitConfirmDialog } from "@/components/layout/ExitConfirmDialog";
import {
  adminAddRow,
  adminCreateTeam,
  adminDeleteRow,
  adminListRows,
  adminUpdateRate,
  adminTeamsRanking,
  adminUpdateTeam,
  adminDeleteTeam,
  adminListTestTeams,
  adminCreateTestTeam,
  adminListShifts,
  adminDeleteShift,
  adminUpdateShiftReport,
  listTeams,
  adminCreateLeader,
  adminListLeaders,
  adminUpdateLeader,
  adminNormalizeLeader,
  adminDeleteLeader,
  adminListSetores,
  adminCreateSetor,
  adminUpdateSetor,
  adminDeleteSetor,
  adminListSupervisores,
  adminCreateSupervisor,
  adminUpdateSupervisor,
  adminDeleteSupervisor,
  adminListDevices,
  adminSignOutDevice,
  adminUpdatesOverview,
  adminListTrashShifts,
  adminRestoreShift,
  adminPurgeShift,
} from "@/lib/admin.functions";
import {
  adminGetGoogleFormSettings,
  adminSetGoogleFormMode,
  adminUpdateGoogleForm,
} from "@/lib/google-form.functions";
import { Textarea } from "@/components/ui/textarea";
import { AuditSection } from "@/components/admin/AuditSection";
import { MapServicesSection } from "@/components/admin/MapServicesSection";
import { formatDateBR } from "@/lib/format";
import { confirmDelete } from "@/components/ui/confirm-dialog";
import { prepareLocalSignOut, signOutApp } from "@/lib/auth";

export const Route = createFileRoute("/admin")({
  ssr: false,
  head: () => ({ meta: [{ title: "Administração — ACP" }] }),
  component: AdminPage,
});

type SectionId =
  | "tipos_servico"
  | "motivos_inviabilidade"
  | "complementos_servico"
  | "impactos"
  | "variable"
  | "create_team"
  | "leaders"
  | "setores"
  | "supervisores"
  | "google_form"
  | "test_account"
  | "map_services"
  | "devices"
  | "updates"
  | "trash"
  | "audit";

type SectionMeta = {
  id: SectionId;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
};

const SECTION_INFO: Record<SectionId, SectionMeta> = {
  setores: { id: "setores", label: "Setores", description: "Cadastro e supervisão dos setores", icon: Building2 },
  supervisores: { id: "supervisores", label: "Supervisores", description: "Supervisores por setor", icon: UserCog },
  create_team: { id: "create_team", label: "Equipes", description: "Criar, editar e remover equipes", icon: Users },
  leaders: { id: "leaders", label: "Líderes", description: "Contas de líderes de equipe", icon: UserCog },
  tipos_servico: { id: "tipos_servico", label: "Tipos de Serviço", description: "Catálogo dos tipos disponíveis", icon: ClipboardList },
  motivos_inviabilidade: { id: "motivos_inviabilidade", label: "Motivos de Inviabilidade", description: "Motivos usados nas marcações inviáveis", icon: Ban },
  complementos_servico: { id: "complementos_servico", label: "Complementos do Serviço", description: "Complementos vinculados aos serviços", icon: ListPlus },
  impactos: { id: "impactos", label: "Impactos", description: "Impactos registrados ao fim do expediente", icon: AlertTriangle },
  variable: { id: "variable", label: "Variável", description: "Taxa variável por equipe", icon: Percent },
  map_services: { id: "map_services", label: "Serviços no Mapa", description: "Marcações registradas — remoção seletiva", icon: MapPin },
  google_form: { id: "google_form", label: "Google Forms", description: "Modo e link do formulário externo", icon: FileSpreadsheet },
  test_account: { id: "test_account", label: "Conta de Teste", description: "Equipe fictícia para validações", icon: FlaskConical },
  devices: { id: "devices", label: "Dispositivos", description: "Sessões ativas e logout remoto", icon: Smartphone },
  updates: { id: "updates", label: "Atualizações", description: "Rollout de versão por equipe/aparelho", icon: RefreshCw },
  trash: { id: "trash", label: "Lixeira", description: "Relatórios excluídos — restaurar ou apagar", icon: Trash },
  audit: { id: "audit", label: "Auditoria Inteligente", description: "Diagnóstico automatizado do sistema", icon: ShieldCheck },
};

type SectionGroup = {
  id: "estrutura" | "catalogos" | "dados";
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  items: SectionId[];
};

const SECTION_GROUPS: SectionGroup[] = [
  { id: "estrutura", label: "Estrutura", icon: Building2,
    items: ["setores", "supervisores", "leaders", "create_team"] },
  { id: "catalogos", label: "Catálogos", icon: ClipboardList,
    items: ["tipos_servico", "motivos_inviabilidade", "complementos_servico", "impactos"] },
  { id: "dados", label: "Dados & Configuração", icon: ShieldCheck,
    items: ["variable", "map_services", "google_form", "test_account", "devices", "updates", "trash", "audit"] },
];

function groupOf(id: SectionId): SectionGroup | undefined {
  return SECTION_GROUPS.find((g) => g.items.includes(id));
}

function AdminPage() {
  const navigate = useNavigate();
  const { session, userId, loading: authLoading } = useAuthSession();
  const isAdmin = useIsAdmin(userId);
  const adminPw = "137889";
  const [section, setSection] = useState<SectionId>("tipos_servico");
  const [view, setView] = useState<"menu" | "section" | "ranking">("menu");
  const [exitOpen, setExitOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const queryClient = useQueryClient();
  const isReservedAdminLogin =
    session?.user.email?.toLowerCase() === "adm@gpva.local" ||
    session?.user.user_metadata?.is_admin === true;
  const hasAdminAccess = isReservedAdminLogin || isAdmin.data === true;

  useEffect(() => {
    if (typeof window === "undefined" || !hasAdminAccess) return;
    window.history.pushState({ __gpvaAdminGuard: true }, "");
    const onPop = () => {
      if (view !== "menu") {
        setView("menu");
      } else {
        setExitOpen(true);
      }
      window.history.pushState({ __gpvaAdminGuard: true }, "");
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [hasAdminAccess, view]);

  async function confirmExit() {
    setExitOpen(false);
    sessionStorage.removeItem("gpva-admin-pw");
    prepareLocalSignOut();
    await navigate({ to: "/auth", replace: true });
    void signOutApp(queryClient);
  }

  // Marca a sessão de admin (compat com server fns) enquanto o papel for válido.
  useEffect(() => {
    if (hasAdminAccess) sessionStorage.setItem("gpva-admin-pw", adminPw);
  }, [adminPw, hasAdminAccess]);

  // Sem sessão ou sem papel de admin → volta para o login.
  useEffect(() => {
    if (authLoading || (!isReservedAdminLogin && isAdmin.isLoading)) return;
    if (!userId || (!isReservedAdminLogin && isAdmin.data === false)) navigate({ to: "/auth" });
  }, [authLoading, isReservedAdminLogin, isAdmin.isLoading, isAdmin.data, userId, navigate]);

  if (authLoading || (!isReservedAdminLogin && isAdmin.isLoading) || !hasAdminAccess) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-border bg-background/95 px-4 py-3 backdrop-blur pt-[calc(env(safe-area-inset-top)+0.75rem)]">
        <div className="flex min-w-0 items-center gap-2">
          <button
            onClick={() => setMenuOpen(true)}
            className="-ml-1 inline-flex size-10 shrink-0 items-center justify-center rounded-lg text-foreground transition-colors hover:bg-muted"
            aria-label="Abrir menu"
          >
            <Menu className="size-6" />
          </button>
          <nav className="min-w-0 flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wider">
            <button
              type="button"
              onClick={() => setView("menu")}
              className={view === "menu" ? "text-foreground" : "text-muted-foreground hover:text-foreground truncate"}
            >
              Administração
            </button>
            {view === "ranking" && (
              <>
                <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate text-foreground normal-case tracking-normal">Painel</span>
              </>
            )}
            {view === "section" && (
              <>
                <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="hidden sm:inline text-muted-foreground normal-case tracking-normal">
                  {groupOf(section)?.label}
                </span>
                <ChevronRight className="hidden sm:inline size-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate text-foreground normal-case tracking-normal">
                  {SECTION_INFO[section].label}
                </span>
              </>
            )}
          </nav>
        </div>
        <ThemeToggle />
      </header>
      <ExitConfirmDialog open={exitOpen} onOpenChange={setExitOpen} onConfirm={confirmExit} />

      <AdminSideMenu
        open={menuOpen}
        onOpenChange={setMenuOpen}
        currentView={view}
        currentSection={section}
        onSelectMenu={() => { setView("menu"); setMenuOpen(false); }}
        onSelectRanking={() => { setView("ranking"); setMenuOpen(false); }}
        onSelectSection={(id: SectionId) => { setSection(id); setView("section"); setMenuOpen(false); }}
        onSignOut={() => { setMenuOpen(false); setExitOpen(true); }}
      />

      {view === "menu" ? (
        <main className="mx-auto max-w-5xl space-y-5 overflow-x-hidden px-4 pt-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={() => setView("ranking")}
            className="group flex w-full items-center gap-4 rounded-2xl border border-border bg-gradient-to-br from-primary/10 via-card to-card p-5 text-left shadow-md transition-all hover:border-primary hover:shadow-xl"
          >
            <div className="grid size-12 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground">
              <LayoutDashboard className="size-6" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Visão geral</div>
              <div className="text-lg font-semibold text-foreground">Painel</div>
              <div className="text-xs text-muted-foreground">Ranking geral das equipes</div>
            </div>
            <ChevronRight className="size-5 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
          </button>

          <div className="grid min-w-0 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {SECTION_GROUPS.map((group) => {
              const GIcon = group.icon;
              return (
                <section
                  key={group.id}
                  className="min-w-0 overflow-hidden rounded-2xl bg-card p-4 shadow-md"
                >
                  <div className="mb-3 flex items-center gap-2">
                    <GIcon className="size-4 text-primary" />
                    <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {group.label}
                    </h2>
                  </div>
                  <ul className="space-y-1">
                    {group.items.map((id) => {
                      const info = SECTION_INFO[id];
                      const Icon = info.icon;
                      return (
                        <li key={id}>
                          <button
                            type="button"
                            onClick={() => { setSection(id); setView("section"); }}
                            className="group flex w-full min-w-0 items-start gap-3 rounded-xl px-2.5 py-2.5 text-left transition-colors hover:bg-muted"
                          >
                            <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary">
                              <Icon className="size-4" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-sm font-medium text-foreground">{info.label}</div>
                              <div className="truncate text-xs text-muted-foreground">{info.description}</div>
                            </div>
                            <ChevronRight className="mt-1.5 size-4 shrink-0 text-muted-foreground/60 group-hover:text-primary" />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })}
          </div>
        </main>
      ) : view === "ranking" ? (
        <main className="mx-auto max-w-2xl px-4 pt-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
          <RankingSection adminPw={adminPw} />
        </main>
      ) : (
        <main className="mx-auto max-w-2xl px-4 pt-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
          <div className="rounded-2xl bg-card p-4 shadow-md sm:p-5">
          {section === "create_team" ? (
            <CreateTeamSection adminPw={adminPw} />
          ) : section === "variable" ? (
            <VariableSection adminPw={adminPw} />
          ) : section === "leaders" ? (
            <LeadersSection adminPw={adminPw} />
          ) : section === "setores" ? (
            <SetoresSection adminPw={adminPw} />
          ) : section === "supervisores" ? (
            <SupervisoresSection adminPw={adminPw} />
          ) : section === "google_form" ? (
            <GoogleFormSection adminPw={adminPw} />
          ) : section === "test_account" ? (
            <TestAccountSection adminPw={adminPw} />
          ) : section === "map_services" ? (
            <MapServicesSection adminPw={adminPw} />
          ) : section === "devices" ? (
            <DevicesSection adminPw={adminPw} />
          ) : section === "updates" ? (
            <UpdatesSection adminPw={adminPw} />
          ) : section === "trash" ? (
            <TrashSection adminPw={adminPw} />
          ) : section === "audit" ? (
            <AuditSection adminPw={adminPw} />
          ) : (
            <CrudSection
              adminPw={adminPw}
              table={section as "tipos_servico" | "motivos_inviabilidade" | "complementos_servico" | "impactos"}
              label={SECTION_INFO[section].label}
            />
          )}
          </div>
        </main>
      )}
    </div>
  );
}

function useTeamsList(adminPw: string) {
  const list = useServerFn(listTeams);
  return useQuery({
    queryKey: ["admin-teams"],
    queryFn: () => list({ data: { adminPassword: adminPw } }),
    select: (teams) => teams.filter((team) => team.team_name.trim().toLowerCase() !== "adm"),
  });
}

function TeamSelector({
  adminPw,
  value,
  onChange,
}: {
  adminPw: string;
  value: string;
  onChange: (id: string) => void;
}) {
  const teams = useTeamsList(adminPw);
  return (
    <div className="space-y-2">
      <Label>Equipe</Label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
      >
        <option value="">Selecione…</option>
        {teams.data?.map((t) => (
          <option key={t.id} value={t.id}>
            {t.team_name}
          </option>
        ))}
      </select>
    </div>
  );
}

function CrudSection({
  adminPw,
  table,
  label,
}: {
  adminPw: string;
  table: "tipos_servico" | "motivos_inviabilidade" | "complementos_servico" | "impactos";
  label: string;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const listFn = useServerFn(adminListRows);
  const addFn = useServerFn(adminAddRow);
  const delFn = useServerFn(adminDeleteRow);

  const rows = useQuery({
    queryKey: ["admin-rows", table],
    queryFn: () => listFn({ data: { adminPassword: adminPw, table } }),
  });

  const addMut = useMutation({
    mutationFn: () =>
      addFn({ data: { adminPassword: adminPw, table, name } }),
    onSuccess: () => {
      setName("");
      qc.invalidateQueries({ queryKey: ["admin-rows", table] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => delFn({ data: { adminPassword: adminPw, table, id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-rows", table] }),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-5">
      <h2 className="text-base font-semibold">{label}</h2>
      <div className="flex gap-2">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={`Novo item`}
              className="h-11"
            />
            <Button
              onClick={() => name.trim() && addMut.mutate()}
              disabled={addMut.isPending}
              className="h-11"
            >
              {addMut.isPending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            </Button>
      </div>
      <div className="space-y-1">
            {rows.isLoading ? (
              <Loader2 className="mx-auto size-5 animate-spin text-muted-foreground" />
            ) : (
              rows.data?.map((r) => (
                <div
                  key={r.id}
                  className="flex items-center justify-between rounded-lg bg-card shadow-md px-3 py-2"
                >
                  <span className="text-sm">{r.name}</span>
                  <button
                    onClick={async () => {
                      if (await confirmDelete({ description: `Excluir "${r.name}"? Esta ação não poderá ser desfeita.` })) {
                        delMut.mutate(r.id);
                      }
                    }}
                    className="rounded p-1 text-muted-foreground hover:text-destructive"
                    aria-label="Remover"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              ))
            )}
      </div>
    </div>
  );
}

function SetoresSection({ adminPw }: { adminPw: string }) {
  const qc = useQueryClient();
  const listFn = useServerFn(adminListSetores);
  const createFn = useServerFn(adminCreateSetor);
  const updateFn = useServerFn(adminUpdateSetor);
  const deleteFn = useServerFn(adminDeleteSetor);

  const [nome, setNome] = useState("");

  const rows = useQuery({
    queryKey: ["admin-setores"],
    queryFn: () => listFn({ data: { adminPassword: adminPw } }),
  });

  const createMut = useMutation({
    mutationFn: () =>
      createFn({ data: { adminPassword: adminPw, nome } }),
    onSuccess: () => {
      setNome("");
      toast.success("Setor criado");
      qc.invalidateQueries({ queryKey: ["admin-setores"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateMut = useMutation({
    mutationFn: (payload: { setorId: string; nome?: string }) =>
      updateFn({ data: { adminPassword: adminPw, ...payload } }),
    onSuccess: () => {
      toast.success("Setor atualizado");
      qc.invalidateQueries({ queryKey: ["admin-setores"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (setorId: string) =>
      deleteFn({ data: { adminPassword: adminPw, setorId } }),
    onSuccess: () => {
      toast.success("Setor excluído");
      qc.invalidateQueries({ queryKey: ["admin-setores"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-5">
      <h2 className="text-base font-semibold">Setores</h2>
      <p className="text-xs text-muted-foreground">
        Os setores são o topo da árvore operacional. Supervisores e líderes são
        vinculados ao setor na seção Supervisores.
      </p>

      <div className="space-y-2 rounded-lg bg-card shadow-md p-3">
        <Label>Novo setor</Label>
        <Input
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder="Nome do setor (ex.: Poda)"
          className="h-11"
        />
        <Button
          onClick={() => nome.trim() && createMut.mutate()}
          disabled={createMut.isPending || !nome.trim()}
          className="h-11 w-full"
        >
          {createMut.isPending ? <Loader2 className="size-4 animate-spin" /> : "Adicionar setor"}
        </Button>
      </div>

      <div className="space-y-2">
        {rows.isLoading ? (
          <Loader2 className="mx-auto size-5 animate-spin text-muted-foreground" />
        ) : (
          rows.data?.map((s) => (
            <SetorEditRow
              key={s.id}
              setor={s}
              onSave={(patch) => updateMut.mutate({ setorId: s.id, ...patch })}
              onDelete={() => {
                void confirmDelete({
                  title: "Excluir setor?",
                  description: `O setor "${s.nome}" será removido. Esta ação não poderá ser desfeita.`,
                }).then((ok) => { if (ok) deleteMut.mutate(s.id); });
              }}
              saving={updateMut.isPending}
            />
          ))
        )}
      </div>
    </div>
  );
}

function SetorEditRow({
  setor,
  onSave,
  onDelete,
  saving,
}: {
  setor: { id: string; nome: string };
  onSave: (patch: { nome?: string }) => void;
  onDelete: () => void;
  saving: boolean;
}) {
  const [nome, setNome] = useState(setor.nome);
  const dirty = nome !== setor.nome;

  return (
    <div className="space-y-2 rounded-lg bg-card shadow-md p-3">
      <Input value={nome} onChange={(e) => setNome(e.target.value)} className="h-10" />
      <div className="flex justify-end gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={onDelete}
          className="h-8 text-destructive hover:text-destructive"
        >
          <Trash2 className="mr-1 size-3.5" /> Excluir
        </Button>
        <Button
          size="sm"
          disabled={!dirty || saving || !nome.trim()}
          onClick={() => onSave({ nome })}
          className="h-8"
        >
          {saving ? <Loader2 className="size-3.5 animate-spin" /> : "Salvar"}
        </Button>
      </div>
    </div>
  );
}

function VariableSection({ adminPw }: { adminPw: string }) {
  const qc = useQueryClient();
  const teams = useTeamsList(adminPw);
  const [teamId, setTeamId] = useState("");
  const [rate, setRate] = useState("");
  const updateFn = useServerFn(adminUpdateRate);

  const current = useMemo(
    () => teams.data?.find((t) => t.id === teamId),
    [teams.data, teamId],
  );

  useEffect(() => {
    if (current) setRate(String(current.variable_rate));
  }, [current]);

  const mut = useMutation({
    mutationFn: () => {
      const n = Number(rate.replace(",", "."));
      if (!isFinite(n) || n < 0) throw new Error("Valor inválido");
      return updateFn({ data: { adminPassword: adminPw, teamId, rate: n } });
    },
    onSuccess: () => {
      toast.success("Valor atualizado");
      qc.invalidateQueries({ queryKey: ["admin-teams"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-5">
      <h2 className="text-base font-semibold">Variável</h2>
      <TeamSelector adminPw={adminPw} value={teamId} onChange={setTeamId} />
      {teamId && (
        <div className="space-y-3">
          <Label htmlFor="rate">Valor pago por negociação (R$)</Label>
          <Input
            id="rate"
            inputMode="decimal"
            value={rate}
            onChange={(e) => setRate(e.target.value.replace(/[^0-9.,]/g, ""))}
            className="h-12 text-base"
          />
          <Button onClick={() => mut.mutate()} disabled={mut.isPending} className="h-11 w-full">
            {mut.isPending ? <Loader2 className="size-4 animate-spin" /> : "Salvar"}
          </Button>
        </div>
      )}
    </div>
  );
}

/**
 * Seletores em cascata SETOR → SUPERVISOR → LÍDER.
 * Trabalha exclusivamente com UUIDs; nenhuma inferência textual.
 */
function HierarchyPicker({
  adminPw,
  setorId,
  supervisorId,
  leaderId,
  onChange,
  requireLeader = true,
}: {
  adminPw: string;
  setorId: string;
  supervisorId: string;
  leaderId: string;
  onChange: (next: { setorId: string; supervisorId: string; leaderId: string }) => void;
  requireLeader?: boolean;
}) {
  const setoresFn = useServerFn(adminListSetores);
  const supervisoresFn = useServerFn(adminListSupervisores);
  const leadersFn = useServerFn(adminListLeaders);

  const setores = useQuery({
    queryKey: ["admin-setores"],
    queryFn: () => setoresFn({ data: { adminPassword: adminPw } }),
  });
  const supervisores = useQuery({
    queryKey: ["admin-supervisores"],
    queryFn: () => supervisoresFn({ data: { adminPassword: adminPw } }),
  });
  const leaders = useQuery({
    queryKey: ["admin-leaders"],
    queryFn: () => leadersFn({ data: { adminPassword: adminPw } }),
    staleTime: 60_000,
  });

  const supervisorOptions = (supervisores.data ?? []).filter((s) => s.setor_id === setorId);
  const leaderOptions = (leaders.data ?? []).filter(
    (l) => l.estrutura_normalizada && l.setor_id === setorId && l.supervisor_id === supervisorId,
  );

  return (
    <>
      <div className="space-y-2">
        <Label>Setor</Label>
        <select
          value={setorId}
          onChange={(e) => onChange({ setorId: e.target.value, supervisorId: "", leaderId: "" })}
          className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">Selecione…</option>
          {setores.data?.map((s) => (
            <option key={s.id} value={s.id}>{s.nome}</option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <Label>Supervisor</Label>
        <select
          value={supervisorId}
          disabled={!setorId}
          onChange={(e) => onChange({ setorId, supervisorId: e.target.value, leaderId: "" })}
          className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm disabled:opacity-50"
        >
          <option value="">{setorId ? "Selecione…" : "Escolha o setor primeiro"}</option>
          {supervisorOptions.map((s) => (
            <option key={s.id} value={s.id}>{s.nome}</option>
          ))}
        </select>
        {setorId && supervisorOptions.length === 0 && (
          <p className="text-xs text-muted-foreground">
            Nenhum supervisor neste setor. Cadastre em "Supervisores".
          </p>
        )}
      </div>

      {requireLeader && (
        <div className="space-y-2">
          <Label>Líder</Label>
          <select
            value={leaderId}
            disabled={!supervisorId}
            onChange={(e) => onChange({ setorId, supervisorId, leaderId: e.target.value })}
            className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm disabled:opacity-50"
          >
            <option value="">{supervisorId ? "Selecione…" : "Escolha o supervisor primeiro"}</option>
            {leaderOptions.map((l) => (
              <option key={l.leader_structure_id ?? l.user_id} value={l.leader_structure_id ?? ""}>
                {l.nome || l.login}
              </option>
            ))}
          </select>
          {supervisorId && leaderOptions.length === 0 && (
            <p className="text-xs text-muted-foreground">
              Nenhum líder normalizado sob este supervisor. Cadastre ou normalize em "Líderes".
            </p>
          )}
        </div>
      )}
    </>
  );
}

function SupervisoresSection({ adminPw }: { adminPw: string }) {
  const qc = useQueryClient();
  const listFn = useServerFn(adminListSupervisores);
  const setoresFn = useServerFn(adminListSetores);
  const createFn = useServerFn(adminCreateSupervisor);
  const updateFn = useServerFn(adminUpdateSupervisor);
  const deleteFn = useServerFn(adminDeleteSupervisor);

  const [nome, setNome] = useState("");
  const [setorId, setSetorId] = useState("");

  const rows = useQuery({
    queryKey: ["admin-supervisores"],
    queryFn: () => listFn({ data: { adminPassword: adminPw } }),
  });
  const setores = useQuery({
    queryKey: ["admin-setores"],
    queryFn: () => setoresFn({ data: { adminPassword: adminPw } }),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["admin-supervisores"] });
    qc.invalidateQueries({ queryKey: ["admin-leaders"] });
  };

  const createMut = useMutation({
    mutationFn: () => createFn({ data: { adminPassword: adminPw, nome, setorId } }),
    onSuccess: () => {
      setNome("");
      setSetorId("");
      toast.success("Supervisor criado");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateMut = useMutation({
    mutationFn: (payload: { supervisorId: string; nome?: string; setorId?: string }) =>
      updateFn({ data: { adminPassword: adminPw, ...payload } }),
    onSuccess: () => { toast.success("Supervisor atualizado"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (supervisorId: string) =>
      deleteFn({ data: { adminPassword: adminPw, supervisorId } }),
    onSuccess: () => { toast.success("Supervisor excluído"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-5">
      <h2 className="text-base font-semibold">Supervisores</h2>
      <p className="text-xs text-muted-foreground">
        Cada supervisor pertence a um setor. Líderes e equipes são vinculados ao supervisor
        por identificador — nenhum nome é inferido por texto.
      </p>

      <div className="space-y-2 rounded-lg bg-card shadow-md p-3">
        <Label>Novo supervisor</Label>
        <Input
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder="Nome do supervisor"
          className="h-11"
        />
        <select
          value={setorId}
          onChange={(e) => setSetorId(e.target.value)}
          className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">Selecione o setor…</option>
          {setores.data?.map((s) => (
            <option key={s.id} value={s.id}>{s.nome}</option>
          ))}
        </select>
        <Button
          onClick={() => createMut.mutate()}
          disabled={createMut.isPending || !nome.trim() || !setorId}
          className="h-11 w-full"
        >
          {createMut.isPending ? <Loader2 className="size-4 animate-spin" /> : "Adicionar supervisor"}
        </Button>
      </div>

      <div className="space-y-2">
        {rows.isLoading ? (
          <Loader2 className="mx-auto size-5 animate-spin text-muted-foreground" />
        ) : (rows.data ?? []).length === 0 ? (
          <p className="text-xs text-muted-foreground">Nenhum supervisor cadastrado.</p>
        ) : (
          rows.data?.map((s) => (
            <SupervisorEditRow
              key={s.id}
              supervisor={s}
              setores={setores.data ?? []}
              saving={updateMut.isPending}
              onSave={(patch) => updateMut.mutate({ supervisorId: s.id, ...patch })}
              onDelete={() => {
                void confirmDelete({
                  title: "Excluir supervisor?",
                  description: `O supervisor "${s.nome}" será removido. Esta ação não poderá ser desfeita.`,
                }).then((ok) => { if (ok) deleteMut.mutate(s.id); });
              }}
            />
          ))
        )}
      </div>
    </div>
  );
}

function SupervisorEditRow({
  supervisor,
  setores,
  onSave,
  onDelete,
  saving,
}: {
  supervisor: { id: string; nome: string; setor_id: string; setor_nome: string | null };
  setores: Array<{ id: string; nome: string }>;
  onSave: (patch: { nome?: string; setorId?: string }) => void;
  onDelete: () => void;
  saving: boolean;
}) {
  const [nome, setNome] = useState(supervisor.nome);
  const [setorId, setSetorId] = useState(supervisor.setor_id);
  const dirty = nome !== supervisor.nome || setorId !== supervisor.setor_id;

  return (
    <div className="space-y-2 rounded-lg bg-card shadow-md p-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <Input value={nome} onChange={(e) => setNome(e.target.value)} className="h-10" />
        <select
          value={setorId}
          onChange={(e) => setSetorId(e.target.value)}
          className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
        >
          {setores.map((s) => (
            <option key={s.id} value={s.id}>{s.nome}</option>
          ))}
        </select>
      </div>
      <div className="flex justify-end gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={onDelete}
          className="h-8 text-destructive hover:text-destructive"
        >
          <Trash2 className="mr-1 size-3.5" /> Excluir
        </Button>
        <Button
          size="sm"
          disabled={!dirty || saving || !nome.trim()}
          onClick={() => onSave({ nome, setorId })}
          className="h-8"
        >
          {saving ? <Loader2 className="size-3.5 animate-spin" /> : "Salvar"}
        </Button>
      </div>
    </div>
  );
}

function CreateTeamSection({ adminPw }: { adminPw: string }) {
  const qc = useQueryClient();
  const [teamName, setTeamName] = useState("");
  const [password, setPassword] = useState("");
  const [collab1, setCollab1] = useState("");
  const [collab2, setCollab2] = useState("");
  const [hier, setHier] = useState({ setorId: "", supervisorId: "", leaderId: "" });
  const createFn = useServerFn(adminCreateTeam);

  const mut = useMutation({
    mutationFn: () =>
      createFn({
        data: {
          adminPassword: adminPw,
          teamName,
          password,
          setorId: hier.setorId,
          supervisorId: hier.supervisorId,
          leaderId: hier.leaderId,
          collaborator1: collab1.trim() || null,
          collaborator2: collab2.trim() || null,
        },
      }),
    onSuccess: () => {
      toast.success("Equipe criada");
      setTeamName("");
      setPassword("");
      setCollab1("");
      setCollab2("");
      setHier({ setorId: "", supervisorId: "", leaderId: "" });
      qc.invalidateQueries({ queryKey: ["admin-teams"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-5">
      <h2 className="text-base font-semibold">Criar Equipe</h2>
      <HierarchyPicker
        adminPw={adminPw}
        setorId={hier.setorId}
        supervisorId={hier.supervisorId}
        leaderId={hier.leaderId}
        onChange={setHier}
      />
      <div className="space-y-2">
        <Label htmlFor="tn">Nome da equipe</Label>
        <Input
          id="tn"
          value={teamName}
          onChange={(e) => setTeamName(e.target.value)}
          autoCapitalize="characters"
          className="h-12 text-base"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="np">Senha (mín. 6)</Label>
        <Input
          id="np"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="h-12 text-base"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="c1">Colaborador 1</Label>
        <Input
          id="c1"
          value={collab1}
          onChange={(e) => setCollab1(e.target.value)}
          className="h-12 text-base"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="c2">Colaborador 2</Label>
        <Input
          id="c2"
          value={collab2}
          onChange={(e) => setCollab2(e.target.value)}
          className="h-12 text-base"
        />
      </div>
      <Button
        onClick={() => mut.mutate()}
        disabled={
          mut.isPending ||
          !teamName.trim() ||
          password.length < 6 ||
          !hier.setorId ||
          !hier.supervisorId ||
          !hier.leaderId
        }
        className="h-12 w-full text-base font-semibold"
      >
        {mut.isPending ? <Loader2 className="size-5 animate-spin" /> : "Criar Equipe"}
      </Button>
    </div>
  );
}

function RankingSection({ adminPw }: { adminPw: string }) {
  const fn = useServerFn(adminTeamsRanking);
  const teams = useTeamsList(adminPw);
  const [selected, setSelected] = useState<string | null>(null);
  const now = new Date();
  const [year, setYear] = useState<number>(now.getFullYear());
  const [month, setMonth] = useState<number>(now.getMonth() + 1);
  const [day, setDay] = useState<number>(now.getDate());
  const [mode, setMode] = useState<"day" | "week" | "month">("day");

  const weeks = useMemo(() => {
    const y = year;
    const m = month - 1;
    const first = new Date(y, m, 1);
    const dow = (first.getDay() + 6) % 7;
    const start = new Date(y, m, 1 - dow);
    const list: { start: Date; end: Date; label: string }[] = [];
    const cur = new Date(start);
    for (let i = 0; i < 6; i++) {
      const s = new Date(cur);
      const e = new Date(cur);
      e.setDate(e.getDate() + 6);
      if (s.getMonth() === m || e.getMonth() === m) {
        const pad = (n: number) => n.toString().padStart(2, "0");
        list.push({
          start: s,
          end: e,
          label: `${pad(s.getDate())}/${pad(s.getMonth() + 1)} – ${pad(e.getDate())}/${pad(e.getMonth() + 1)}`,
        });
      }
      cur.setDate(cur.getDate() + 7);
    }
    return list;
  }, [year, month]);
  const [weekIdx, setWeekIdx] = useState<number>(0);
  useEffect(() => {
    const idx = weeks.findIndex(
      (w) => now >= w.start && now <= new Date(w.end.getFullYear(), w.end.getMonth(), w.end.getDate(), 23, 59, 59),
    );
    setWeekIdx(idx >= 0 ? idx : 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weeks]);

  const TZ_OFFSET_MS = 3 * 60 * 60 * 1000;
  const weekRange = useMemo(() => {
    if (mode !== "week") return null;
    const w = weeks[weekIdx];
    if (!w) return null;
    const startISO = new Date(
      Date.UTC(w.start.getFullYear(), w.start.getMonth(), w.start.getDate()) + TZ_OFFSET_MS,
    ).toISOString();
    const endISO = new Date(
      Date.UTC(w.end.getFullYear(), w.end.getMonth(), w.end.getDate() + 1) + TZ_OFFSET_MS,
    ).toISOString();
    return { startISO, endISO };
  }, [mode, weeks, weekIdx]);

  const dayParam = mode === "day" ? day : null;
  const q = useQuery({
    queryKey: [
      "admin-ranking",
      year,
      month,
      dayParam,
      mode,
      weekRange?.startISO ?? null,
    ],
    queryFn: () =>
      fn({
        data: {
          adminPassword: adminPw,
          year,
          month,
          day: dayParam,
          startISO: weekRange?.startISO ?? null,
          endISO: weekRange?.endISO ?? null,
        },
      }),
  });

  if (q.isLoading) {
    return <Loader2 className="mx-auto size-5 animate-spin text-muted-foreground" />;
  }

  const sorted = [...(q.data ?? [])]
    .filter((team) => team.team_name.trim().toLowerCase() !== "adm")
    .sort(
    (a, b) => b.viable + b.negotiations - (a.viable + a.negotiations),
    );
  const max = Math.max(1, ...sorted.map((t) => t.viable));
  const topNegId = sorted.reduce<{ id: string | null; v: number }>(
    (acc, t) => (t.negotiationValue > acc.v ? { id: t.id, v: t.negotiationValue } : acc),
    { id: null, v: -1 },
  ).id;
  const brl = (n: number) =>
    n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const current = selected ? sorted.find((t) => t.id === selected) : null;

  const monthNames = [
    "Janeiro","Fevereiro","Março","Abril","Maio","Junho",
    "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro",
  ];
  const years: number[] = [];
  for (let y = now.getFullYear(); y >= now.getFullYear() - 4; y--) years.push(y);
  const daysInMonth = new Date(year, month, 0).getDate();
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  const selectCls = "h-10 rounded-lg bg-card shadow-md px-3 text-sm";
  const periodSelector = (variant: "day" | "week" | "month") => (
    <div className="flex gap-2 min-w-0">
      {variant === "day" ? (
        <select
          value={day}
          onChange={(e) => setDay(Number(e.target.value))}
          className={`${selectCls} w-20 shrink-0`}
        >
          {days.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
      ) : variant === "week" ? (
        <select
          value={weekIdx}
          onChange={(e) => setWeekIdx(Number(e.target.value))}
          className={`${selectCls} w-20 shrink-0`}
        >
          {weeks.map((_, i) => (
            <option key={i} value={i}>Sem. {i + 1}</option>
          ))}
        </select>
      ) : (
        <select
          disabled
          value=""
          className={`${selectCls} w-20 shrink-0 text-muted-foreground`}
        >
          <option value="">—</option>
        </select>
      )}
      <select
        value={month}
        onChange={(e) => setMonth(Number(e.target.value))}
        className={`${selectCls} min-w-0 flex-1`}
      >
        {monthNames.map((n, i) => (
          <option key={i} value={i + 1}>{n}</option>
        ))}
      </select>
      <select
        value={year}
        onChange={(e) => setYear(Number(e.target.value))}
        className={`${selectCls} w-24 shrink-0`}
      >
        {years.map((y) => (
          <option key={y} value={y}>{y}</option>
        ))}
      </select>
    </div>
  );

  if (current) {
    const teamFull = teams.data?.find((t) => t.id === current.id);
    return (
      <div className="space-y-4">
        <TeamHeader adminPw={adminPw} team={teamFull ?? { id: current.id, team_name: current.team_name, photo_url: null, collaborator1: null, collaborator2: null, variable_rate: 0, setor_id: null, supervisor_id: null, leader_id: null, supervisor: null, leader: null }} onDeleted={() => setSelected(null)} />
        {periodSelector("day")}
        <TeamDayReports adminPw={adminPw} teamId={current.id} year={year} month={month} day={day} />
        <div className="grid grid-cols-2 gap-3">
          <Stat label="Total" value={current.total} />
          <Stat label="Viáveis" value={current.viable} />
          <Stat label="Inviáveis" value={current.inviable} />
          <Stat label="Negociações" value={current.negotiations} />
        </div>
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-muted-foreground">Por tipo de serviço</h3>
          <div className="space-y-1">
            {Object.entries(current.byType)
              .sort((a, b) => b[1] - a[1])
              .map(([name, qty]) => (
                <div
                  key={name}
                  className="flex items-center justify-between rounded-lg bg-card shadow-md px-3 py-2 text-sm"
                >
                  <span>{name}</span>
                  <span className="font-semibold">{qty}</span>
                </div>
              ))}
            {Object.keys(current.byType).length === 0 && (
              <p className="text-sm text-muted-foreground">Sem registros.</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold">Ranking de Equipes</h2>
        <div className="inline-flex overflow-hidden rounded-lg border border-border">
          {(["day", "week", "month"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`px-3 py-1 text-xs font-semibold ${mode === m ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground"}`}
            >
              {m === "day" ? "Dia" : m === "week" ? "Semana" : "Mês"}
            </button>
          ))}
        </div>
      </div>
      {periodSelector(mode)}
      <div className="space-y-3">
        {sorted.map((t) => {
          const pct = Math.round((t.viable / max) * 100);
          const isTopNeg = t.id === topNegId && t.negotiationValue > 0;
          return (
            <button
              key={t.id}
              onClick={() => setSelected(t.id)}
              className={`block w-full rounded-xl bg-card p-3 text-left transition-colors ${
                isTopNeg
                  ? "border-0 ring-2 ring-blue-500"
                  : "border border-border hover:border-primary"
              }`}
            >
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-semibold">{t.team_name}</span>
                <span className="text-xs text-muted-foreground">
                  {brl(t.negotiationValue)}
                </span>
              </div>
              <div className="relative h-6 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-primary transition-all"
                  style={{ width: `${pct}%` }}
                />
                <span className="absolute inset-y-0 right-2 flex items-center text-xs font-semibold text-foreground">
                  {t.viable}
                </span>
              </div>
            </button>
          );
        })}
        {sorted.length === 0 && (
          <p className="text-sm text-muted-foreground">Sem equipes cadastradas.</p>
        )}
      </div>
    </div>
  );
}

type TeamRow = {
  id: string;
  team_name: string;
  photo_url: string | null;
  collaborator1: string | null;
  collaborator2: string | null;
  variable_rate: number;
  setor_id: string | null;
  supervisor_id: string | null;
  leader_id: string | null;
  supervisor: string | null;
  leader: string | null;
};

function TeamHeader({
  adminPw,
  team,
  onDeleted,
}: {
  adminPw: string;
  team: TeamRow;
  onDeleted: () => void;
}) {
  const qc = useQueryClient();
  const updateFn = useServerFn(adminUpdateTeam);
  const deleteFn = useServerFn(adminDeleteTeam);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(team.team_name);
  const [c1, setC1] = useState(team.collaborator1 ?? "");
  const [c2, setC2] = useState(team.collaborator2 ?? "");
  const [newPassword, setNewPassword] = useState("");
  const [hier, setHier] = useState({
    setorId: team.setor_id ?? "",
    supervisorId: team.supervisor_id ?? "",
    leaderId: team.leader_id ?? "",
  });
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const hierComplete = !!hier.setorId && !!hier.supervisorId && !!hier.leaderId;

  const updateMut = useMutation({
    mutationFn: () =>
      updateFn({
        data: {
          adminPassword: adminPw,
          teamId: team.id,
          teamName: name,
          collaborator1: c1.trim() || null,
          collaborator2: c2.trim() || null,
          setorId: hier.setorId,
          supervisorId: hier.supervisorId,
          leaderId: hier.leaderId,
          ...(newPassword ? { password: newPassword } : {}),
        },
      }),
    onSuccess: () => {
      toast.success("Equipe atualizada");
      setEditing(false);
      setNewPassword("");
      qc.invalidateQueries({ queryKey: ["admin-teams"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: () => deleteFn({ data: { adminPassword: adminPw, teamId: team.id } }),
    onSuccess: () => {
      toast.success("Equipe excluída");
      qc.invalidateQueries({ queryKey: ["admin-teams"] });
      onDeleted();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
    <div className="flex flex-col gap-3 rounded-xl bg-card shadow-md p-3">
      <div className="flex items-center gap-3">
        <div className="size-20 shrink-0 overflow-hidden rounded-lg border border-border bg-muted">
          {team.photo_url ? (
            <img src={team.photo_url} alt={team.team_name} className="h-full w-full object-cover" />
          ) : null}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-semibold">{team.team_name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {[team.collaborator1, team.collaborator2].filter(Boolean).join(" e ") || "Sem colaboradores"}
          </p>
          {!editing && (
            <div className="mt-2 flex gap-1">
              <Button variant="outline" className="h-8 px-3 text-xs" onClick={() => setEditing(true)}>
                Editar
              </Button>
              <button
                onClick={() => setConfirmDeleteOpen(true)}
                className="rounded p-1.5 text-muted-foreground hover:text-destructive"
                aria-label="Excluir"
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          )}
        </div>
      </div>
      {editing && (
        <div className="space-y-2 border-t border-border pt-3">
          <div className="space-y-1">
            <Label className="text-xs">Nome da equipe</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} className="h-10" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Colaborador 1</Label>
            <Input value={c1} onChange={(e) => setC1(e.target.value)} className="h-10" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Colaborador 2</Label>
            <Input value={c2} onChange={(e) => setC2(e.target.value)} className="h-10" />
          </div>
          <HierarchyPicker
            adminPw={adminPw}
            setorId={hier.setorId}
            supervisorId={hier.supervisorId}
            leaderId={hier.leaderId}
            onChange={setHier}
          />
          <div className="space-y-1">
            <Label className="text-xs">Nova senha (opcional, mín. 6)</Label>
            <Input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Deixe em branco para manter a atual"
              className="h-10"
            />
          </div>
          <div className="flex gap-2 pt-1">
            <Button
              variant="outline"
              className="h-10 flex-1"
              onClick={() => {
                setEditing(false);
                setNewPassword("");
              }}
            >
              Cancelar
            </Button>
            <Button
              className="h-10 flex-1"
              disabled={
                updateMut.isPending ||
                !name.trim() ||
                !hierComplete ||
                (newPassword.length > 0 && newPassword.length < 6)
              }
              onClick={() => updateMut.mutate()}
            >
              {updateMut.isPending ? <Loader2 className="size-4 animate-spin" /> : "Salvar"}
            </Button>
          </div>
        </div>
      )}
    </div>
    <ExitConfirmDialog
      open={confirmDeleteOpen}
      onOpenChange={setConfirmDeleteOpen}
      onConfirm={() => {
        setConfirmDeleteOpen(false);
        deleteMut.mutate();
      }}
      title="Excluir equipe"
      description={`Excluir equipe "${team.team_name}"? Todos os dados dela serão apagados.`}
    />
    </>
  );
}

function TeamDayReports({
  adminPw,
  teamId,
  year,
  month,
  day,
}: {
  adminPw: string;
  teamId: string;
  year: number;
  month: number;
  day: number;
}) {
  const qc = useQueryClient();
  const listFn = useServerFn(adminListShifts);
  const delFn = useServerFn(adminDeleteShift);
  const updFn = useServerFn(adminUpdateShiftReport);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [text, setText] = useState("");

  const q = useQuery({
    queryKey: ["admin-shifts", teamId],
    queryFn: () => listFn({ data: { adminPassword: adminPw, teamId } }),
  });

  const delMut = useMutation({
    mutationFn: (shiftId: string) => delFn({ data: { adminPassword: adminPw, shiftId } }),
    onSuccess: () => {
      toast.success("Relatório excluído");
      qc.invalidateQueries({ queryKey: ["admin-shifts", teamId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updMut = useMutation({
    mutationFn: (shiftId: string) =>
      updFn({ data: { adminPassword: adminPw, shiftId, reportText: text } }),
    onSuccess: () => {
      toast.success("Relatório atualizado");
      setEditingId(null);
      qc.invalidateQueries({ queryKey: ["admin-shifts", teamId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const dayStart = new Date(year, month - 1, day, 0, 0, 0).getTime();
  const dayEnd = dayStart + 24 * 60 * 60 * 1000;
  const filtered = (q.data ?? []).filter((r) => {
    const t = new Date(r.started_at).getTime();
    return t >= dayStart && t < dayEnd;
  });

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-muted-foreground">Relatórios do dia</h3>
      {q.isLoading ? (
        <Loader2 className="mx-auto size-5 animate-spin text-muted-foreground" />
      ) : filtered.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nenhum relatório neste dia.</p>
      ) : (
        <div className="space-y-2">
          {filtered.map((r) => {
            const isEditing = editingId === r.id;
            return (
              <div key={r.id} className="rounded-xl bg-card shadow-md p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{formatDateBR(r.started_at)}</p>
                    <p className="text-xs text-muted-foreground">
                      {r.status === "closed" ? "Fechado" : "Aberto"}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    {!isEditing && (
                      <Button
                        variant="outline"
                        className="h-9 px-3 text-xs"
                        onClick={() => {
                          setEditingId(r.id);
                          setText(r.report_text ?? "");
                        }}
                      >
                        Editar
                      </Button>
                    )}
                    <button
                      onClick={() => {
                        void confirmDelete({
                          title: "Excluir relatório?",
                          description: "Todos os serviços e impactos vinculados serão apagados. Esta ação não poderá ser desfeita.",
                        }).then((ok) => { if (ok) delMut.mutate(r.id); });
                      }}
                      className="rounded p-2 text-muted-foreground hover:text-destructive"
                      aria-label="Excluir"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </div>
                {isEditing && (
                  <div className="mt-3 space-y-2 border-t border-border pt-3">
                    <Label className="text-xs">Texto do relatório</Label>
                    <Textarea
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                      rows={10}
                      className="text-xs"
                    />
                    <div className="flex gap-2">
                      <Button variant="outline" className="h-10 flex-1" onClick={() => setEditingId(null)}>
                        Cancelar
                      </Button>
                      <Button
                        className="h-10 flex-1"
                        disabled={updMut.isPending}
                        onClick={() => updMut.mutate(r.id)}
                      >
                        {updMut.isPending ? <Loader2 className="size-4 animate-spin" /> : "Salvar"}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-card shadow-md p-3">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-bold">{value}</div>
    </div>
  );
}

function LeadersSection({ adminPw }: { adminPw: string }) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [hier, setHier] = useState({ setorId: "", supervisorId: "", leaderId: "" });
  const listFn = useServerFn(adminListLeaders);
  const createFn = useServerFn(adminCreateLeader);
  const delFn = useServerFn(adminDeleteLeader);

  const leaders = useQuery({
    queryKey: ["admin-leaders"],
    queryFn: () => listFn({ data: { adminPassword: adminPw } }),
    staleTime: 60_000,
  });

  const createMut = useMutation({
    mutationFn: () =>
      createFn({
        data: {
          adminPassword: adminPw,
          leaderName: name,
          login,
          password,
          setorId: hier.setorId,
          supervisorId: hier.supervisorId,
        },
      }),
    onSuccess: (res) => {
      setName("");
      setLogin("");
      setPassword("");
      setHier({ setorId: "", supervisorId: "", leaderId: "" });
      toast.success(`Líder criado. Login: ${res.login}`);
      qc.invalidateQueries({ queryKey: ["admin-leaders"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delMut = useMutation({
    mutationFn: (leaderUserId: string) =>
      delFn({ data: { adminPassword: adminPw, leaderUserId } }),
    onSuccess: () => {
      toast.success("Líder excluído");
      qc.invalidateQueries({ queryKey: ["admin-leaders"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="mb-3 text-base font-semibold">Novo líder</h2>
        <p className="mb-3 text-xs text-muted-foreground">
          O líder pertence a um setor e a um supervisor. O vínculo é feito por identificador —
          nenhum nome é interpretado como referência.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim() || !login.trim() || password.length < 6) {
              toast.error("Nome, login e senha (mín. 6) são obrigatórios.");
              return;
            }
            if (!hier.setorId || !hier.supervisorId) {
              toast.error("Selecione o setor e o supervisor do líder.");
              return;
            }
            createMut.mutate();
          }}
          className="space-y-2"
        >
          <HierarchyPicker
            adminPw={adminPw}
            setorId={hier.setorId}
            supervisorId={hier.supervisorId}
            leaderId=""
            requireLeader={false}
            onChange={setHier}
          />
          <div>
            <Label>Nome do líder</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: João Silva"
              className="h-11"
            />
          </div>
          <div>
            <Label>Login</Label>
            <Input
              value={login}
              onChange={(e) => setLogin(e.target.value)}
              placeholder="Ex: joao ou lider-joao"
              className="h-11"
              autoCapitalize="none"
              autoCorrect="off"
            />
            <p className="mt-1 text-[10px] text-muted-foreground">
              Somente letras, números e hífen. Este será o usuário de acesso.
            </p>
          </div>
          <div>
            <Label>Senha</Label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-11"
            />
          </div>
          <Button type="submit" disabled={createMut.isPending} className="h-11 w-full">
            {createMut.isPending ? <Loader2 className="size-4 animate-spin" /> : (<><Plus className="mr-2 size-4" /> Criar líder</>)}
          </Button>
        </form>
      </div>

      <div>
        <h2 className="mb-3 text-base font-semibold">Líderes cadastrados</h2>
        {leaders.isLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : (leaders.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum líder cadastrado.</p>
        ) : (
          <ul className="space-y-2">
            {(leaders.data ?? []).map((l) => (
              <LeaderRowItem
                key={l.user_id}
                adminPw={adminPw}
                leader={l}
                onDelete={() => {
                  void confirmDelete({
                    title: "Excluir líder?",
                    description: "O líder será removido do sistema. Esta ação não poderá ser desfeita.",
                  }).then((ok) => { if (ok) delMut.mutate(l.user_id); });
                }}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

type AdminLeaderRow = {
  user_id: string;
  leader_structure_id: string | null;
  nome: string;
  login: string;
  email: string;
  setor_id: string | null;
  setor_nome: string | null;
  supervisor_id: string | null;
  supervisor_nome: string | null;
  estrutura_normalizada: boolean;
};

/**
 * Linha de líder: mostra vínculo estrutural e permite editar (quando normalizado)
 * ou normalizar (quando legado, sem registro em `lideres_estrutura`).
 */
function LeaderRowItem({
  adminPw,
  leader,
  onDelete,
}: {
  adminPw: string;
  leader: AdminLeaderRow;
  onDelete: () => void;
}) {
  const qc = useQueryClient();
  const updateFn = useServerFn(adminUpdateLeader);
  const normalizeFn = useServerFn(adminNormalizeLeader);
  const [open, setOpen] = useState(false);
  const [nome, setNome] = useState(leader.nome);
  const [hier, setHier] = useState({
    setorId: leader.setor_id ?? "",
    supervisorId: leader.supervisor_id ?? "",
    leaderId: "",
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["admin-leaders"] });

  const saveMut = useMutation({
    mutationFn: () =>
      updateFn({
        data: {
          adminPassword: adminPw,
          leaderStructureId: leader.leader_structure_id ?? "",
          nome,
          setorId: hier.setorId,
          supervisorId: hier.supervisorId,
        },
      }),
    onSuccess: () => { toast.success("Líder atualizado"); setOpen(false); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const normalizeMut = useMutation({
    mutationFn: () =>
      normalizeFn({
        data: {
          adminPassword: adminPw,
          leaderUserId: leader.user_id,
          nome,
          setorId: hier.setorId,
          supervisorId: hier.supervisorId,
        },
      }),
    onSuccess: () => { toast.success("Líder normalizado"); setOpen(false); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const busy = saveMut.isPending || normalizeMut.isPending;
  const canSubmit = !!nome.trim() && !!hier.setorId && !!hier.supervisorId;

  return (
    <li className="rounded-xl bg-card shadow-md p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{leader.nome || leader.login}</p>
          <p className="truncate text-[11px] text-muted-foreground">Login: {leader.login}</p>
          {leader.estrutura_normalizada ? (
            <p className="truncate text-[11px] text-muted-foreground">
              {leader.setor_nome ?? "—"} · {leader.supervisor_nome ?? "—"}
            </p>
          ) : (
            <p className="text-[11px] font-medium text-destructive">
              Estrutura pendente — normalize para vincular equipes.
            </p>
          )}
          <Button
            variant="outline"
            className="mt-2 h-8 px-3 text-xs"
            onClick={() => setOpen((v) => !v)}
          >
            {open ? "Fechar" : leader.estrutura_normalizada ? "Editar" : "Normalizar"}
          </Button>
        </div>
        <button
          onClick={onDelete}
          className="rounded-md p-2 text-muted-foreground hover:text-destructive"
          aria-label="Excluir líder"
        >
          <Trash2 className="size-4" />
        </button>
      </div>

      {open && (
        <div className="mt-3 space-y-2 border-t border-border pt-3">
          <div className="space-y-1">
            <Label className="text-xs">Nome do líder</Label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} className="h-10" />
          </div>
          <HierarchyPicker
            adminPw={adminPw}
            setorId={hier.setorId}
            supervisorId={hier.supervisorId}
            leaderId=""
            requireLeader={false}
            onChange={setHier}
          />
          <Button
            className="h-10 w-full"
            disabled={busy || !canSubmit}
            onClick={() =>
              leader.estrutura_normalizada ? saveMut.mutate() : normalizeMut.mutate()
            }
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : "Salvar"}
          </Button>
        </div>
      )}
    </li>
  );
}

function GoogleFormSection({ adminPw }: { adminPw: string }) {
  const qc = useQueryClient();
  const getFn = useServerFn(adminGetGoogleFormSettings);
  const setModeFn = useServerFn(adminSetGoogleFormMode);
  const updateFn = useServerFn(adminUpdateGoogleForm);

  const q = useQuery({
    queryKey: ["admin-google-form"],
    queryFn: () => getFn({ data: { adminPassword: adminPw } }),
  });

  const [prodInput, setProdInput] = useState("");
  const [testInput, setTestInput] = useState("");

  const modeMut = useMutation({
    mutationFn: (mode: "prod" | "test") =>
      setModeFn({ data: { adminPassword: adminPw, mode } }),
    onSuccess: () => {
      toast.success("Formulário ativo atualizado");
      qc.invalidateQueries({ queryKey: ["admin-google-form"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateMut = useMutation({
    mutationFn: (v: { target: "prod" | "test"; formIdOrUrl: string }) =>
      updateFn({ data: { adminPassword: adminPw, ...v } }),
    onSuccess: (_r, v) => {
      toast.success(`Formulário ${v.target === "prod" ? "de produção" : "de teste"} atualizado`);
      if (v.target === "prod") setProdInput("");
      else setTestInput("");
      qc.invalidateQueries({ queryKey: ["admin-google-form"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (q.isLoading) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  const row = q.data as
    | { mode: "prod" | "test"; prod_form_id: string; test_form_id: string }
    | null
    | undefined;
  if (!row) return <p className="text-sm text-muted-foreground">Configuração não encontrada.</p>;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Google Forms</h2>
        <p className="text-sm text-muted-foreground">
          Escolha qual formulário recebe as respostas de negociação e cole uma nova URL/ID caso o
          formulário mude.
        </p>
      </div>

      <div className="rounded-xl border bg-card p-4">
        <Label className="text-sm font-semibold">Formulário ativo</Label>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {(["prod", "test"] as const).map((m) => {
            const on = row.mode === m;
            return (
              <button
                key={m}
                type="button"
                disabled={modeMut.isPending}
                onClick={() => modeMut.mutate(m)}
                className={
                  "rounded-xl border-2 px-3 py-3 text-sm font-medium transition-colors " +
                  (on
                    ? "border-primary bg-primary/15 text-primary"
                    : "border-border bg-card hover:border-primary/50")
                }
              >
                {m === "prod" ? "Produção (real)" : "Teste"}
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Ativo agora: <strong>{row.mode === "prod" ? "Produção" : "Teste"}</strong>
        </p>
      </div>

      {(["prod", "test"] as const).map((target) => {
        const currentId = target === "prod" ? row.prod_form_id : row.test_form_id;
        const value = target === "prod" ? prodInput : testInput;
        const setValue = target === "prod" ? setProdInput : setTestInput;
        return (
          <div key={target} className="rounded-xl border bg-card p-4 space-y-2">
            <Label className="text-sm font-semibold">
              {target === "prod" ? "Formulário de produção" : "Formulário de teste"}
            </Label>
            <p className="text-xs text-muted-foreground break-all">
              ID atual: <code>{currentId}</code>
            </p>
            <Input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="Cole a URL ou o ID do novo Google Forms"
            />
            <Button
              className="w-full"
              disabled={updateMut.isPending || !value.trim()}
              onClick={() => updateMut.mutate({ target, formIdOrUrl: value.trim() })}
            >
              {updateMut.isPending && updateMut.variables?.target === target ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                "Salvar formulário"
              )}
            </Button>
          </div>
        );
      })}
    </div>
  );
}


function AdminSideMenu({
  open,
  onOpenChange,
  currentView,
  currentSection,
  onSelectMenu,
  onSelectRanking,
  onSelectSection,
  onSignOut,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  currentView: "menu" | "section" | "ranking";
  currentSection: SectionId;
  onSelectMenu: () => void;
  onSelectRanking: () => void;
  onSelectSection: (id: SectionId) => void;
  onSignOut: () => void;
}) {
  const itemCls =
    "flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground";
  const activeCls = "bg-primary/10 text-primary";
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-background/40 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content
          className="fixed inset-y-0 left-0 z-50 flex h-dvh w-72 max-w-[80vw] flex-col overflow-hidden border-r border-border bg-card shadow-2xl transition ease-in-out duration-300 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]"
        >
          <Dialog.Title className="sr-only">Menu de administração</Dialog.Title>
          <div className="flex items-center justify-between px-4 py-4">
            <span className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Administração
            </span>
            <Dialog.Close
              aria-label="Fechar menu"
              className="inline-flex size-9 items-center justify-center rounded-lg bg-destructive text-white hover:bg-destructive/90"
            >
              <X className="size-5" />
            </Dialog.Close>
          </div>
          <nav className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <ul className="space-y-1">
              <li>
                <button
                  onClick={onSelectMenu}
                  className={itemCls + " " + (currentView === "menu" ? activeCls : "")}
                >
                  <LayoutDashboard className="size-5" />
                  <span>Início</span>
                </button>
              </li>
              <li>
                <button
                  onClick={onSelectRanking}
                  className={itemCls + " " + (currentView === "ranking" ? activeCls : "")}
                >
                  <LayoutDashboard className="size-5" />
                  <span>Painel</span>
                </button>
              </li>
              {SECTION_GROUPS.map((group) => (
                <li key={group.id} className="pt-3">
                  <div className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                    {group.label}
                  </div>
                  <ul className="space-y-1">
                    {group.items.map((id) => {
                      const info = SECTION_INFO[id];
                      const Icon = info.icon;
                      const active = currentView === "section" && currentSection === id;
                      return (
                        <li key={id}>
                          <button
                            onClick={() => onSelectSection(id)}
                            className={itemCls + " " + (active ? activeCls : "")}
                          >
                            <Icon className="size-4 shrink-0" />
                            <span className="truncate">{info.label}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </li>
              ))}
            </ul>
          </nav>
          <button
            type="button"
            onClick={onSignOut}
            className="flex w-full items-center gap-3 border-t border-border bg-destructive px-5 py-4 text-left text-sm font-semibold text-destructive-foreground transition-colors hover:bg-destructive/90"
          >
            <LogOut className="size-5" />
            <span>Sair</span>
          </button>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function TestAccountSection({ adminPw }: { adminPw: string }) {
  const qc = useQueryClient();
  const listFn = useServerFn(adminListTestTeams);
  const createFn = useServerFn(adminCreateTestTeam);
  const updateFn = useServerFn(adminUpdateTeam);
  const deleteFn = useServerFn(adminDeleteTeam);

  const list = useQuery({
    queryKey: ["admin-test-teams"],
    queryFn: () => listFn({ data: { adminPassword: adminPw } }),
  });

  const [teamName, setTeamName] = useState("");
  const [password, setPassword] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const createMut = useMutation({
    mutationFn: () => createFn({ data: { adminPassword: adminPw, teamName, password } }),
    onSuccess: () => {
      toast.success("Conta de teste criada");
      setTeamName("");
      setPassword("");
      qc.invalidateQueries({ queryKey: ["admin-test-teams"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateMut = useMutation({
    mutationFn: (v: { teamId: string; name: string }) =>
      updateFn({ data: { adminPassword: adminPw, teamId: v.teamId, teamName: v.name } }),
    onSuccess: () => {
      toast.success("Conta atualizada");
      setEditingId(null);
      qc.invalidateQueries({ queryKey: ["admin-test-teams"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (teamId: string) => deleteFn({ data: { adminPassword: adminPw, teamId } }),
    onSuccess: () => {
      toast.success("Conta de teste excluída");
      setConfirmDeleteId(null);
      qc.invalidateQueries({ queryKey: ["admin-test-teams"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold">Conta de Teste</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Contas isoladas para apresentações. Não aparecem no ranking nem influenciam a produtividade real.
        </p>
      </div>

      <div className="space-y-3 rounded-xl bg-card shadow-md p-4">
        <h3 className="text-sm font-semibold">Criar nova conta de teste</h3>
        <div className="space-y-2">
          <Label htmlFor="tt-name">Nome da equipe</Label>
          <Input
            id="tt-name"
            value={teamName}
            onChange={(e) => setTeamName(e.target.value)}
            autoCapitalize="characters"
            className="h-11 text-base"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="tt-pw">Senha (mín. 6)</Label>
          <Input
            id="tt-pw"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="h-11 text-base"
          />
        </div>
        <Button
          onClick={() => createMut.mutate()}
          disabled={createMut.isPending || !teamName.trim() || password.length < 6}
          className="h-11 w-full text-sm font-semibold"
        >
          {createMut.isPending ? <Loader2 className="size-4 animate-spin" /> : "Criar Conta de Teste"}
        </Button>
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Contas existentes</h3>
        {list.isLoading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : (list.data ?? []).length === 0 ? (
          <p className="text-xs text-muted-foreground">Nenhuma conta de teste cadastrada.</p>
        ) : (
          <ul className="space-y-2">
            {(list.data ?? []).map((t) => (
              <li
                key={t.id}
                className="flex flex-col gap-2 rounded-xl bg-card shadow-md p-3"
              >
                {editingId === t.id ? (
                  <div className="flex flex-col gap-2">
                    <Input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="h-10"
                    />
                    <div className="flex gap-2">
                      <Button
                        className="h-9 flex-1 text-xs"
                        disabled={updateMut.isPending || !editName.trim()}
                        onClick={() => updateMut.mutate({ teamId: t.id, name: editName })}
                      >
                        Salvar
                      </Button>
                      <Button
                        variant="outline"
                        className="h-9 flex-1 text-xs"
                        onClick={() => setEditingId(null)}
                      >
                        Cancelar
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{t.team_name}</p>
                      <p className="text-[10px] uppercase tracking-wider text-orange-500">
                        Conta de teste
                      </p>
                    </div>
                    <div className="flex gap-1">
                      <Button
                        variant="outline"
                        className="h-8 px-3 text-xs"
                        onClick={() => {
                          setEditingId(t.id);
                          setEditName(t.team_name);
                        }}
                      >
                        Editar
                      </Button>
                      <button
                        onClick={() => setConfirmDeleteId(t.id)}
                        className="rounded p-1.5 text-muted-foreground hover:text-destructive"
                        aria-label="Excluir"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <Dialog.Root
        open={confirmDeleteId !== null}
        onOpenChange={(o) => !o && setConfirmDeleteId(null)}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[92vw] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-card p-5 shadow-xl">
            <Dialog.Title className="text-base font-semibold">Excluir conta de teste?</Dialog.Title>
            <Dialog.Description className="mt-1 text-sm text-muted-foreground">
              Todos os dados vinculados a esta conta serão removidos.
            </Dialog.Description>
            <div className="mt-4 flex gap-2">
              <Button
                variant="outline"
                className="h-10 flex-1"
                onClick={() => setConfirmDeleteId(null)}
              >
                Cancelar
              </Button>
              <Button
                className="h-10 flex-1 bg-destructive text-destructive-foreground hover:bg-destructive/90"
                disabled={deleteMut.isPending}
                onClick={() => confirmDeleteId && deleteMut.mutate(confirmDeleteId)}
              >
                {deleteMut.isPending ? <Loader2 className="size-4 animate-spin" /> : "Excluir"}
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}

function describeUserAgent(ua: string | null): string {
  if (!ua) return "Dispositivo desconhecido";
  const s = ua;
  let os = "";
  if (/Android/i.test(s)) {
    const m = s.match(/Android\s+([\d.]+)/);
    os = `Android${m ? ` ${m[1]}` : ""}`;
  } else if (/iPhone|iPad|iPod/i.test(s)) {
    os = /iPad/i.test(s) ? "iPad" : "iPhone";
  } else if (/Windows NT/i.test(s)) os = "Windows";
  else if (/Mac OS X/i.test(s)) os = "macOS";
  else if (/Linux/i.test(s)) os = "Linux";
  let browser = "";
  if (/Edg\//.test(s)) browser = "Edge";
  else if (/Chrome\//.test(s) && !/Edg\//.test(s)) browser = "Chrome";
  else if (/Firefox\//.test(s)) browser = "Firefox";
  else if (/Safari\//.test(s) && !/Chrome\//.test(s)) browser = "Safari";
  const parts = [os, browser].filter(Boolean);
  return parts.length ? parts.join(" · ") : s.slice(0, 60);
}

function DevicesSection({ adminPw }: { adminPw: string }) {
  const qc = useQueryClient();
  const listFn = useServerFn(adminListDevices);
  const signOutFn = useServerFn(adminSignOutDevice);
  const devices = useQuery({
    queryKey: ["admin-devices"],
    queryFn: () => listFn({ data: { adminPassword: adminPw } }),
    refetchInterval: 15_000,
  });
  const signOutMut = useMutation({
    mutationFn: (userId: string) => signOutFn({ data: { adminPassword: adminPw, userId } }),
    onSuccess: () => {
      toast.success("Dispositivo deslogado.");
      qc.invalidateQueries({ queryKey: ["admin-devices"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = devices.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Dispositivos conectados</h2>
          <p className="text-xs text-muted-foreground">
            {rows.length} sessão(ões) ativa(s). Atualiza automaticamente.
          </p>
        </div>
        <Button
          variant="outline"
          className="h-9"
          onClick={() => devices.refetch()}
          disabled={devices.isFetching}
        >
          {devices.isFetching ? <Loader2 className="size-4 animate-spin" /> : "Atualizar"}
        </Button>
      </div>

      {devices.isLoading ? (
        <Loader2 className="mx-auto size-5 animate-spin text-muted-foreground" />
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          Nenhum dispositivo conectado no momento.
        </div>
      ) : (
        <ul className="space-y-2">
          {rows.map((d) => {
            const seen = new Date(d.last_seen_at);
            const mins = Math.max(0, Math.round((Date.now() - seen.getTime()) / 60000));
            const seenLabel =
              mins < 1 ? "agora" : mins < 60 ? `há ${mins} min` : `há ${Math.round(mins / 60)}h`;
            return (
              <li
                key={d.user_id + d.session_id}
                className="flex items-start justify-between gap-3 rounded-xl bg-card shadow-md p-3"
              >
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
                    <Smartphone className="size-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-foreground">
                      {d.account_label}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {describeUserAgent(d.user_agent)}
                    </div>
                    <div className="mt-0.5 text-[11px] text-muted-foreground">
                      Último sinal {seenLabel} · {formatDateBR(d.last_seen_at)}
                    </div>
                  </div>
                </div>
                <Button
                  variant="outline"
                  className="h-9 shrink-0 text-destructive hover:bg-destructive hover:text-destructive-foreground"
                  onClick={async () => {
                    if (
                      await confirmDelete({
                        description: `Deslogar "${d.account_label}"? O usuário precisará entrar de novo.`,
                      })
                    ) {
                      signOutMut.mutate(d.user_id);
                    }
                  }}
                  disabled={signOutMut.isPending}
                >
                  <LogOut className="size-4" />
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

type UpdateStatus = "atualizado" | "desatualizado" | "nunca_reportou";

function versionStatus(reported: number | null, latest: number | null): UpdateStatus {
  if (reported == null) return "nunca_reportou";
  if (latest == null) return "atualizado";
  return reported >= latest ? "atualizado" : "desatualizado";
}

const UPDATE_STATUS_INFO: Record<UpdateStatus, { label: string; className: string }> = {
  atualizado: { label: "Atualizado", className: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" },
  desatualizado: { label: "Desatualizado", className: "bg-amber-500/15 text-amber-600 dark:text-amber-400" },
  nunca_reportou: { label: "Nunca reportou", className: "bg-muted text-muted-foreground" },
};

function UpdateStatusBadge({ status }: { status: UpdateStatus }) {
  const info = UPDATE_STATUS_INFO[status];
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${info.className}`}>
      {info.label}
    </span>
  );
}

function UpdatesSection({ adminPw }: { adminPw: string }) {
  const fn = useServerFn(adminUpdatesOverview);
  const overview = useQuery({
    queryKey: ["admin-updates-overview"],
    queryFn: () => fn({ data: { adminPassword: adminPw } }),
    refetchInterval: 30_000,
  });

  const latestNative = overview.data?.latestNativeVersionCode ?? null;
  const latestWeb = overview.data?.latestWebBuildNumber ?? null;
  const teams = overview.data?.teams ?? [];

  // Pior status primeiro — quem nunca reportou ou está desatualizado precisa
  // de atenção; quem já está em dia fica no fim da lista.
  const statusRank: Record<UpdateStatus, number> = { nunca_reportou: 0, desatualizado: 1, atualizado: 2 };
  const sorted = [...teams].sort((a, b) => {
    const ra = statusRank[versionStatus(a.native_version_code, latestNative)];
    const rb = statusRank[versionStatus(b.native_version_code, latestNative)];
    if (ra !== rb) return ra - rb;
    return a.team_name.localeCompare(b.team_name);
  });

  const updatedCount = teams.filter(
    (t) => versionStatus(t.native_version_code, latestNative) === "atualizado",
  ).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Atualizações</h2>
          <p className="text-xs text-muted-foreground">
            {latestNative != null
              ? `Último APK publicado: versionCode ${latestNative}`
              : "Nenhum APK publicado ainda"}
            {latestWeb != null ? ` · último bundle web: build ${latestWeb}` : ""}
          </p>
        </div>
        <Button
          variant="outline"
          className="h-9"
          onClick={() => overview.refetch()}
          disabled={overview.isFetching}
        >
          {overview.isFetching ? <Loader2 className="size-4 animate-spin" /> : "Atualizar"}
        </Button>
      </div>

      {overview.isLoading ? (
        <Loader2 className="mx-auto size-5 animate-spin text-muted-foreground" />
      ) : teams.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          Nenhuma equipe cadastrada.
        </div>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            {updatedCount} de {teams.length} equipe(s) com o app nativo atualizado.
          </p>
          <ul className="space-y-2">
            {sorted.map((t) => {
              const nativeStatus = versionStatus(t.native_version_code, latestNative);
              return (
                <li key={t.id} className="flex items-start justify-between gap-3 rounded-xl bg-card shadow-md p-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-foreground">{t.team_name}</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      APK: {t.native_version_code ?? "—"}
                      {latestNative != null ? ` / ${latestNative}` : ""} · Bundle web: {t.web_bundle_version ?? "—"}
                      {latestWeb != null ? ` / ${latestWeb}` : ""}
                    </div>
                    <div className="mt-0.5 text-[11px] text-muted-foreground">
                      {t.version_reported_at
                        ? `Último report: ${formatDateBR(t.version_reported_at)}`
                        : "Nunca reportou versão — provável dispositivo que ainda não abriu o app após a instalação, ou está offline."}
                    </div>
                  </div>
                  <UpdateStatusBadge status={nativeStatus} />
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}

function TrashSection({ adminPw }: { adminPw: string }) {
  const qc = useQueryClient();
  const listFn = useServerFn(adminListTrashShifts);
  const restoreFn = useServerFn(adminRestoreShift);
  const purgeFn = useServerFn(adminPurgeShift);
  const trash = useQuery({
    queryKey: ["admin-trash-shifts"],
    queryFn: () => listFn({ data: { adminPassword: adminPw } }),
  });
  const restoreMut = useMutation({
    mutationFn: (shiftId: string) => restoreFn({ data: { adminPassword: adminPw, shiftId } }),
    onSuccess: () => {
      toast.success("Relatório restaurado.");
      qc.invalidateQueries({ queryKey: ["admin-trash-shifts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const purgeMut = useMutation({
    mutationFn: (shiftId: string) => purgeFn({ data: { adminPassword: adminPw, shiftId } }),
    onSuccess: () => {
      toast.success("Relatório apagado definitivamente.");
      qc.invalidateQueries({ queryKey: ["admin-trash-shifts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = trash.data ?? [];
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Lixeira — Relatórios excluídos</h2>
          <p className="text-xs text-muted-foreground">
            {rows.length} relatório(s) na lixeira. Restaurar traz de volta o expediente e todos os serviços vinculados.
          </p>
        </div>
        <Button variant="outline" className="h-9" onClick={() => trash.refetch()} disabled={trash.isFetching}>
          {trash.isFetching ? <Loader2 className="size-4 animate-spin" /> : "Atualizar"}
        </Button>
      </div>

      {trash.isLoading ? (
        <Loader2 className="mx-auto size-5 animate-spin text-muted-foreground" />
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          Nenhum relatório na lixeira.
        </div>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.id} className="flex items-start justify-between gap-3 rounded-xl bg-card shadow-md p-3">
              <div className="flex min-w-0 flex-1 items-start gap-3">
                <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
                  <Trash className="size-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-foreground">
                    {r.team_name} — {formatDateBR(r.started_at)}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {r.service_count} serviço(s) · status: {r.status}
                  </div>
                  <div className="mt-0.5 text-[11px] text-muted-foreground">
                    Excluído em {formatDateBR(r.deleted_at)}
                  </div>
                </div>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button
                  variant="outline"
                  className="h-9"
                  onClick={() => restoreMut.mutate(r.id)}
                  disabled={restoreMut.isPending}
                >
                  <RotateCcw className="size-4" />
                </Button>
                <Button
                  variant="outline"
                  className="h-9 text-destructive hover:bg-destructive hover:text-destructive-foreground"
                  onClick={async () => {
                    if (await confirmDelete({
                      description: `Apagar definitivamente o relatório de ${r.team_name} de ${formatDateBR(r.started_at)}? Esta ação é irreversível.`,
                    })) {
                      purgeMut.mutate(r.id);
                    }
                  }}
                  disabled={purgeMut.isPending}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
