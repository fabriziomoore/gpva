import { formatBRL, formatDateBR } from "./format";
import {
  type Period,
  deltaPct,
  periodLabel,
  previousLabel,
  projectionLabel,
} from "./analytics";

export type PeriodAgg = {
  total: number;
  viable: number;
  unviable: number;
  negotiations: number;
  negotiated_value: number;
  shifts: number;
};

export type TeamBreakdown = {
  team_name: string;
  leader: string;
  supervisor: string;
  current: PeriodAgg;
  previous: PeriodAgg;
  variable_estimated: number;
};

export type LeaderPdfInput = {
  period: Period;
  scope_label: string;
  leader: string;
  supervisor: string;
  current: PeriodAgg;
  previous: PeriodAgg;
  projected: { total: number; negotiated_value: number };
  variable_estimated: number;
  by_type: { name: string; qty: number }[];
  top_reasons: { name: string; qty: number }[];
  top_impacts: { name: string; qty: number }[];
  top_complements: { name: string; qty: number }[];
  best_day: { date: string; qty: number } | null;
  teams: TeamBreakdown[];
  compare_bars?: { name: string; atual: number; anterior: number }[];
  evolution?: { date: string; qty: number }[];
  company?: string;
  generated_by?: string;
  collaborators_count?: number | null;
};

function periodTitle(p: Period): string {
  return p === "day" ? "Dia" : p === "week" ? "Semana" : p === "month" ? "Mês" : "Ano";
}

function periodPeriodLabel(p: Period, ref: Date = new Date()): string {
  const months = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
  ];
  if (p === "day") return ref.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
  if (p === "week") return `Semana de ${ref.toLocaleDateString("pt-BR", { day: "2-digit", month: "long" })}`;
  if (p === "month") return `${months[ref.getMonth()]} de ${ref.getFullYear()}`;
  return `Ano de ${ref.getFullYear()}`;
}

// Cor helpers ----------------------------------------------------------------
type RGB = [number, number, number];
const C = {
  ink: [15, 23, 42] as RGB,
  sub: [71, 85, 105] as RGB,
  muted: [100, 116, 139] as RGB,
  soft: [148, 163, 184] as RGB,
  border: [226, 232, 240] as RGB,
  bgAlt: [248, 250, 252] as RGB,
  bgHead: [241, 245, 249] as RGB,
  primary: [37, 99, 235] as RGB,
  primaryDark: [30, 58, 138] as RGB,
  success: [22, 101, 52] as RGB,
  successBg: [220, 252, 231] as RGB,
  danger: [153, 27, 27] as RGB,
  dangerBg: [254, 226, 226] as RGB,
  white: [255, 255, 255] as RGB,
};

