import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Plus, Trash2, LogOut } from "lucide-react";
import { toast } from "sonner";
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
  adminListShifts,
  adminDeleteShift,
  adminUpdateShiftReport,
  listTeams,
  adminCreateLeader,
  adminListLeaders,
  adminDeleteLeader,
} from "@/lib/admin.functions";
import { Textarea } from "@/components/ui/textarea";
import { formatDateBR } from "@/lib/format";
import gpvaLogo from "@/assets/gpva-logo-wide.png";

export const Route = createFileRoute("/admin")({
  ssr: false,
  head: () => ({ meta: [{ title: "Administração — GPVA" }] }),
  component: AdminPage,
});

type SectionId =
  | "tipos_servico"
  | "motivos_inviabilidade"
  | "complementos_servico"
  | "impactos"
  | "variable"
  | "create_team"
  | "leaders";

const SECTIONS: { id: SectionId; label: string }[] = [
  { id: "tipos_servico", label: "Serviços" },
  { id: "motivos_inviabilidade", label: "Motivos de Inviabilidade" },
  { id: "complementos_servico", label: "Complemento(s) do Serviço" },
  { id: "impactos", label: "Impactos" },
  { id: "variable", label: "Variável" },
  { id: "create_team", label: "Criar Equipe" },
  { id: "leaders", label: "Líderes" },
];

