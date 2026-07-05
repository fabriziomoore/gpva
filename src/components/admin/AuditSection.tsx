import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Trash2, Play, Copy, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  runDbAudit, runSecurityAudit, runAccountsAudit, runConfigAudit,
  saveAuditReport, listAuditReports, deleteAuditReport, getAuditReport,
  runRlsAudit, runStorageAudit, runEdgeFnAudit, runIntegrityAudit,
  runCoordsAudit, runAuthOrphansAudit,
} from "@/lib/audit/audit.functions";
import { runClientChecks } from "@/lib/audit/client-checks";
import { scoreFromResults, CATEGORY_LABELS, OUT_OF_SCOPE } from "@/lib/audit/types";
import type { AuditReport, Category, CheckResult, JsonValue } from "@/lib/audit/types";
import { buildLovablePrompt } from "@/lib/audit/prompt";

type Step = { key: string; label: string; run: () => Promise<CheckResult[]> };

export function AuditSection({ adminPw }: { adminPw: string }) {
  const qc = useQueryClient();
  const dbFn = useServerFn(runDbAudit);
  const secFn = useServerFn(runSecurityAudit);
  const accFn = useServerFn(runAccountsAudit);
  const cfgFn = useServerFn(runConfigAudit);
  const rlsFn = useServerFn(runRlsAudit);
  const storFn = useServerFn(runStorageAudit);
  const edgeFn = useServerFn(runEdgeFnAudit);
  const intFn = useServerFn(runIntegrityAudit);
  const coordFn = useServerFn(runCoordsAudit);
  const authFn = useServerFn(runAuthOrphansAudit);
  const saveFn = useServerFn(saveAuditReport);
  const listFn = useServerFn(listAuditReports);
  const delFn = useServerFn(deleteAuditReport);
  const getFn = useServerFn(getAuditReport);

  const steps: Step[] = useMemo(() => [
    { key: "cfg", label: "Verificando configurações...", run: () => cfgFn({ data: { adminPassword: adminPw } }) },
    { key: "acc", label: "Analisando contas e permissões...", run: () => accFn({ data: { adminPassword: adminPw } }) },
    { key: "sec", label: "Testando segurança...", run: () => secFn({ data: { adminPassword: adminPw } }) },
    { key: "rls", label: "Auditando RLS e grants...", run: () => rlsFn({ data: { adminPassword: adminPw } }) },
    { key: "storage", label: "Verificando storage...", run: () => storFn({ data: { adminPassword: adminPw } }) },
    { key: "edge", label: "Testando Edge Function admin-api...", run: () => edgeFn({ data: { adminPassword: adminPw } }) },
    { key: "authOrph", label: "Detectando órfãos de auth...", run: () => authFn({ data: { adminPassword: adminPw } }) },
    { key: "db", label: "Auditando banco de dados...", run: () => dbFn({ data: { adminPassword: adminPw } }) },
    { key: "intg", label: "Verificando integridade referencial...", run: () => intFn({ data: { adminPassword: adminPw } }) },
    { key: "coords", label: "Auditando coordenadas de serviços...", run: () => coordFn({ data: { adminPassword: adminPw } }) },
    { key: "cli", label: "Verificando runtime do cliente...", run: () => Promise.resolve(runClientChecks()).then((p) => p) },
  ], [adminPw, cfgFn, accFn, secFn, rlsFn, storFn, edgeFn, authFn, dbFn, intFn, coordFn]);

  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0, current: "" });
  const [report, setReport] = useState<AuditReport | null>(null);
  const [viewing, setViewing] = useState<AuditReport | null>(null);
  const [loadingView, setLoadingView] = useState<string | null>(null);

  const history = useQuery({
    queryKey: ["audit-history"],
    queryFn: () => listFn({ data: { adminPassword: adminPw } }),
  });

  async function execute() {
    setRunning(true);
    setReport(null);
    setProgress({ done: 0, total: steps.length, current: steps[0].label });
    const started = new Date();
    const all: CheckResult[] = [];
    for (let i = 0; i < steps.length; i++) {
      setProgress({ done: i, total: steps.length, current: steps[i].label });
      try {
        const rs = await steps[i].run();
        all.push(...(rs as CheckResult[]));
      } catch (e) {
        all.push({
          id: `runner.${steps[i].key}.fail`,
          category: "config",
          title: `Falha ao rodar etapa: ${steps[i].label}`,
          severity: "error",
          message: (e as Error).message,
        });
      }
    }
    const finished = new Date();
    const { overall, byCategory, counts } = scoreFromResults(all);
    const rep: AuditReport = {
      started_at: started.toISOString(),
      finished_at: finished.toISOString(),
      duration_ms: finished.getTime() - started.getTime(),
      overall_score: overall,
      category_scores: byCategory,
      counts,
      results: all,
      out_of_scope: OUT_OF_SCOPE,
    };
    setReport(rep);
    setProgress({ done: steps.length, total: steps.length, current: "Concluído" });
    setRunning(false);

    // Salvar histórico
    try {
      await saveFn({
        data: {
          adminPassword: adminPw,
          duration_ms: rep.duration_ms,
          overall_score: rep.overall_score,
          counts: rep.counts as unknown as JsonValue,
          report: rep as unknown as JsonValue,
        },
      });
      qc.invalidateQueries({ queryKey: ["audit-history"] });
    } catch (e) {
      toast.error(`Falha ao salvar histórico: ${(e as Error).message}`);
    }
  }

  const delMut = useMutation({
    mutationFn: (id: string) => delFn({ data: { adminPassword: adminPw, id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["audit-history"] }),
  });

  async function openHistory(id: string) {
    setLoadingView(id);
    try {
      const row = await getFn({ data: { adminPassword: adminPw, id } });
      setViewing(row.report as unknown as AuditReport);
    } catch (e) {
      toast.error(`Falha ao carregar: ${(e as Error).message}`);
    } finally {
      setLoadingView(null);
    }
  }

  const status = report ? statusLabel(report.overall_score) : null;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Auditoria Inteligente</h2>
        <p className="text-sm text-muted-foreground">
          Roda checagens reais no banco, configurações, contas, segurança e runtime do cliente.
        </p>
      </div>

      {/* Header status */}
      <div className="rounded-xl border bg-card p-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Status geral</div>
            <div className={`mt-1 text-2xl font-bold ${status ? status.className : "text-muted-foreground"}`}>
              {status ? status.label : "—"}
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Saúde geral</div>
            <div className="mt-1 text-3xl font-bold">{report ? `${report.overall_score}%` : "—"}</div>
          </div>
        </div>
        <Button className="mt-4 h-12 w-full text-base font-semibold" onClick={execute} disabled={running}>
          {running ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Play className="mr-2 size-4" />}
          Executar Auditoria Completa
        </Button>

        {running || report ? (
          <div className="mt-4">
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }}
              />
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {progress.done}/{progress.total} — {progress.current}
            </div>
          </div>
        ) : null}
      </div>

      {/* Relatório */}
      {report && (
        <>
          <div className="rounded-xl border bg-card p-4">
            <h3 className="mb-3 text-sm font-semibold">Notas por categoria</h3>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {(Object.keys(report.category_scores) as Category[]).map((c) => (
                <div key={c} className="rounded-lg border p-3">
                  <div className="text-xs text-muted-foreground">{CATEGORY_LABELS[c]}</div>
                  <div className="text-xl font-bold">{report.category_scores[c]}%</div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border bg-card p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold">Resultados ({report.results.length})</h3>
              <div className="text-xs text-muted-foreground">
                Erros {report.counts.errors} · Avisos {report.counts.warnings} · Melhorias {report.counts.improvements}
              </div>
            </div>
            <ul className="max-h-[420px] space-y-2 overflow-y-auto">
              {report.results.map((r) => (
                <li key={r.id} className="rounded-lg border p-3">
                  <div className="flex items-center gap-2">
                    <SevBadge sev={r.severity} />
                    <span className="text-sm font-medium">{r.title}</span>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">{r.message}</div>
                  {r.suggestion && (
                    <div className="mt-1 text-xs text-primary">→ {r.suggestion}</div>
                  )}
                  {r.location && <div className="mt-1 text-[10px] text-muted-foreground">{r.location}</div>}
                </li>
              ))}
            </ul>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={async () => {
                const prompt = buildLovablePrompt(report);
                try { await navigator.clipboard.writeText(prompt); toast.success("Prompt copiado"); }
                catch { toast.error("Falha ao copiar"); }
              }}
            >
              <Copy className="mr-2 size-4" /> Gerar Prompt de Correção
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url; a.download = `audit-${Date.now()}.json`; a.click();
                setTimeout(() => URL.revokeObjectURL(url), 3000);
              }}
            >
              <Download className="mr-2 size-4" /> Exportar JSON
            </Button>
          </div>

          <div className="rounded-xl border bg-muted/40 p-3 text-xs text-muted-foreground">
            <strong>Fora do escopo runtime:</strong> {OUT_OF_SCOPE.join(", ")}.
          </div>
        </>
      )}

      {/* Histórico */}
      <div className="rounded-xl border bg-card p-4">
        <h3 className="mb-3 text-sm font-semibold">Histórico</h3>
        {history.isLoading ? (
          <div className="flex justify-center py-4"><Loader2 className="size-4 animate-spin text-muted-foreground" /></div>
        ) : !history.data || history.data.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nenhuma auditoria salva ainda.</p>
        ) : (
          <ul className="space-y-1">
            {history.data.map((h) => {
              const c = (h.counts ?? {}) as { errors?: number; warnings?: number; improvements?: number };
              return (
                <li key={h.id} className="flex items-center justify-between rounded-lg border p-2 text-sm">
                  <button
                    type="button"
                    className="flex-1 text-left hover:opacity-80"
                    onClick={() => openHistory(h.id)}
                    disabled={loadingView === h.id}
                  >
                    <div className="font-medium">
                      {new Date(h.created_at).toLocaleString("pt-BR")} — {h.overall_score}%
                      {loadingView === h.id && <Loader2 className="ml-2 inline size-3 animate-spin" />}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {(h.duration_ms / 1000).toFixed(1)}s · Erros {c.errors ?? 0} · Avisos {c.warnings ?? 0} · Melhorias {c.improvements ?? 0}
                    </div>
                  </button>
                  <button
                    className="rounded-md p-2 text-muted-foreground hover:text-destructive"
                    onClick={async () => {
                      const { confirmDelete } = await import("@/components/ui/confirm-dialog");
                      if (await confirmDelete({ title: "Excluir auditoria?", description: "Este registro de auditoria será removido permanentemente." })) {
                        delMut.mutate(h.id);
                      }
                    }}
                    aria-label="Excluir"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="max-h-screen h-screen sm:h-screen sm:max-h-screen max-w-2xl overflow-y-auto rounded-none sm:rounded-none [&>button]:bg-destructive [&>button]:text-white [&>button]:opacity-100 [&>button]:rounded-md [&>button]:p-1.5 [&>button]:hover:bg-destructive/90">
          <DialogHeader>
            <DialogTitle>Relatório de Auditoria</DialogTitle>
            {viewing && (
              <DialogDescription>
                {new Date(viewing.started_at).toLocaleString("pt-BR")} — {viewing.overall_score}% ·
                {" "}Erros {viewing.counts.errors} · Avisos {viewing.counts.warnings} · Melhorias {viewing.counts.improvements}
              </DialogDescription>
            )}
          </DialogHeader>
          {viewing && (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    const prompt = buildLovablePrompt(viewing);
                    try { await navigator.clipboard.writeText(prompt); toast.success("Prompt copiado"); }
                    catch { toast.error("Falha ao copiar"); }
                  }}
                >
                  <Copy className="mr-2 size-4" /> Gerar Prompt de Correção
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const blob = new Blob([JSON.stringify(viewing, null, 2)], { type: "application/json" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url; a.download = `audit-${Date.now()}.json`; a.click();
                    setTimeout(() => URL.revokeObjectURL(url), 3000);
                  }}
                >
                  <Download className="mr-2 size-4" /> Exportar JSON
                </Button>
              </div>
              <ul className="space-y-2">
                {viewing.results.map((r) => (
                  <li key={r.id} className="rounded-lg border p-3">
                    <div className="flex items-center gap-2">
                      <SevBadge sev={r.severity} />
                      <span className="text-sm font-medium">{r.title}</span>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">{r.message}</div>
                    {r.suggestion && <div className="mt-1 text-xs text-primary">→ {r.suggestion}</div>}
                    {r.location && <div className="mt-1 text-[10px] text-muted-foreground">{r.location}</div>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function statusLabel(score: number): { label: string; className: string } {
  if (score >= 90) return { label: "Saudável", className: "text-emerald-500" };
  if (score >= 70) return { label: "Atenção", className: "text-amber-500" };
  return { label: "Crítico", className: "text-destructive" };
}

function SevBadge({ sev }: { sev: CheckResult["severity"] }) {
  const map = {
    error: { label: "✖ Erro", cls: "bg-destructive/15 text-destructive" },
    warning: { label: "⚠ Aviso", cls: "bg-amber-500/15 text-amber-600" },
    improvement: { label: "◆ Melhoria", cls: "bg-blue-500/15 text-blue-600" },
    info: { label: "✔ OK", cls: "bg-emerald-500/15 text-emerald-600" },
  } as const;
  const m = map[sev];
  return <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold ${m.cls}`}>{m.label}</span>;
}