export async function renderLeaderPdfBlob(input: LeaderPdfInput): Promise<Blob> {
  const { default: jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const PW = 297;
  const PH = 210;
  const M = 15;
  const CW = PW - M * 2; // 267
  const now = new Date();
  const company = input.company ?? "GPVA";
  const generatedBy = input.generated_by ?? input.leader ?? "-";
  const periodStr = periodPeriodLabel(input.period, now);

  // Low-level helpers --------------------------------------------------------
  const setFill = (c: RGB) => pdf.setFillColor(c[0], c[1], c[2]);
  const setStroke = (c: RGB) => pdf.setDrawColor(c[0], c[1], c[2]);
  const setText = (c: RGB) => pdf.setTextColor(c[0], c[1], c[2]);
  const font = (size: number, weight: "normal" | "bold" = "normal") => {
    pdf.setFont("helvetica", weight);
    pdf.setFontSize(size);
  };
  const text = (
    value: string | number,
    x: number,
    y: number,
    opts?: { align?: "left" | "center" | "right"; maxWidth?: number },
  ) => {
    const str = String(value ?? "-");
    const out = opts?.maxWidth ? fit(str, opts.maxWidth) : str;
    pdf.text(out, x, y, { align: opts?.align ?? "left", baseline: "alphabetic" });
  };
  const fit = (str: string, maxW: number): string => {
    if (pdf.getTextWidth(str) <= maxW) return str;
    let out = str;
    while (out.length > 1 && pdf.getTextWidth(`${out}…`) > maxW) out = out.slice(0, -1);
    return `${out}…`;
  };
  const rect = (x: number, y: number, w: number, h: number, r = 1.5, filled = true, stroked = true) => {
    pdf.roundedRect(x, y, w, h, r, r, filled && stroked ? "FD" : filled ? "F" : "S");
  };
  const hline = (x1: number, y1: number, x2: number, y2: number, w = 0.3) => {
    pdf.setLineWidth(w);
    pdf.line(x1, y1, x2, y2);
  };
  const wrap = (str: string, maxW: number, lineH: number, x: number, y: number, maxLines?: number): number => {
    const lines = pdf.splitTextToSize(str, maxW) as string[];
    const use = maxLines ? lines.slice(0, maxLines) : lines;
    use.forEach((l, i) => pdf.text(l, x, y + i * lineH));
    return use.length * lineH;
  };
  const delta = (cur: number, prev: number) => {
    const d = deltaPct(cur, prev);
    if (d === null) return { label: "—", tone: "neutral" as const, value: 0 };
    return {
      label: `${d > 0 ? "+" : ""}${d}%`,
      tone: d > 0 ? ("up" as const) : d < 0 ? ("down" as const) : ("flat" as const),
      value: d,
    };
  };
  const deltaPill = (d: ReturnType<typeof delta>, x: number, y: number) => {
    const label = d.tone === "up" ? `▲ ${d.label}` : d.tone === "down" ? `▼ ${d.label}` : d.label;
    font(7.5, "bold");
    const tw = pdf.getTextWidth(label);
    const pw = tw + 4;
    const ph = 4.2;
    if (d.tone === "up") { setFill(C.successBg); setText(C.success); }
    else if (d.tone === "down") { setFill(C.dangerBg); setText(C.danger); }
    else { setFill(C.bgHead); setText(C.sub); }
    pdf.roundedRect(x, y - ph + 0.9, pw, ph, 1.5, 1.5, "F");
    pdf.text(label, x + pw / 2, y, { align: "center", baseline: "alphabetic" });
    return pw;
  };
  const footer = (pageNumber: number, totalPages: number) => {
    setStroke(C.border); hline(M, PH - 9, PW - M, PH - 9, 0.2);
    font(7, "normal"); setText(C.soft);
    text(`${company} · Painel do Líder`, M, PH - 5);
    text(formatDateBR(now), PW / 2, PH - 5, { align: "center" });
    text(`Página ${pageNumber} de ${totalPages}`, PW - M, PH - 5, { align: "right" });
  };

  const pctV = input.current.total ? Math.round((input.current.viable / input.current.total) * 100) : 0;
  const pctVPrev = input.previous.total ? Math.round((input.previous.viable / input.previous.total) * 100) : 0;
  const avgPerShift = input.current.shifts ? +(input.current.total / input.current.shifts).toFixed(1) : 0;
  const avgPerShiftPrev = input.previous.shifts ? +(input.previous.total / input.previous.shifts).toFixed(1) : 0;

  // =========================================================================
  // PAGE 1 — Cabeçalho, KPIs, Projeção, Gráficos
  // =========================================================================
  // Header (15% ~ 31mm)
  const headerBottom = M + 26;

  // Logotipo box
  setFill(C.primary); setStroke(C.primary);
  pdf.roundedRect(M, M, 22, 22, 2, 2, "F");
  font(11, "bold"); setText(C.white);
  text(company.slice(0, 3).toUpperCase(), M + 11, M + 14, { align: "center" });

  // Título e período
  font(14, "bold"); setText(C.ink);
  text("RELATÓRIO EXECUTIVO DE PRODUÇÃO", M + 26, M + 8);
  font(9, "normal"); setText(C.sub);
  text(`Período analisado: ${periodStr}`, M + 26, M + 14);
  font(8, "normal"); setText(C.muted);
  text(`Comparativo vs ${previousLabel(input.period)} · Escopo: ${input.scope_label}`, M + 26, M + 19);

  // Centro: metadados
  const centerX = M + 118;
  const kvRows: [string, string][] = [
    ["Empresa:", company],
    ["Supervisor:", input.supervisor || "-"],
    ["Escopo:", input.scope_label],
    ["Período:", periodTitle(input.period)],
    ["Gerado em:", formatDateBR(now)],
    ["Gerado por:", generatedBy],
  ];
  kvRows.forEach((row, i) => {
    const col = i % 2;
    const line = Math.floor(i / 2);
    const x = centerX + col * 62;
    const y = M + 6 + line * 6;
    font(7.5, "bold"); setText(C.muted); text(row[0], x, y);
    font(8.5, "normal"); setText(C.ink); text(row[1], x + 22, y, { maxWidth: 38 });
  });

  // Caixa destaque à direita
  const boxX = PW - M - 55;
  setFill(C.bgAlt); setStroke(C.border);
  pdf.roundedRect(boxX, M, 55, 26, 2, 2, "FD");
  const teamsCount = input.teams.length || 1;
  const collabs = input.collaborators_count ?? null;
  const infos: [string, string][] = [
    ["Equipes", String(teamsCount)],
    ["Colaboradores", collabs !== null ? String(collabs) : "—"],
    ["Expedientes", String(input.current.shifts)],
  ];
  infos.forEach((row, i) => {
    const y = M + 8 + i * 7;
    font(7.5, "normal"); setText(C.muted); text(row[0].toUpperCase(), boxX + 3, y);
    font(11, "bold"); setText(C.primaryDark); text(row[1], boxX + 52, y, { align: "right" });
  });

  // Linha separadora
  setStroke(C.ink); hline(M, headerBottom, PW - M, headerBottom, 0.5);

  // KPIs — 5 cartões iguais
  const kpiY = headerBottom + 5;
  const kpiH = 22;
  const kpiGap = 3;
  const kpiW = (CW - kpiGap * 4) / 5;
  const kpis: { label: string; value: string; d: ReturnType<typeof delta>; sub: string }[] = [
    { label: "Total", value: String(input.current.total), d: delta(input.current.total, input.previous.total), sub: `Ant.: ${input.previous.total}` },
    { label: "Viabilidade", value: `${pctV}%`, d: delta(pctV, pctVPrev), sub: `${input.current.viable} viáveis / ${input.current.unviable} inviáveis` },
    { label: "Negociado", value: formatBRL(input.current.negotiated_value), d: delta(input.current.negotiated_value, input.previous.negotiated_value), sub: `${input.current.negotiations} negociações` },
    { label: "Expedientes", value: String(input.current.shifts), d: delta(input.current.shifts, input.previous.shifts), sub: "fechados no período" },
    { label: "Média / expediente", value: String(avgPerShift), d: delta(avgPerShift * 10, avgPerShiftPrev * 10), sub: "serviços por dia trabalhado" },
  ];
  kpis.forEach((k, i) => {
    const x = M + i * (kpiW + kpiGap);
    setFill(C.white); setStroke(C.border);
    pdf.roundedRect(x, kpiY, kpiW, kpiH, 2, 2, "FD");
    // faixa lateral primary
    setFill(C.primary); pdf.rect(x, kpiY, 1.5, kpiH, "F");
    font(7, "bold"); setText(C.muted);
    text(k.label.toUpperCase(), x + 4, kpiY + 5);
    font(14, "bold"); setText(C.ink);
    text(fit(k.value, kpiW - 8), x + 4, kpiY + 12);
    deltaPill(k.d, x + 4, kpiY + 17);
    font(6.5, "normal"); setText(C.muted);
    text(fit(k.sub, kpiW - 8), x + 4, kpiY + 20.5);
  });

  // Projeção do mês (largura total)
  const projY = kpiY + kpiH + 4;
  const projH = 24;
  setFill(C.white); setStroke(C.border);
  pdf.roundedRect(M, projY, CW, projH, 2, 2, "FD");
  font(8, "bold"); setText(C.primaryDark);
  text(projectionLabel(input.period).toUpperCase(), M + 4, projY + 5);
  // Serviços projetados
  font(7, "normal"); setText(C.muted);
  text("SERVIÇOS PROJETADOS", M + 4, projY + 10);
  font(14, "bold"); setText(C.primaryDark);
  text(String(input.projected.total), M + 4, projY + 17);
  font(7, "normal"); setText(C.sub);
  const diffT = input.projected.total - input.previous.total;
  text(`vs ${previousLabel(input.period)}: ${input.previous.total} (${diffT >= 0 ? "+" : ""}${diffT})`, M + 4, projY + 21);
  // Valor negociado projetado
  font(7, "normal"); setText(C.muted);
  text("VALOR NEGOCIADO PROJETADO", M + 55, projY + 10);
  font(13, "bold"); setText(C.primaryDark);
  text(formatBRL(input.projected.negotiated_value), M + 55, projY + 17);
  font(7, "normal"); setText(C.sub);
  text(`vs ${previousLabel(input.period)}: ${formatBRL(input.previous.negotiated_value)}`, M + 55, projY + 21);
  // Barra de projeção
  const barX = M + 118;
  const barW = CW - 122;
  const paceRatio = input.projected.total > 0 ? Math.min(1, input.current.total / input.projected.total) : 0;
  font(7, "normal"); setText(C.muted);
  text(`Ritmo atual: ${input.current.total} de ${input.projected.total}`, barX, projY + 6);
  text(`${Math.round(paceRatio * 100)}% da projeção`, barX + barW, projY + 6, { align: "right" });
  setFill(C.border); pdf.roundedRect(barX, projY + 8, barW, 5, 1, 1, "F");
  setFill(C.primary); pdf.roundedRect(barX, projY + 8, Math.max(1.2, barW * paceRatio), 5, 1, 1, "F");
  font(6.5, "normal"); setText(C.muted);
  text("Projeção baseada no ritmo atual — não representa meta oficial.", barX, projY + 18);
  text(`Referência: ${periodLabel(input.period)}`, barX + barW, projY + 18, { align: "right" });

  // Gráficos — coluna esquerda (Atual x Anterior) / direita (Evolução)
  const chY = projY + projH + 4;
  const chH = PH - chY - 12;
  const chW = (CW - 5) / 2;

  // Gráfico 1: barras agrupadas
  const compareBars = input.compare_bars ?? [
    { name: "Total", atual: input.current.total, anterior: input.previous.total },
    { name: "Viáveis", atual: input.current.viable, anterior: input.previous.viable },
    { name: "Inviáveis", atual: input.current.unviable, anterior: input.previous.unviable },
    { name: "Negoc.", atual: input.current.negotiations, anterior: input.previous.negotiations },
  ];
  drawGroupedBar(pdf, M, chY, chW, chH, "Atual × Mês anterior", compareBars);
  drawLineChart(pdf, M + chW + 5, chY, chW, chH, "Evolução (viáveis)", input.evolution ?? []);

  // Footer p1
  footer(1, 3);

  // =========================================================================
  // PAGE 2 — Indicadores Operacionais
  // =========================================================================
  pdf.addPage("a4", "landscape");
  pageTitle(pdf, "INDICADORES OPERACIONAIS", input.scope_label, periodStr);

  const blkY = M + 18;
  const blkH = 88;
  const blkW = (CW - 5) / 2;
  drawRankBlock(pdf, M, blkY, blkW, blkH, "Top serviços (viáveis)", input.by_type);
  drawRankBlock(pdf, M + blkW + 5, blkY, blkW, blkH, "Principais motivos de inviabilidade", input.top_reasons);
  drawRankBlock(pdf, M, blkY + blkH + 4, blkW, blkH, "Complementos mais usados", input.top_complements);
  drawRankBlock(pdf, M + blkW + 5, blkY + blkH + 4, blkW, blkH, "Impactos recorrentes", input.top_impacts);

  // Quadro melhor dia
  const bestY = blkY + blkH * 2 + 10;
  setFill(C.primaryDark); setStroke(C.primaryDark);
  pdf.roundedRect(M, bestY, CW, 14, 2, 2, "F");
  font(8, "bold"); setText(C.white);
  text("MELHOR DIA DO PERÍODO", M + 4, bestY + 5.5);
  font(12, "bold");
  if (input.best_day) {
    text(`${input.best_day.date} — ${input.best_day.qty} viáveis registrados`, M + 4, bestY + 11);
  } else {
    font(9, "normal"); text("Sem dados suficientes para eleger o melhor dia.", M + 4, bestY + 11);
  }
  footer(2, 3);

  // =========================================================================
  // PAGE 3 — Resumo Executivo
  // =========================================================================
  pdf.addPage("a4", "landscape");
  pageTitle(pdf, "RESUMO EXECUTIVO", input.scope_label, periodStr);

  const analysis = buildAnalysis(input, { pctV, pctVPrev, avgPerShift, avgPerShiftPrev });
  const blocks = [
    { title: "Desempenho geral", body: analysis.overall },
    { title: "Evolução vs período anterior", body: analysis.evolution },
    { title: "Principais serviços executados", body: analysis.services },
    { title: "Principais motivos de inviabilidade", body: analysis.reasons },
    { title: "Negociações", body: analysis.negotiations },
    { title: "Produtividade", body: analysis.productivity },
    { title: "Melhor desempenho observado", body: analysis.bestDay },
    { title: "Recomendações", body: analysis.recommendations, accent: true as const },
  ];
  const colW = (CW - 6) / 2;
  const rowH = 33;
  blocks.forEach((b, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = M + col * (colW + 6);
    const y = M + 20 + row * (rowH + 3);
    const accent = "accent" in b && b.accent;
    setFill(accent ? C.primaryDark : C.white);
    setStroke(C.border);
    pdf.roundedRect(x, y, colW, rowH, 2, 2, "FD");
    font(8, "bold");
    setText(accent ? C.white : C.primaryDark);
    text(b.title.toUpperCase(), x + 4, y + 5);
    font(8, "normal");
    setText(accent ? C.white : C.ink);
    const lines = pdf.splitTextToSize(b.body, colW - 8) as string[];
    lines.slice(0, 6).forEach((l, li) => pdf.text(l, x + 4, y + 10.5 + li * 3.6));
  });

  // Assinaturas
  const sigY = PH - 25;
  const sigW = 90;
  const sigLeft = M + 30;
  const sigRight = PW - M - 30 - sigW;
  setStroke(C.ink);
  hline(sigLeft, sigY, sigLeft + sigW, sigY, 0.4);
  hline(sigRight, sigY, sigRight + sigW, sigY, 0.4);
  font(8, "bold"); setText(C.ink);
  text("Supervisor", sigLeft + sigW / 2, sigY + 5, { align: "center" });
  text("Gerência", sigRight + sigW / 2, sigY + 5, { align: "center" });
  font(7, "normal"); setText(C.muted);
  text(input.supervisor || "-", sigLeft + sigW / 2, sigY + 9, { align: "center" });
  text("_", sigRight + sigW / 2, sigY + 9, { align: "center" });

  footer(3, 3);

  return pdf.output("blob");
}

// Helpers de layout de página ----------------------------------------------
function pageTitle(pdf: import("jspdf").jsPDF, title: string, scope: string, period: string) {
  const M = 15;
  const PW = 297;
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(14);
  pdf.setTextColor(C.ink[0], C.ink[1], C.ink[2]);
  pdf.text(title, M, M + 6);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8.5);
  pdf.setTextColor(C.sub[0], C.sub[1], C.sub[2]);
  pdf.text(`${scope} · ${period}`, PW - M, M + 6, { align: "right" });
  pdf.setDrawColor(C.ink[0], C.ink[1], C.ink[2]);
  pdf.setLineWidth(0.4);
  pdf.line(M, M + 10, PW - M, M + 10);
}