function AdminPage() {
  const navigate = useNavigate();
  const [adminPw, setAdminPw] = useState("");
  const [pwInput, setPwInput] = useState("");
  const [section, setSection] = useState<SectionId>("tipos_servico");
  const [view, setView] = useState<"menu" | "section" | "ranking">("menu");
  const [exitOpen, setExitOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !adminPw) return;
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
  }, [adminPw, view]);

  function confirmExit() {
    setExitOpen(false);
    sessionStorage.removeItem("gpva-admin-pw");
    navigate({ to: "/auth" });
  }

  // Restore session from sessionStorage so reload doesn't lock out
  useEffect(() => {
    const stored = sessionStorage.getItem("gpva-admin-pw");
    if (stored) setAdminPw(stored);
  }, []);

  if (!adminPw) {
    return (
      <div className="relative flex min-h-screen flex-col items-center justify-center bg-background py-10">
        <div className="mb-8 w-full max-w-sm px-4">
          <div className="overflow-hidden rounded-2xl bg-[oklch(0.16_0.018_250)]">
            <img src={gpvaLogo} alt="GPVA" className="block h-auto w-full" />
          </div>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (pwInput === "137889") {
              sessionStorage.setItem("gpva-admin-pw", pwInput);
              setAdminPw(pwInput);
              setPwInput("");
            } else {
              toast.error("Senha de administrador incorreta.");
            }
          }}
          className="w-full max-w-sm space-y-4 px-4"
        >
          <Label htmlFor="adm">Senha de administrador</Label>
          <Input
            id="adm"
            type="password"
            value={pwInput}
            onChange={(e) => setPwInput(e.target.value)}
            autoFocus
            className="h-12 text-base"
          />
          <Button type="submit" className="h-12 w-full text-base font-semibold">
            Acessar
          </Button>
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-background/95 px-4 py-3 backdrop-blur">
        <h1 className="text-sm font-semibold uppercase tracking-wider">Administração</h1>
        <button
          onClick={() => {
            sessionStorage.removeItem("gpva-admin-pw");
            navigate({ to: "/auth" });
          }}
          className="rounded-md p-2 text-muted-foreground hover:text-foreground"
          aria-label="Sair"
        >
          <LogOut className="size-5" />
        </button>
      </header>
      <ExitConfirmDialog open={exitOpen} onOpenChange={setExitOpen} onConfirm={confirmExit} />

      {view === "menu" ? (
        <main className="mx-auto flex max-w-3xl flex-col items-center px-4 py-10">
          <Button
            onClick={() => setView("ranking")}
            className="mb-6 h-10 w-full"
          >
            Painel
          </Button>
          <div className="grid w-full grid-cols-2 gap-4 sm:grid-cols-3">
            {SECTIONS.map((s) => (
              <button
                key={s.id}
                onClick={() => {
                  setSection(s.id);
                  setView("section");
                }}
                className="group flex aspect-[4/3] flex-col items-center justify-center rounded-2xl border border-border bg-card p-4 text-center shadow-md transition-all hover:-translate-y-1 hover:border-primary hover:shadow-xl"
              >
                <span className="text-sm font-semibold text-foreground group-hover:text-primary">
                  {s.label}
                </span>
              </button>
            ))}
          </div>
        </main>
      ) : view === "ranking" ? (
        <main className="mx-auto max-w-2xl px-4 py-6">
          <RankingSection adminPw={adminPw} />
        </main>
      ) : (
        <main className="mx-auto max-w-2xl px-4 py-6">
          {section === "create_team" ? (
            <CreateTeamSection adminPw={adminPw} />
          ) : section === "variable" ? (
            <VariableSection adminPw={adminPw} />
          ) : section === "leaders" ? (
            <LeadersSection adminPw={adminPw} />
          ) : (
            <CrudSection
              adminPw={adminPw}
              table={section}
              label={SECTIONS.find((s) => s.id === section)!.label}
            />
          )}
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
                  className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2"
                >
                  <span className="text-sm">{r.name}</span>
                  <button
                    onClick={() => delMut.mutate(r.id)}
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

function CreateTeamSection({ adminPw }: { adminPw: string }) {
  const qc = useQueryClient();
  const [teamName, setTeamName] = useState("");
  const [password, setPassword] = useState("");
  const createFn = useServerFn(adminCreateTeam);

  const mut = useMutation({
    mutationFn: () =>
      createFn({ data: { adminPassword: adminPw, teamName, password } }),
    onSuccess: () => {
      toast.success("Equipe criada");
      setTeamName("");
      setPassword("");
      qc.invalidateQueries({ queryKey: ["admin-teams"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-5">
      <h2 className="text-base font-semibold">Criar Equipe</h2>
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
      <Button
        onClick={() => mut.mutate()}
        disabled={mut.isPending || !teamName.trim() || password.length < 6}
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
  const q = useQuery({
    queryKey: ["admin-ranking", year, month],
    queryFn: () => fn({ data: { adminPassword: adminPw, year, month } }),
  });

  if (q.isLoading) {
    return <Loader2 className="mx-auto size-5 animate-spin text-muted-foreground" />;
  }

  const sorted = [...(q.data ?? [])].sort(
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

  const periodSelector = (withDay: boolean) => (
    <div className="flex gap-2">
      {withDay && (
        <select
          value={day}
          onChange={(e) => setDay(Number(e.target.value))}
          className="h-10 w-20 rounded-lg border border-border bg-card px-3 text-sm"
        >
          {days.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
      )}
      <select
        value={month}
        onChange={(e) => setMonth(Number(e.target.value))}
        className="h-10 flex-1 rounded-lg border border-border bg-card px-3 text-sm"
      >
        {monthNames.map((n, i) => (
          <option key={i} value={i + 1}>{n}</option>
        ))}
      </select>
      <select
        value={year}
        onChange={(e) => setYear(Number(e.target.value))}
        className="h-10 w-28 rounded-lg border border-border bg-card px-3 text-sm"
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
        <TeamHeader adminPw={adminPw} team={teamFull ?? { id: current.id, team_name: current.team_name, photo_url: null, collaborator1: null, collaborator2: null, variable_rate: 0 }} onDeleted={() => setSelected(null)} />
        {periodSelector(true)}
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
                  className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2 text-sm"
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
      <h2 className="text-base font-semibold">Ranking de Equipes</h2>
      {periodSelector(false)}
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
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  const updateMut = useMutation({
    mutationFn: () =>
      updateFn({
        data: {
          adminPassword: adminPw,
          teamId: team.id,
          teamName: name,
          collaborator1: c1.trim() || null,
          collaborator2: c2.trim() || null,
        },
      }),
    onSuccess: () => {
      toast.success("Equipe atualizada");
      setEditing(false);
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
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-3">
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
          <div className="flex gap-2 pt-1">
            <Button variant="outline" className="h-10 flex-1" onClick={() => setEditing(false)}>
              Cancelar
            </Button>
            <Button
              className="h-10 flex-1"
              disabled={updateMut.isPending || !name.trim()}
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
              <div key={r.id} className="rounded-xl border border-border bg-card p-3">
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
                        if (window.confirm("Excluir este relatório e todos os serviços/impactos vinculados?")) {
                          delMut.mutate(r.id);
                        }
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
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-bold">{value}</div>
    </div>
  );
}

function LeadersSection({ adminPw }: { adminPw: string }) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const listFn = useServerFn(adminListLeaders);
  const createFn = useServerFn(adminCreateLeader);
  const delFn = useServerFn(adminDeleteLeader);

  const leaders = useQuery({
    queryKey: ["admin-leaders"],
    queryFn: () => listFn({ data: { adminPassword: adminPw } }),
  });

  const createMut = useMutation({
    mutationFn: () =>
      createFn({ data: { adminPassword: adminPw, leaderName: name, password } }),
    onSuccess: (res) => {
      setName("");
      setPassword("");
      toast.success(`Líder criado. Login: ${res.login}`);
      qc.invalidateQueries({ queryKey: ["admin-leaders"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delMut = useMutation({
    mutationFn: (leaderId: string) =>
      delFn({ data: { adminPassword: adminPw, leaderId } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-leaders"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="mb-3 text-base font-semibold">Novo líder</h2>
        <p className="mb-3 text-xs text-muted-foreground">
          O líder acessa o app com um usuário próprio e vê os dados de todas as equipes,
          sem interferir na operação delas.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim() || password.length < 6) {
              toast.error("Nome e senha (mín. 6) são obrigatórios.");
              return;
            }
            createMut.mutate();
          }}
          className="space-y-2"
        >
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
              <li
                key={l.id}
                className="flex items-center justify-between rounded-xl border border-border bg-card p-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {l.display_name || l.login}
                  </p>
                  <p className="truncate text-[11px] text-muted-foreground">Login: {l.login}</p>
                </div>
                <button
                  onClick={() => {
                    if (confirm("Excluir este líder?")) delMut.mutate(l.id);
                  }}
                  className="rounded-md p-2 text-muted-foreground hover:text-destructive"
                  aria-label="Excluir líder"
                >
                  <Trash2 className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

