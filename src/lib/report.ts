import { formatBRL, formatDateBR, pad2 } from "./format";
import type { Period } from "./analytics";
import { deltaPct, previousLabel, projectionLabel } from "./analytics";

type ServiceRow = {
  service_type_name: string;
  is_negotiation: boolean;
  viable: boolean;
  reason_name: string | null;
  registration_number: string | null;
  negotiated_value: number | null;
};

type ShiftInput = {
  started_at: string;
  team_name: string;
  supervisor: string;
  leader: string;
  services: ServiceRow[];
  impacts: { impact_name: string }[];
  complements?: { complement_name: string }[];
};

export function buildReport(s: ShiftInput): string {
  const total = s.services.length;
  const viaveis = s.services.filter((x) => x.viable).length;
  const inviaveis = s.services.filter((x) => !x.viable).length;

  // Apenas serviços VIÁVEIS contam por tipo de serviço
  const byType = new Map<string, number>();
  for (const sv of s.services.filter((x) => x.viable)) {
    byType.set(sv.service_type_name, (byType.get(sv.service_type_name) ?? 0) + 1);
  }

  const totalNegociado = s.services
    .filter((x) => x.is_negotiation && x.viable)
    .reduce((acc, x) => acc + (Number(x.negotiated_value) || 0), 0);
  const qtdNegociacoes = s.services.filter((x) => x.is_negotiation && x.viable).length;

  const inviaveisList = s.services.filter((x) => !x.viable);

  const complementCounts = new Map<string, number>();
  for (const c of s.complements ?? []) {
    complementCounts.set(c.complement_name, (complementCounts.get(c.complement_name) ?? 0) + 1);
  }

  const lines: string[] = [];
  lines.push(`*Data: ${formatDateBR(s.started_at)}*`);
  lines.push(`*Equipe: ${s.team_name}*`);
  lines.push(`*Supervisor: ${(s.supervisor || "-").trim()}*`);
  lines.push(`*Líder: ${(s.leader || "-").trim()}*`);
  lines.push("");
  lines.push(`*Total de Serviços:* ${pad2(total)}`);
  lines.push(`*Viáveis:* ${pad2(viaveis)}`);
  lines.push(`*Inviáveis:* ${pad2(inviaveis)}`);
  lines.push("");
  for (const [name, count] of byType) {
    lines.push(`*${name}:* ${pad2(count)}`);
  }
  if (qtdNegociacoes > 0) {
    lines.push(`*Total Negociado:* ${formatBRL(totalNegociado)}`);
  }

  if (complementCounts.size > 0) {
    lines.push("");
    lines.push(`*Complemento(s) do Serviço:*`);
    for (const [name, count] of complementCounts) {
      lines.push(`${name}: ${pad2(count)}`);
    }
  }

  if (inviaveisList.length > 0) {
    lines.push("");
    lines.push(`*Inviáveis:*`);
    for (const inv of inviaveisList) {
      lines.push(`${inv.registration_number ?? "-"} - ${inv.reason_name ?? "-"}`);
    }
  }

  if (s.impacts.length > 0) {
    lines.push("");
    lines.push(`*Impacto do dia:*`);
    for (const imp of s.impacts) {
      lines.push(imp.impact_name);
    }
  }

  return lines.join("\n");
}

type PeriodReportInput = {
  period: Period;
  team_name: string;
  leader: string;
  supervisor: string;
  current: {
    total: number;
    viable: number;
    unviable: number;
    negotiations: number;
    negotiated_value: number;
    shifts: number;
  };
  previous: {
    total: number;
    viable: number;
    unviable: number;
    negotiations: number;
    negotiated_value: number;
  };
  projected: {
    total: number;
    negotiated_value: number;
  };
  variable_estimated: number;
  by_type: { name: string; qty: number }[];
  top_reasons: { name: string; qty: number }[];
  top_impacts: { name: string; qty: number }[];
  top_complements: { name: string; qty: number }[];
  best_day?: { date: string; qty: number } | null;
};