function drawRankBlock(
  pdf: import("jspdf").jsPDF,
  x: number, y: number, w: number, h: number,
  title: string,
  rows: { name: string; qty: number }[],
) {
  pdf.setFillColor(255, 255, 255);
  pdf.setDrawColor(C.border[0], C.border[1], C.border[2]);
  pdf.setLineWidth(0.2);
  pdf.roundedRect(x, y, w, h, 2, 2, "FD");
  // header
  pdf.setFillColor(C.bgHead[0], C.bgHead[1], C.bgHead[2]);
  pdf.roundedRect(x, y, w, 8, 2, 2, "F");
  pdf.rect(x, y + 4, w, 4, "F");
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(8);
  pdf.setTextColor(C.primaryDark[0], C.primaryDark[1], C.primaryDark[2]);
  pdf.text(title.toUpperCase(), x + 4, y + 5.5);

  const top = rows.slice(0, 5);
  if (top.length === 0) {
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    pdf.setTextColor(C.soft[0], C.soft[1], C.soft[2]);
    pdf.text("Sem dados no período", x + w / 2, y + h / 2, { align: "center" });
    return;
  }
  const max = top[0].qty || 1;
  const rowH = (h - 12) / 5;
  top.forEach((r, i) => {
    const yy = y + 11 + i * rowH;
    // Rank number chip
    pdf.setFillColor(C.primary[0], C.primary[1], C.primary[2]);
    pdf.circle(x + 5, yy + rowH / 2 - 1, 2.4, "F");
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(7);
    pdf.setTextColor(255, 255, 255);
    pdf.text(String(i + 1), x + 5, yy + rowH / 2 + 0.4, { align: "center" });
    // Name
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8.5);
    pdf.setTextColor(C.ink[0], C.ink[1], C.ink[2]);
    const nameStr = truncate(pdf, r.name, w * 0.5);
    pdf.text(nameStr, x + 10, yy + rowH / 2 - 1);
    // qty
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(9);
    pdf.setTextColor(C.primaryDark[0], C.primaryDark[1], C.primaryDark[2]);
    pdf.text(String(r.qty), x + w - 4, yy + rowH / 2 - 1, { align: "right" });
    // bar
    const bx = x + 10;
    const bw = w - 22;
    const bh = 2;
    const by = yy + rowH / 2 + 1;
    pdf.setFillColor(C.border[0], C.border[1], C.border[2]);
    pdf.roundedRect(bx, by, bw, bh, 1, 1, "F");
    pdf.setFillColor(C.primary[0], C.primary[1], C.primary[2]);
    pdf.roundedRect(bx, by, Math.max(2, bw * (r.qty / max)), bh, 1, 1, "F");
  });
}

