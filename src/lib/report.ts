import { formatBRL, formatDateBR, pad2 } from "./format";

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
  lines.push(`*Supervisor: ${s.supervisor || "-"}*`);
  lines.push(`*Líder: ${s.leader || "-"}*`);
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