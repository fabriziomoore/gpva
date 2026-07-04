export type Severity = "info" | "improvement" | "warning" | "error";
export type Category =
  | "banco"
  | "seguranca"
  | "contas"
  | "config"
  | "performance"
  | "cliente";

export type JsonValue = string | number | boolean | null | JsonValue[] | { [k: string]: JsonValue };

export type CheckResult = {
  id: string;
  category: Category;
  title: string;
  severity: Severity;
  message: string;
  evidence?: { [k: string]: JsonValue };
  location?: string;
  suggestion?: string;
};

export type AuditReport = {
  started_at: string;
  finished_at: string;
  duration_ms: number;
  overall_score: number;
  category_scores: Record<Category, number>;
  counts: { errors: number; warnings: number; improvements: number; info: number };
  results: CheckResult[];
  out_of_scope: string[];
};

export function scoreFromResults(results: CheckResult[]): {
  overall: number;
  byCategory: Record<Category, number>;
  counts: AuditReport["counts"];
} {
  const cats: Category[] = ["banco", "seguranca", "contas", "config", "performance", "cliente"];
  const byCategory = {} as Record<Category, number>;
  for (const c of cats) {
    const list = results.filter((r) => r.category === c);
    if (list.length === 0) { byCategory[c] = 100; continue; }
    let score = 100;
    for (const r of list) {
      if (r.severity === "error") score -= 20;
      else if (r.severity === "warning") score -= 8;
      else if (r.severity === "improvement") score -= 3;
    }
    byCategory[c] = Math.max(0, Math.min(100, score));
  }
  const vals = Object.values(byCategory);
  const overall = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
  const counts = {
    errors: results.filter((r) => r.severity === "error").length,
    warnings: results.filter((r) => r.severity === "warning").length,
    improvements: results.filter((r) => r.severity === "improvement").length,
    info: results.filter((r) => r.severity === "info").length,
  };
  return { overall, byCategory, counts };
}

export const CATEGORY_LABELS: Record<Category, string> = {
  banco: "Banco de Dados",
  seguranca: "Segurança",
  contas: "Contas & Acesso",
  config: "Configurações",
  performance: "Performance",
  cliente: "Cliente (Runtime)",
};

export const OUT_OF_SCOPE = [
  "Análise estática de TypeScript / ESLint",
  "Tamanho de bundle e chunks",
  "Código morto e componentes duplicados",
  "Vulnerabilidades de dependências (npm audit)",
  "Capacitor / plugins / build APK",
  "Análise visual de UX e acessibilidade automática",
  "Testes de XSS / CSRF estáticos",
];