function truncate(pdf: import("jspdf").jsPDF, str: string, maxW: number): string {
  if (pdf.getTextWidth(str) <= maxW) return str;
  let out = str;
  while (out.length > 1 && pdf.getTextWidth(`${out}…`) > maxW) out = out.slice(0, -1);
  return `${out}…`;
}

function drawGroupedBar(
  pdf: import("jspdf").jsPDF,
  x: number, y: number, w: number, h: number,
  title: string,
  data: { name: string; atual: number; anterior: number }[],
) {
  pdf.setFillColor(255, 255, 255);
  pdf.setDrawColor(C.border[0], C.border[1], C.border[2]);
  pdf.setLineWidth(0.2);
  pdf.roundedRect(x, y, w, h, 2, 2, "FD");
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(8);
  pdf.setTextColor(C.primaryDark[0], C.primaryDark[1], C.primaryDark[2]);
  pdf.text(title.toUpperCase(), x + 4, y + 5.5);
  // Legend
  const lx = x + w - 4;
  pdf.setFontSize(7);
  pdf.setFont("helvetica", "normal");
  pdf.setTextColor(C.sub[0], C.sub[1], C.sub[2]);
  pdf.setFillColor(C.soft[0], C.soft[1], C.soft[2]);
  pdf.rect(lx - 26, y + 3.6, 2, 2, "F");
  pdf.text("Anterior", lx - 23, y + 5.5);
  pdf.setFillColor(C.primary[0], C.primary[1], C.primary[2]);
  pdf.rect(lx - 10, y + 3.6, 2, 2, "F");
  pdf.text("Atual", lx - 7, y + 5.5);

  // Plot area
  const px = x + 12;
  const py = y + 12;
  const pw = w - 16;
  const ph = h - 22;
  const maxV = Math.max(1, ...data.flatMap((d) => [d.atual, d.anterior]));
  // axes
  pdf.setDrawColor(C.border[0], C.border[1], C.border[2]);
  pdf.setLineWidth(0.15);
  // gridlines & Y labels (4 divisions)
  pdf.setFontSize(6.5);
  pdf.setTextColor(C.muted[0], C.muted[1], C.muted[2]);
  for (let i = 0; i <= 4; i++) {
    const gy = py + ph - (ph * i) / 4;
    pdf.line(px, gy, px + pw, gy);
    pdf.text(String(Math.round((maxV * i) / 4)), px - 1.5, gy + 1.2, { align: "right" });
  }
  // bars
  const gap = 6;
  const groupW = (pw - gap * (data.length - 1)) / data.length;
  const barW = (groupW - 2) / 2;
  data.forEach((d, i) => {
    const gx = px + i * (groupW + gap);
    const hAnt = (d.anterior / maxV) * ph;
    const hAtu = (d.atual / maxV) * ph;
    pdf.setFillColor(C.soft[0], C.soft[1], C.soft[2]);
    pdf.rect(gx, py + ph - hAnt, barW, hAnt, "F");
    pdf.setFillColor(C.primary[0], C.primary[1], C.primary[2]);
    pdf.rect(gx + barW + 2, py + ph - hAtu, barW, hAtu, "F");
    // values on top
    pdf.setFontSize(6);
    pdf.setTextColor(C.muted[0], C.muted[1], C.muted[2]);
    if (hAnt > 5) pdf.text(String(d.anterior), gx + barW / 2, py + ph - hAnt - 0.8, { align: "center" });
    if (hAtu > 5) {
      pdf.setTextColor(C.primaryDark[0], C.primaryDark[1], C.primaryDark[2]);
      pdf.text(String(d.atual), gx + barW + 2 + barW / 2, py + ph - hAtu - 0.8, { align: "center" });
    }
    // label
    pdf.setFontSize(7);
    pdf.setTextColor(C.ink[0], C.ink[1], C.ink[2]);
    pdf.text(d.name, gx + groupW / 2, py + ph + 4, { align: "center" });
  });
}