function periodTitle(p: Period): string {
  return p === "day" ? "HOJE" : p === "week" ? "SEMANA" : p === "month" ? "MÊS" : "ANO";
}

function fmtDelta(cur: number, prev: number): string {
  const d = deltaPct(cur, prev);
  if (d === null) return "—";
  const arrow = d > 0 ? "▲" : d < 0 ? "▼" : "▬";
  const sign = d > 0 ? "+" : "";
  return `${arrow} ${sign}${d}%`;
}

export function buildPeriodReport(s: PeriodReportInput): string {
  const lines: string[] = [];
  lines.push(`*RESUMO — ${periodTitle(s.period)}*`);
  lines.push(`*Equipe:* ${s.team_name}`);
  lines.push(`*Líder:* ${(s.leader || "-").trim()}   *Supervisor:* ${(s.supervisor || "-").trim()}`);
  lines.push(`*Gerado em:* ${formatDateBR(new Date())}`);
  lines.push("");
  lines.push(`*Expedientes:* ${pad2(s.current.shifts)}`);
  lines.push(
    `*Total de Serviços:* ${pad2(s.current.total)}  (${fmtDelta(s.current.total, s.previous.total)} vs ${previousLabel(s.period)})`,
  );
  const pctV = s.current.total ? Math.round((s.current.viable / s.current.total) * 100) : 0;
  const pctVPrev = s.previous.total ? Math.round((s.previous.viable / s.previous.total) * 100) : 0;
  lines.push(
    `*Viáveis:* ${pad2(s.current.viable)} (${pctV}%)  (${fmtDelta(pctV, pctVPrev)})`,
  );
  lines.push(
    `*Inviáveis:* ${pad2(s.current.unviable)}  (${fmtDelta(s.current.unviable, s.previous.unviable)})`,
  );
  lines.push(
    `*Negociações:* ${pad2(s.current.negotiations)}  (${fmtDelta(s.current.negotiations, s.previous.negotiations)})`,
  );
  lines.push(
    `*Total Negociado:* ${formatBRL(s.current.negotiated_value)}  (${fmtDelta(s.current.negotiated_value, s.previous.negotiated_value)})`,
  );
  lines.push(`*Variável estimada:* ${formatBRL(s.variable_estimated)}`);

  if (s.period !== "day") {
    lines.push("");
    lines.push(`*${projectionLabel(s.period)}:*`);
    lines.push(`Serviços projetados: ${s.projected.total}`);
    lines.push(`Negociado projetado: ${formatBRL(s.projected.negotiated_value)}`);
    const diff = s.projected.total - s.previous.total;
    const sign = diff > 0 ? "+" : "";
    lines.push(
      `Comparado ao ${previousLabel(s.period)} (${s.previous.total}): ${sign}${diff}`,
    );
  }

  if (s.best_day) {
    lines.push("");
    lines.push(`*Melhor dia:* ${s.best_day.date} — ${s.best_day.qty} viáveis`);
  }

  if (s.by_type.length > 0) {
    lines.push("");
    lines.push(`*Top serviços (viáveis):*`);
    for (const t of s.by_type.slice(0, 5)) lines.push(`${t.name}: ${pad2(t.qty)}`);
  }

  if (s.top_reasons.length > 0) {
    lines.push("");
    lines.push(`*Top motivos de inviabilidade:*`);
    for (const t of s.top_reasons.slice(0, 5)) lines.push(`${t.name}: ${pad2(t.qty)}`);
  }

  if (s.top_complements.length > 0) {
    lines.push("");
    lines.push(`*Complementos mais usados:*`);
    for (const t of s.top_complements.slice(0, 5)) lines.push(`${t.name}: ${pad2(t.qty)}`);
  }

  if (s.top_impacts.length > 0) {
    lines.push("");
    lines.push(`*Impactos recorrentes:*`);
    for (const t of s.top_impacts.slice(0, 5)) lines.push(`${t.name}: ${pad2(t.qty)}`);
  }

  return lines.join("\n");
}