import { formatBRL, formatDateBR } from "./format";
import { type Period, deltaPct, previousLabel } from "./analytics";

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

// -------- Constantes de layout (A4 Retrato, 15 mm) --------
const PW = 210;
const PH = 297;
const M = 15;
const CW = PW - M * 2; // 180

type RGB = [number, number, number];
const C = {
  ink: [17, 24, 39] as RGB,
  sub: [75, 85, 99] as RGB,
  muted: [107, 114, 128] as RGB,
  soft: [156, 163, 175] as RGB,
  border: [229, 231, 235] as RGB,
  bgAlt: [249, 250, 251] as RGB,
  bgHead: [243, 244, 246] as RGB,
  orange: [234, 88, 12] as RGB,
  orangeDark: [154, 52, 18] as RGB,
  orangeSoft: [255, 237, 213] as RGB,
  white: [255, 255, 255] as RGB,
  black: [0, 0, 0] as RGB,
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

// -------- Renderização --------
export async function renderLeaderPdfBlob(input: LeaderPdfInput): Promise<Blob> {
  const { default: jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const now = new Date();
  const company = input.company ?? "GPVA";
  const periodStr = periodPeriodLabel(input.period, now);

  const setFill = (c: RGB) => pdf.setFillColor(c[0], c[1], c[2]);
  const setStroke = (c: RGB) => pdf.setDrawColor(c[0], c[1], c[2]);
  const setText = (c: RGB) => pdf.setTextColor(c[0], c[1], c[2]);
  const font = (size: number, weight: "normal" | "bold" = "normal") => {
    pdf.setFont("helvetica", weight);
    pdf.setFontSize(size);
  };
  const text = (v: string | number, x: number, y: number, opts?: { align?: "left" | "center" | "right"; maxWidth?: number }) => {
    const s = String(v ?? "-");
    const out = opts?.maxWidth ? fit(s, opts.maxWidth) : s;
    pdf.text(out, x, y, { align: opts?.align ?? "left", baseline: "alphabetic" });
  };
  const fit = (s: string, maxW: number): string => {
    if (pdf.getTextWidth(s) <= maxW) return s;
    let out = s;
    while (out.length > 1 && pdf.getTextWidth(`${out}…`) > maxW) out = out.slice(0, -1);
    return `${out}…`;
  };
  const hline = (x1: number, y1: number, x2: number, y2: number, w = 0.2) => {
    pdf.setLineWidth(w);
    pdf.line(x1, y1, x2, y2);
  };

  const pctV = input.current.total ? Math.round((input.current.viable / input.current.total) * 100) : 0;
  const pctVPrev = input.previous.total ? Math.round((input.previous.viable / input.previous.total) * 100) : 0;
  const avgPerShift = input.current.shifts ? +(input.current.total / input.current.shifts).toFixed(1) : 0;
  const avgPerShiftPrev = input.previous.shifts ? +(input.previous.total / input.previous.shifts).toFixed(1) : 0;

  const drawHeader = () => {
    // Faixa superior fina laranja
    setFill(C.orange);
    pdf.rect(0, 0, PW, 4, "F");
    // Logo — quadrado laranja com sigla
    setFill(C.orange);
    pdf.roundedRect(M, M, 16, 16, 1.5, 1.5, "F");
    font(9, "bold"); setText(C.white);
    text("GPVA", M + 8, M + 10, { align: "center" });
    // Título esquerdo
    font(14, "bold"); setText(C.ink);
    text("RELATÓRIO EXECUTIVO", M + 20, M + 7);
    font(14, "bold"); setText(C.orange);
    text("DE PRODUÇÃO", M + 20, M + 13);
    font(8, "normal"); setText(C.muted);
    text(periodStr.toUpperCase(), M + 20, M + 18);
    // Metadados à direita
    const rx = PW - M;
    const metaRows: [string, string][] = [
      ["Empresa", company],
      ["Supervisor", input.supervisor || "-"],
      ["Emitido em", formatDateBR(now)],
      ["Período", periodTitle(input.period)],
      ["Escopo", input.scope_label],
    ];
    metaRows.forEach((r, i) => {
      const y = M + 2 + i * 4;
      font(6.5, "normal"); setText(C.muted);
      text(r[0].toUpperCase(), rx - pdf.getTextWidth(r[1]) - 3, y, { align: "right" });
      font(8, "bold"); setText(C.ink);
      text(r[1], rx, y, { align: "right", maxWidth: 70 });
    });
    // Linha fina
    setStroke(C.border); hline(M, M + 22, PW - M, M + 22, 0.3);
  };

  const drawFooter = (n: number, tot: number) => {
    setStroke(C.border); hline(M, PH - 10, PW - M, PH - 10, 0.2);
    font(7, "normal"); setText(C.muted);
    text(`Sistema ${company}`, M, PH - 6);
    text(formatDateBR(now), PW / 2, PH - 6, { align: "center" });
    text(`Página ${n} de ${tot}`, PW - M, PH - 6, { align: "right" });
  };

  // ======= PÁGINA 1 =======
  drawHeader();

  // KPIs — 3 × 2 grid
  const kpiY = M + 27;
  const kpiH = 20;
  const kpiGapX = 3;
  const kpiGapY = 3;
  const kpiW = (CW - kpiGapX * 2) / 3;
  const kpis: { label: string; value: string; sub: string; icon: string }[] = [
    { label: "Total de serviços", value: String(input.current.total), sub: `Ant.: ${input.previous.total} · ${deltaTxt(input.current.total, input.previous.total)}`, icon: "T" },
    { label: "Viabilidade", value: `${pctV}%`, sub: `${input.current.viable} viáveis / ${input.current.unviable} inviáveis · ${deltaTxt(pctV, pctVPrev)}`, icon: "V" },
    { label: "Total negociado", value: formatBRL(input.current.negotiated_value), sub: `${input.current.negotiations} negociações · ${deltaTxt(input.current.negotiated_value, input.previous.negotiated_value)}`, icon: "$" },
    { label: "Expedientes", value: String(input.current.shifts), sub: `Fechados no período · ${deltaTxt(input.current.shifts, input.previous.shifts)}`, icon: "E" },
    { label: "Média / expediente", value: String(avgPerShift), sub: `Ant.: ${avgPerShiftPrev} · ${deltaTxt(avgPerShift * 10, avgPerShiftPrev * 10)}`, icon: "M" },
    { label: "Projeção", value: String(input.projected.total), sub: `Negociado projetado: ${formatBRL(input.projected.negotiated_value)}`, icon: "P" },
  ];
  kpis.forEach((k, i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const x = M + col * (kpiW + kpiGapX);
    const y = kpiY + row * (kpiH + kpiGapY);
    setFill(C.white); setStroke(C.border); pdf.setLineWidth(0.25);
    pdf.roundedRect(x, y, kpiW, kpiH, 1.5, 1.5, "FD");
    // barra lateral laranja
    setFill(C.orange); pdf.rect(x, y, 1.2, kpiH, "F");
    // ícone discreto
    setFill(C.orangeSoft);
    pdf.roundedRect(x + kpiW - 10, y + 3, 6, 6, 1, 1, "F");
    font(7, "bold"); setText(C.orangeDark);
    text(k.icon, x + kpiW - 7, y + 7.2, { align: "center" });
    // conteúdo
    font(6.5, "normal"); setText(C.muted);
    text(k.label.toUpperCase(), x + 4, y + 5.5);
    font(13, "bold"); setText(C.ink);
    text(fit(k.value, kpiW - 15), x + 4, y + 12.5);
    font(6.5, "normal"); setText(C.sub);
    text(fit(k.sub, kpiW - 6), x + 4, y + 17.5);
  });

  // Gráfico 1 — Comparativo Atual x Anterior
  const ch1Y = kpiY + kpiH * 2 + kpiGapY + 6;
  const chH = 82;
  const compareBars = input.compare_bars ?? [
    { name: "Total", atual: input.current.total, anterior: input.previous.total },
    { name: "Viáveis", atual: input.current.viable, anterior: input.previous.viable },
    { name: "Inviáveis", atual: input.current.unviable, anterior: input.previous.unviable },
    { name: "Negoc.", atual: input.current.negotiations, anterior: input.previous.negotiations },
  ];
  drawGroupedBar(pdf, M, ch1Y, CW, chH, `Comparativo Atual × ${previousLabel(input.period)}`, compareBars);

  // Gráfico 2 — Evolução diária
  const ch2Y = ch1Y + chH + 6;
  drawLineChart(pdf, M, ch2Y, CW, chH, "Evolução Diária da Produção", input.evolution ?? []);

  drawFooter(1, 3);

  // ======= PÁGINA 2 =======
  pdf.addPage("a4", "portrait");
  drawSectionTitle(pdf, "INDICADORES OPERACIONAIS", `${input.scope_label} · ${periodStr}`);

  const p2Top = M + 20;
  const colGap = 6;
  const colW = (CW - colGap) / 2;
  const blkH = 115;
  const blkGap = 6;

  drawTableBlock(pdf, M, p2Top, colW, blkH / 2 - blkGap / 2, "Top Serviços", ["#", "Serviço", "Qtd."], mapRankRows(input.by_type));
  drawTableBlock(pdf, M, p2Top + blkH / 2 + blkGap / 2, colW, blkH / 2 - blkGap / 2, "Complementos Mais Utilizados", ["#", "Complemento", "Qtd."], mapRankRows(input.top_complements));
  drawTableBlock(pdf, M + colW + colGap, p2Top, colW, blkH / 2 - blkGap / 2, "Principais Motivos de Inviabilidade", ["#", "Motivo", "Qtd."], mapRankRows(input.top_reasons));
  drawTableBlock(pdf, M + colW + colGap, p2Top + blkH / 2 + blkGap / 2, colW, blkH / 2 - blkGap / 2, "Impactos Recorrentes", ["#", "Impacto", "Qtd."], mapRankRows(input.top_impacts));

  // Melhor dia — destaque horizontal
  const bestY = p2Top + blkH + 12;
  setFill(C.bgAlt); setStroke(C.border); pdf.setLineWidth(0.25);
  pdf.roundedRect(M, bestY, CW, 26, 2, 2, "FD");
  // faixa laranja lateral
  setFill(C.orange); pdf.rect(M, bestY, 2, 26, "F");
  font(8, "bold"); setText(C.orangeDark);
  text("MELHOR DIA DO PERÍODO", M + 6, bestY + 7);
  if (input.best_day) {
    font(18, "bold"); setText(C.ink);
    text(input.best_day.date, M + 6, bestY + 18);
    font(10, "normal"); setText(C.sub);
    text(`${input.best_day.qty} serviços viáveis registrados`, M + 6, bestY + 23);
    // número grande à direita
    font(28, "bold"); setText(C.orange);
    text(String(input.best_day.qty), PW - M - 6, bestY + 20, { align: "right" });
  } else {
    font(10, "normal"); setText(C.muted);
    text("Sem dados suficientes para eleger o melhor dia.", M + 6, bestY + 17);
  }

  drawFooter(2, 3);

  // ======= PÁGINA 3 =======
  pdf.addPage("a4", "portrait");
  drawSectionTitle(pdf, "RESUMO EXECUTIVO", `${input.scope_label} · ${periodStr}`);

  const analysis = buildAnalysis(input, { pctV, pctVPrev, avgPerShift, avgPerShiftPrev });
  const summaryBlocks: { icon: string; title: string; body: string }[] = [
    { icon: "D", title: "Desempenho Geral", body: analysis.overall },
    { icon: "E", title: "Evolução", body: analysis.evolution },
    { icon: "S", title: "Serviços Executados", body: analysis.services },
    { icon: "I", title: "Inviabilidades", body: analysis.reasons },
    { icon: "N", title: "Negociações", body: analysis.negotiations },
    { icon: "P", title: "Produtividade", body: analysis.productivity },
    { icon: "★", title: "Melhor Desempenho", body: analysis.bestDay },
  ];
  const p3Top = M + 20;
  const sColGap = 5;
  const sColW = (CW - sColGap) / 2;
  const sBlkH = 40;
  const sBlkGap = 4;
  summaryBlocks.forEach((b, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = M + col * (sColW + sColGap);
    const y = p3Top + row * (sBlkH + sBlkGap);
    drawExecBlock(pdf, x, y, sColW, sBlkH, b.icon, b.title, b.body, false);
  });
  // Recomendações — caixa destacada full width
  const recRow = Math.ceil(summaryBlocks.length / 2);
  const recY = p3Top + recRow * (sBlkH + sBlkGap);
  drawExecBlock(pdf, M, recY, CW, sBlkH + 6, "R", "Recomendações", analysis.recommendations, true);

  drawFooter(3, 3);

  return pdf.output("blob");

  function deltaTxt(cur: number, prev: number): string {
    const d = deltaPct(cur, prev);
    if (d === null) return "—";
    return `${d > 0 ? "▲ +" : d < 0 ? "▼ " : ""}${d}%`;
  }
}

// -------- Blocos reutilizáveis --------
function drawSectionTitle(pdf: import("jspdf").jsPDF, title: string, subtitle: string) {
  pdf.setFillColor(C.orange[0], C.orange[1], C.orange[2]);
  pdf.rect(0, 0, PW, 4, "F");
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(13);
  pdf.setTextColor(C.ink[0], C.ink[1], C.ink[2]);
  pdf.text(title, M, M + 6);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8);
  pdf.setTextColor(C.muted[0], C.muted[1], C.muted[2]);
  pdf.text(subtitle, PW - M, M + 6, { align: "right" });
  pdf.setDrawColor(C.orange[0], C.orange[1], C.orange[2]);
  pdf.setLineWidth(0.6);
  pdf.line(M, M + 10, M + 40, M + 10);
  pdf.setDrawColor(C.border[0], C.border[1], C.border[2]);
  pdf.setLineWidth(0.2);
  pdf.line(M + 40, M + 10, PW - M, M + 10);
}

function mapRankRows(rows: { name: string; qty: number }[]) {
  return rows.slice(0, 8).map((r, i) => [String(i + 1), r.name, String(r.qty)]);
}

function drawTableBlock(
  pdf: import("jspdf").jsPDF,
  x: number, y: number, w: number, h: number,
  title: string, heads: string[], rows: string[][],
) {
  pdf.setFillColor(255, 255, 255);
  pdf.setDrawColor(C.border[0], C.border[1], C.border[2]);
  pdf.setLineWidth(0.25);
  pdf.roundedRect(x, y, w, h, 1.5, 1.5, "FD");
  // Título
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(8);
  pdf.setTextColor(C.ink[0], C.ink[1], C.ink[2]);
  pdf.text(title.toUpperCase(), x + 4, y + 6);
  // pequena barra laranja abaixo do título
  pdf.setFillColor(C.orange[0], C.orange[1], C.orange[2]);
  pdf.rect(x + 4, y + 7.5, 12, 0.7, "F");

  const tHeaderY = y + 12;
  const tBodyY = tHeaderY + 4;
  const rowH = Math.min(6.2, (h - 18) / Math.max(1, rows.length));
  const colX = [x + 4, x + 12, x + w - 4];
  // header
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(6.8);
  pdf.setTextColor(C.muted[0], C.muted[1], C.muted[2]);
  pdf.text(heads[0], colX[0], tHeaderY + 2);
  pdf.text(heads[1], colX[1], tHeaderY + 2);
  pdf.text(heads[2], colX[2], tHeaderY + 2, { align: "right" });
  pdf.setDrawColor(C.border[0], C.border[1], C.border[2]);
  pdf.setLineWidth(0.15);
  pdf.line(x + 4, tHeaderY + 3.4, x + w - 4, tHeaderY + 3.4);

  if (rows.length === 0) {
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.setTextColor(C.soft[0], C.soft[1], C.soft[2]);
    pdf.text("Sem dados no período", x + w / 2, y + h / 2 + 3, { align: "center" });
    return;
  }
  rows.forEach((r, i) => {
    const yy = tBodyY + i * rowH;
    if (yy + rowH > y + h - 2) return;
    if (i % 2 === 1) {
      pdf.setFillColor(C.bgAlt[0], C.bgAlt[1], C.bgAlt[2]);
      pdf.rect(x + 2, yy - rowH + 2.2, w - 4, rowH, "F");
    }
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(7.5);
    pdf.setTextColor(C.orange[0], C.orange[1], C.orange[2]);
    pdf.text(r[0], colX[0], yy + 1.5);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.setTextColor(C.ink[0], C.ink[1], C.ink[2]);
    pdf.text(truncate(pdf, r[1], w - 24), colX[1], yy + 1.5);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(8);
    pdf.setTextColor(C.ink[0], C.ink[1], C.ink[2]);
    pdf.text(r[2], colX[2], yy + 1.5, { align: "right" });
  });
}

function drawExecBlock(
  pdf: import("jspdf").jsPDF,
  x: number, y: number, w: number, h: number,
  icon: string, title: string, body: string, highlight: boolean,
) {
  if (highlight) {
    pdf.setFillColor(C.orange[0], C.orange[1], C.orange[2]);
  } else {
    pdf.setFillColor(255, 255, 255);
  }
  pdf.setDrawColor(highlight ? C.orange[0] : C.border[0], highlight ? C.orange[1] : C.border[1], highlight ? C.orange[2] : C.border[2]);
  pdf.setLineWidth(0.3);
  pdf.roundedRect(x, y, w, h, 2, 2, "FD");
  // ícone circular
  if (highlight) {
    pdf.setFillColor(255, 255, 255);
  } else {
    pdf.setFillColor(C.orangeSoft[0], C.orangeSoft[1], C.orangeSoft[2]);
  }
  pdf.circle(x + 6, y + 6, 3, "F");
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(8);
  pdf.setTextColor(highlight ? C.orange[0] : C.orangeDark[0], highlight ? C.orange[1] : C.orangeDark[1], highlight ? C.orange[2] : C.orangeDark[2]);
  pdf.text(icon, x + 6, y + 7.2, { align: "center" });
  // título
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(9);
  pdf.setTextColor(highlight ? 255 : C.ink[0], highlight ? 255 : C.ink[1], highlight ? 255 : C.ink[2]);
  pdf.text(title.toUpperCase(), x + 12, y + 7.5);
  // corpo
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8);
  pdf.setTextColor(highlight ? 255 : C.sub[0], highlight ? 255 : C.sub[1], highlight ? 255 : C.sub[2]);
  const lines = pdf.splitTextToSize(body, w - 8) as string[];
  const lineH = 3.6;
  const maxLines = Math.max(1, Math.floor((h - 13) / lineH));
  lines.slice(0, maxLines).forEach((l, i) => pdf.text(l, x + 4, y + 13 + i * lineH));
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
  pdf.setLineWidth(0.25);
  pdf.roundedRect(x, y, w, h, 1.5, 1.5, "FD");
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(9);
  pdf.setTextColor(C.ink[0], C.ink[1], C.ink[2]);
  pdf.text(title, x + 5, y + 7);
  // legenda direita
  pdf.setFontSize(7);
  pdf.setFont("helvetica", "normal");
  pdf.setTextColor(C.sub[0], C.sub[1], C.sub[2]);
  const lx = x + w - 5;
  pdf.setFillColor(C.soft[0], C.soft[1], C.soft[2]);
  pdf.rect(lx - 28, y + 4.6, 2, 2, "F");
  pdf.text("Anterior", lx - 25, y + 6.3);
  pdf.setFillColor(C.orange[0], C.orange[1], C.orange[2]);
  pdf.rect(lx - 12, y + 4.6, 2, 2, "F");
  pdf.text("Atual", lx - 9, y + 6.3);

  const px = x + 14;
  const py = y + 14;
  const pw = w - 20;
  const ph = h - 26;
  const maxV = Math.max(1, ...data.flatMap((d) => [d.atual, d.anterior]));
  pdf.setDrawColor(C.border[0], C.border[1], C.border[2]);
  pdf.setLineWidth(0.12);
  pdf.setFontSize(6.5);
  pdf.setTextColor(C.muted[0], C.muted[1], C.muted[2]);
  for (let i = 0; i <= 4; i++) {
    const gy = py + ph - (ph * i) / 4;
    pdf.line(px, gy, px + pw, gy);
    pdf.text(String(Math.round((maxV * i) / 4)), px - 1.5, gy + 1.2, { align: "right" });
  }
  const gap = 8;
  const groupW = data.length > 0 ? (pw - gap * (data.length - 1)) / data.length : pw;
  const barW = (groupW - 3) / 2;
  data.forEach((d, i) => {
    const gx = px + i * (groupW + gap);
    const hAnt = (d.anterior / maxV) * ph;
    const hAtu = (d.atual / maxV) * ph;
    pdf.setFillColor(C.soft[0], C.soft[1], C.soft[2]);
    pdf.rect(gx, py + ph - hAnt, barW, hAnt, "F");
    pdf.setFillColor(C.orange[0], C.orange[1], C.orange[2]);
    pdf.rect(gx + barW + 3, py + ph - hAtu, barW, hAtu, "F");
    pdf.setFontSize(6.5);
    pdf.setTextColor(C.muted[0], C.muted[1], C.muted[2]);
    if (hAnt > 4) pdf.text(String(d.anterior), gx + barW / 2, py + ph - hAnt - 1, { align: "center" });
    if (hAtu > 4) {
      pdf.setTextColor(C.orangeDark[0], C.orangeDark[1], C.orangeDark[2]);
      pdf.text(String(d.atual), gx + barW + 3 + barW / 2, py + ph - hAtu - 1, { align: "center" });
    }
    pdf.setFontSize(7.5);
    pdf.setTextColor(C.ink[0], C.ink[1], C.ink[2]);
    pdf.text(d.name, gx + groupW / 2, py + ph + 4.5, { align: "center" });
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
  pdf.setLineWidth(0.25);
  pdf.roundedRect(x, y, w, h, 1.5, 1.5, "FD");
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(9);
  pdf.setTextColor(C.ink[0], C.ink[1], C.ink[2]);
  pdf.text(title, x + 5, y + 7);

  const px = x + 14;
  const py = y + 14;
  const pw = w - 20;
  const ph = h - 26;

  if (data.length === 0) {
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    pdf.setTextColor(C.soft[0], C.soft[1], C.soft[2]);
    pdf.text("Sem dados no período", x + w / 2, y + h / 2 + 3, { align: "center" });
    return;
  }
  const maxV = Math.max(1, ...data.map((d) => d.qty));
  pdf.setDrawColor(C.border[0], C.border[1], C.border[2]);
  pdf.setLineWidth(0.12);
  pdf.setFontSize(6.5);
  pdf.setTextColor(C.muted[0], C.muted[1], C.muted[2]);
  for (let i = 0; i <= 4; i++) {
    const gy = py + ph - (ph * i) / 4;
    pdf.line(px, gy, px + pw, gy);
    pdf.text(String(Math.round((maxV * i) / 4)), px - 1.5, gy + 1.2, { align: "right" });
  }
  const n = data.length;
  const step = n > 1 ? pw / (n - 1) : 0;
  // linha laranja
  pdf.setDrawColor(C.orange[0], C.orange[1], C.orange[2]);
  pdf.setLineWidth(0.7);
  for (let i = 1; i < n; i++) {
    const x1 = px + (i - 1) * step;
    const y1 = py + ph - (data[i - 1].qty / maxV) * ph;
    const x2 = px + i * step;
    const y2 = py + ph - (data[i].qty / maxV) * ph;
    pdf.line(x1, y1, x2, y2);
  }
  pdf.setFillColor(C.orange[0], C.orange[1], C.orange[2]);
  data.forEach((d, i) => {
    const cx = px + i * step;
    const cy = py + ph - (d.qty / maxV) * ph;
    pdf.circle(cx, cy, 0.9, "F");
  });
  pdf.setFontSize(6.5);
  pdf.setTextColor(C.muted[0], C.muted[1], C.muted[2]);
  const stride = Math.max(1, Math.ceil(n / 10));
  data.forEach((d, i) => {
    if (i % stride !== 0 && i !== n - 1) return;
    pdf.text(d.date, px + i * step, py + ph + 4.5, { align: "center" });
  });
}

// -------- Resumo executivo dinâmico --------
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
  const trendWord = (d: number | null) => d === null ? "estável" : d > 5 ? "em crescimento" : d < -5 ? "em queda" : "estável";
  const pctFmt = (d: number | null) => d === null ? "sem comparativo" : `${d > 0 ? "+" : ""}${d}%`;

  const overall = `Foram registrados ${s.current.total} serviços, com ${s.current.viable} viáveis (${ext.pctV}%) e ${s.current.unviable} inviáveis, distribuídos em ${s.current.shifts} expedientes fechados. O volume total está ${trendWord(dTotal)} em relação a ${prevLbl} (${pctFmt(dTotal)}).`;
  const evolution = `Frente a ${prevLbl} (${s.previous.total} serviços, ${ext.pctVPrev}% de viabilidade), o período atual apresenta variação de ${pctFmt(dTotal)} em volume e ${pctFmt(dViab)} em viabilidade. Valor negociado variou ${pctFmt(dNegV)}.`;
  const topSvc = s.by_type.slice(0, 3);
  const topSum = topSvc.reduce((a, b) => a + b.qty, 0);
  const totalViab = s.current.viable || 1;
  const services = topSvc.length > 0
    ? `Os três serviços com maior volume viável foram ${topSvc.map((t) => `${t.name} (${t.qty})`).join(", ")}, concentrando ${Math.round((topSum / totalViab) * 100)}% dos viáveis do período.`
    : "Nenhum serviço viável registrado no período.";
  const topR = s.top_reasons.slice(0, 3);
  const totInv = s.current.unviable || 1;
  const rShare = topR.reduce((a, b) => a + b.qty, 0);
  const reasons = topR.length > 0
    ? `Principais motivos: ${topR.map((t) => `${t.name} (${t.qty})`).join(", ")}, respondendo por ${Math.round((rShare / totInv) * 100)}% dos inviáveis. "${topR[0].name}" merece atenção prioritária.`
    : "Nenhum motivo de inviabilidade registrado — cenário positivo.";
  const negotiations = s.current.negotiations > 0
    ? `${s.current.negotiations} negociações totalizando ${formatBRL(s.current.negotiated_value)} (${pctFmt(dNeg)} em volume, ${pctFmt(dNegV)} em valor). Ticket médio: ${formatBRL(s.current.negotiated_value / s.current.negotiations)}.`
    : `Sem negociações no período. Vale intensificar a atuação comercial frente a ${prevLbl} (${formatBRL(s.previous.negotiated_value)}).`;
  const productivity = s.current.shifts > 0
    ? `Média de produção por expediente: ${ext.avgPerShift} serviços, ${trendWord(dAvg)} frente a ${prevLbl} (${ext.avgPerShiftPrev}). Base de ${s.current.shifts} expedientes fechados.`
    : "Sem expedientes fechados — reforçar o registro em campo é essencial.";
  const bestDay = s.best_day
    ? `Pico observado em ${s.best_day.date} com ${s.best_day.qty} serviços viáveis — estudar boas práticas para replicar.`
    : "Ainda não há dados suficientes para eleger o melhor dia do período.";

  const recs: string[] = [];
  if (topR[0]) recs.push(`Atacar prioritariamente "${topR[0].name}", principal motivo de inviabilidade.`);
  if (dViab !== null && dViab < 0) recs.push(`Recuperar viabilidade — hoje em ${ext.pctV}% (${pctFmt(dViab)} vs ${prevLbl}).`);
  if (dTotal !== null && dTotal < 0) recs.push("Reforçar o pipeline de serviços para reverter a queda de volume.");
  if (dNegV !== null && dNegV < 0) recs.push("Intensificar negociações — valor negociado abaixo do período anterior.");
  if (s.best_day) recs.push(`Analisar o que fez de ${s.best_day.date} o melhor dia e replicar.`);
  if (recs.length < 3 && s.top_impacts[0]) recs.push(`Mitigar o impacto recorrente "${s.top_impacts[0].name}" (${s.top_impacts[0].qty} ocorrências).`);
  if (recs.length === 0) recs.push("Preservar o padrão atual — indicadores dentro do esperado.");
  const recommendations = recs.slice(0, 5).map((r, i) => `${i + 1}. ${r}`).join("   ");

  return { overall, evolution, services, reasons, negotiations, productivity, bestDay, recommendations };
}