function drawLineChart(
  pdf: import("jspdf").jsPDF,
  x: number, y: number, w: number, h: number,
  title: string,
  data: { date: string; qty: number }[],
) {
  pdf.setFillColor(255, 255, 255);
  pdf.setDrawColor(C.border[0], C.border[1], C.border[2]);
  pdf.setLineWidth(0.2);
  pdf.roundedRect(x, y, w, h, 2, 2, "FD");
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(8);
  pdf.setTextColor(C.primaryDark[0], C.primaryDark[1], C.primaryDark[2]);
  pdf.text(title.toUpperCase(), x + 4, y + 5.5);

  const px = x + 12;
  const py = y + 12;
  const pw = w - 16;
  const ph = h - 22;

  if (data.length === 0) {
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    pdf.setTextColor(C.soft[0], C.soft[1], C.soft[2]);
    pdf.text("Sem dados no período", x + w / 2, y + h / 2, { align: "center" });
    return;
  }
  const maxV = Math.max(1, ...data.map((d) => d.qty));
  pdf.setDrawColor(C.border[0], C.border[1], C.border[2]);
  pdf.setLineWidth(0.15);
  pdf.setFontSize(6.5);
  pdf.setTextColor(C.muted[0], C.muted[1], C.muted[2]);
  for (let i = 0; i <= 4; i++) {
    const gy = py + ph - (ph * i) / 4;
    pdf.line(px, gy, px + pw, gy);
    pdf.text(String(Math.round((maxV * i) / 4)), px - 1.5, gy + 1.2, { align: "right" });
  }

  const n = data.length;
  const step = n > 1 ? pw / (n - 1) : 0;
  // line
  pdf.setDrawColor(C.primary[0], C.primary[1], C.primary[2]);
  pdf.setLineWidth(0.7);
  data.forEach((d, i) => {
    if (i === 0) return;
    const x1 = px + (i - 1) * step;
    const y1 = py + ph - (data[i - 1].qty / maxV) * ph;
    const x2 = px + i * step;
    const y2 = py + ph - (d.qty / maxV) * ph;
    pdf.line(x1, y1, x2, y2);
  });
  // dots
  pdf.setFillColor(C.primary[0], C.primary[1], C.primary[2]);
  data.forEach((d, i) => {
    const cx = px + i * step;
    const cy = py + ph - (d.qty / maxV) * ph;
    pdf.circle(cx, cy, 0.9, "F");
  });
  // x labels (thin out if many)
  pdf.setFontSize(6.5);
  pdf.setTextColor(C.muted[0], C.muted[1], C.muted[2]);
  const stride = Math.max(1, Math.ceil(n / 8));
  data.forEach((d, i) => {
    if (i % stride !== 0 && i !== n - 1) return;
    pdf.text(d.date, px + i * step, py + ph + 4, { align: "center" });
  });
}

