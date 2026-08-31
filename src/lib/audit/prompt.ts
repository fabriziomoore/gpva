import type { AuditReport, CheckResult } from "./types";
import { CATEGORY_LABELS } from "./types";

function priority(sev: CheckResult["severity"]): string {
  if (sev === "error") return "Crítica";
  if (sev === "warning") return "Alta";
  if (sev === "improvement") return "Média";
  return "Baixa";
}

export function buildFixPrompt(report: AuditReport): string {
  const problems = report.results.filter((r) => r.severity === "error" || r.severity === "warning" || r.severity === "improvement");
  if (problems.length === 0) return "Nenhum problema encontrado — nada a corrigir.";

  const lines: string[] = [];
  lines.push("# Correções sugeridas pela Auditoria Inteligente ACP");
  lines.push("");
  lines.push(`Auditoria em ${new Date(report.finished_at).toLocaleString("pt-BR")} — Saúde geral: **${report.overall_score}%**`);
  lines.push(`Erros: ${report.counts.errors} · Avisos: ${report.counts.warnings} · Melhorias: ${report.counts.improvements}`);
  lines.push("");
  lines.push("## Problemas priorizados");
  lines.push("");

  const ordered = [...problems].sort((a, b) => {
    const rank = { error: 0, warning: 1, improvement: 2, info: 3 } as const;
    return rank[a.severity] - rank[b.severity];
  });

  for (const p of ordered) {
    lines.push(`### [${priority(p.severity)}] ${p.title}`);
    lines.push(`- **Categoria:** ${CATEGORY_LABELS[p.category]}`);
    if (p.location) lines.push(`- **Local:** \`${p.location}\``);
    lines.push(`- **Diagnóstico:** ${p.message}`);
    if (p.evidence) lines.push(`- **Evidência:** \`${JSON.stringify(p.evidence)}\``);
    lines.push(`- **Causa provável:** ${inferCause(p)}`);
    lines.push(`- **Correção sugerida:** ${p.suggestion ?? "Investigar e corrigir de acordo com o diagnóstico."}`);
    lines.push(`- **Critério de validação:** re-executar a Auditoria Inteligente; o check \`${p.id}\` deve ficar verde.`);
    lines.push("");
  }

  lines.push("## Instruções de Correção");
  lines.push("Aplicar as correções acima em ordem de prioridade (Crítica → Alta → Média). Após cada correção, rodar novamente a Auditoria Inteligente na página `/admin` para validar.");
  return lines.join("\n");
}

function inferCause(p: CheckResult): string {
  if (p.id.startsWith("db.orphans")) return "Falta ON DELETE CASCADE ou limpeza órfã após exclusão de registros pais.";
  if (p.id.startsWith("sec.secret")) return "Segredo não configurado nas variáveis do backend.";
  if (p.id.startsWith("cfg.form")) return "Configuração do Google Forms incompleta ou modo inválido.";
  if (p.id === "db.connection") return "Latência ou instabilidade no banco de dados gerenciado.";
  if (p.id.startsWith("cli.perf")) return "Bundle grande, muitos re-renders ou operações síncronas pesadas.";
  if (p.id === "acc.admins") return "Nenhum registro em user_roles com role='admin'.";
  return "Ver diagnóstico e evidência acima.";
}