import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Plus, Trash2, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import {
  adminAddRow,
  adminCreateTeam,
  adminDeleteRow,
  adminListRows,
  adminUpdateRate,
  adminTeamsRanking,
  listTeams,
} from "@/lib/admin.functions";
import gpvaLogo from "@/assets/gpva-logo-wide.png.asset.json";

export const Route = createFileRoute("/admin")({
  ssr: false,
  head: () => ({ meta: [{ title: "Administração — GPVA" }] }),
  component: AdminPage,
});

type SectionId =
  | "service_types"
  | "inviability_reasons"
  | "service_complements"
  | "impacts"
  | "variable"
  | "create_team";

const SECTIONS: { id: SectionId; label: string }[] = [
  { id: "service_types", label: "Cadastros" },
  { id: "inviability_reasons", label: "Motivos de Inviabilidade" },
  { id: "service_complements", label: "Complemento(s) do Serviço" },
  { id: "impacts", label: "Impactos" },
  { id: "variable", label: "Variável" },
  { id: "create_team", label: "Criar Equipe" },
];

function AdminPage() {
  const navigate = useNavigate();
  const [adminPw, setAdminPw] = useState("");
  const [pwInput, setPwInput] = useState("");
  const [section, setSection] = useState<SectionId>("service_types");
  const [view, setView] = useState<"menu" | "section" | "ranking">("menu");

  // Restore session from sessionStorage so reload doesn't lock out
  useEffect(() => {
    const stored = sessionStorage.getItem("gpva-admin-pw");
    if (stored) setAdminPw(stored);
  }, []);

  if (!adminPw) {
    return (
      <div className="relative flex min-h-screen flex-col items-center justify-center bg-background py-10">
        <div className="mb-8 w-full">
          <img src={gpvaLogo.url} alt="GPVA" className="block h-auto w-full" />
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
          <button
            type="button"
            onClick={() => navigate({ to: "/auth" })}
            className="block w-full text-center text-xs text-muted-foreground/70 hover:text-muted-foreground"
          >
            Voltar
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-background/95 px-4 py-3 backdrop-blur">
        <h1 className="text-sm font-semibold uppercase tracking-wider">Administração</h1>
      </header>

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
          <RankingSection adminPw={adminPw} onBack={() => setView("menu")} />
        </main>
      ) : (
        <main className="mx-auto max-w-2xl px-4 py-6">
          <button
            onClick={() => setView("menu")}
            className="mb-4 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" /> Voltar
          </button>
          {section === "create_team" ? (
            <CreateTeamSection adminPw={adminPw} />
          ) : section === "variable" ? (
            <VariableSection adminPw={adminPw} />
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
  table: "service_types" | "inviability_reasons" | "service_complements" | "impacts";
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

function RankingSection({ adminPw, onBack }: { adminPw: string; onBack: () => void }) {
  const fn = useServerFn(adminTeamsRanking);
  const [selected, setSelected] = useState<string | null>(null);
  const q = useQuery({
    queryKey: ["admin-ranking"],
    queryFn: () => fn({ data: { adminPassword: adminPw } }),
  });

  if (q.isLoading) {
    return <Loader2 className="mx-auto size-5 animate-spin text-muted-foreground" />;
  }

  const sorted = [...(q.data ?? [])].sort(
    (a, b) => b.viable + b.negotiations - (a.viable + a.negotiations),
  );
  const max = Math.max(1, ...sorted.map((t) => t.viable));
  const current = selected ? sorted.find((t) => t.id === selected) : null;

  if (current) {
    return (
      <div className="space-y-4">
        <button
          onClick={() => setSelected(null)}
          className="flex items-center gap-2 text-base font-semibold hover:text-primary"
        >
          <ArrowLeft className="size-4" /> {current.team_name}
        </button>
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
      <button
        onClick={onBack}
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Voltar
      </button>
      <h2 className="text-base font-semibold">Painel — Ranking de Equipes</h2>
      <div className="space-y-3">
        {sorted.map((t) => {
          const pct = Math.round((t.viable / max) * 100);
          return (
            <button
              key={t.id}
              onClick={() => setSelected(t.id)}
              className="block w-full rounded-xl border border-border bg-card p-3 text-left transition-colors hover:border-primary"
            >
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-semibold">{t.team_name}</span>
                <span className="text-xs text-muted-foreground">
                  {t.negotiations} neg.
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

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-bold">{value}</div>
    </div>
  );
}