// Executive summary generator (dynamic, no fixed text) ----------------------
function buildAnalysis(
  s: LeaderPdfInput,
  ext: { pctV: number; pctVPrev: number; avgPerShift: number; avgPerShiftPrev: number },
) {
  const prevLbl = previousLabel(s.period);
  const dTotal = deltaPct(s.current.total, s.previous.total);
  const dViab = deltaPct(ext.pctV, ext.pctVPrev);
  const dNeg = deltaPct(s.current.negotiations, s.previous.negotiations);
  const dNegV = deltaPct(s.current.negotiated_value, s.previous.negotiated_value);
  const dAvg = deltaPct(ext.avgPerShift * 10, ext.avgPerShiftPrev * 10);
  const trendWord = (d: number | null) =>
    d === null ? "estável" : d > 5 ? "em crescimento" : d < -5 ? "em queda" : "estável";
  const pctFmt = (d: number | null) => (d === null ? "sem comparativo" : `${d > 0 ? "+" : ""}${d}%`);

  const overall = `Foram registrados ${s.current.total} serviços no período, com ${s.current.viable} viáveis (${ext.pctV}%) e ${s.current.unviable} inviáveis, distribuídos em ${s.current.shifts} expedientes fechados. O volume total ficou ${trendWord(dTotal)} em relação a ${prevLbl} (${pctFmt(dTotal)}).`;

  const evolution = `Comparado a ${prevLbl} (${s.previous.total} serviços, ${ext.pctVPrev}% de viabilidade), o período atual apresenta variação de ${pctFmt(dTotal)} em volume e ${pctFmt(dViab)} em viabilidade. O valor negociado variou ${pctFmt(dNegV)}, passando de ${formatBRL(s.previous.negotiated_value)} para ${formatBRL(s.current.negotiated_value)}.`;

  const topSvc = s.by_type.slice(0, 3);
  const topSum = topSvc.reduce((a, b) => a + b.qty, 0);
  const totalViab = s.current.viable || 1;
  const services = topSvc.length > 0
    ? `Os três serviços com maior volume viável foram ${topSvc.map((t) => `${t.name} (${t.qty})`).join(", ")}, concentrando ${Math.round((topSum / totalViab) * 100)}% dos viáveis do período. Isso indica a base operacional que sustenta a produção.`
    : "Não há serviços viáveis registrados para o período analisado.";

  const topR = s.top_reasons.slice(0, 3);
  const totInv = s.current.unviable || 1;
  const rShare = topR.reduce((a, b) => a + b.qty, 0);
  const reasons = topR.length > 0
    ? `Os principais motivos de inviabilidade foram ${topR.map((t) => `${t.name} (${t.qty})`).join(", ")}, respondendo por ${Math.round((rShare / totInv) * 100)}% do total de inviáveis. Recomenda-se aprofundar a análise de "${topR[0].name}", que aparece com maior recorrência e merece atenção prioritária.`
    : "Nenhum motivo de inviabilidade foi registrado no período — cenário positivo que deve ser preservado.";

  const negotiations = s.current.negotiations > 0
    ? `Foram concluídas ${s.current.negotiations} negociações, totalizando ${formatBRL(s.current.negotiated_value)}. Frente a ${prevLbl}, o volume negociado apresenta variação de ${pctFmt(dNeg)} e o valor de ${pctFmt(dNegV)}. Ticket médio negociado: ${formatBRL(s.current.negotiations ? s.current.negotiated_value / s.current.negotiations : 0)}.`
    : `Não houve negociações no período. Vale intensificar a atuação comercial em campo para recuperar essa frente frente a ${prevLbl} (${formatBRL(s.previous.negotiated_value)}).`;

  const productivity = s.current.shifts > 0
    ? `A média de produção por expediente ficou em ${ext.avgPerShift} serviços/dia, ${trendWord(dAvg)} em relação a ${prevLbl} (${ext.avgPerShiftPrev}). Ao todo, ${s.current.shifts} expedientes foram fechados, o que serve de base para o dimensionamento operacional.`
    : "Nenhum expediente fechado impede o cálculo da média por expediente — reforçar o registro em campo é essencial.";

  const bestDay = s.best_day
    ? `O melhor desempenho observado ocorreu em ${s.best_day.date}, com ${s.best_day.qty} serviços viáveis registrados — pico a ser estudado para replicar boas práticas nos demais dias.`
    : "Ainda não há dados suficientes para eleger o melhor dia do período.";

  const recs: string[] = [];
  if (topR[0]) recs.push(`Atacar prioritariamente "${topR[0].name}", principal motivo de inviabilidade.`);
  if (dViab !== null && dViab < 0) recs.push(`Recuperar viabilidade — hoje em ${ext.pctV}% (variação ${pctFmt(dViab)} vs ${prevLbl}).`);
  if (dTotal !== null && dTotal < 0) recs.push("Reforçar o pipeline de serviços para reverter a queda de volume.");
  if (dNegV !== null && dNegV < 0) recs.push("Intensificar negociações — valor negociado está abaixo do período anterior.");
  if (s.best_day) recs.push(`Analisar o que fez de ${s.best_day.date} o melhor dia e replicar.`);
  if (recs.length < 3 && s.top_impacts[0]) recs.push(`Mitigar o impacto recorrente "${s.top_impacts[0].name}" (${s.top_impacts[0].qty} ocorrências).`);
  if (recs.length === 0) recs.push("Preservar o padrão atual — indicadores dentro do esperado.");
  const recommendations = recs.slice(0, 5).map((r, i) => `${i + 1}. ${r}`).join("  ");

  return { overall, evolution, services, reasons, negotiations, productivity, bestDay, recommendations };
}