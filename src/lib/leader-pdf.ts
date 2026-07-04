import { formatBRL, formatDateBR } from "./format";
import {
  type Period,
  deltaPct,
  periodLabel,
  previousLabel,
  projectionLabel,
} from "./analytics";
import logoAsset from "@/assets/gpva-logo.jpg.asset.json";
const logoUrl = logoAsset.url;

let _logoDataUrl: string | null = null;
async function loadLogoDataUrl(): Promise<string | null> {
  if (_logoDataUrl) return _logoDataUrl;
  try {
    const res = await fetch(logoUrl);
    if (!res.ok) return null;
    const blob = await res.blob();
    _logoDataUrl = await new Promise<string>((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result));
      fr.onerror = () => reject(fr.error);
      fr.readAsDataURL(blob);
    });
    return _logoDataUrl;
  } catch {
    return null;
  }
}

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
  setor?: string;
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
  evolution?: { date: string; qty: number; unviable?: number }[];
  company?: string;
  generated_by?: string;
  collaborators_count?: number | null;
};

function periodTitle(p: Period): string {
  return p === "day" ? "Dia" : p === "week" ? "Semana" : p === "month" ? "Mês" : "Ano";
}

function periodPeriodLabel(p: Period, ref: Date = new Date()): string {
  const months = [
    "JANEIRO", "FEVEREIRO", "MARÇO", "ABRIL", "MAIO", "JUNHO",
    "JULHO", "AGOSTO", "SETEMBRO", "OUTUBRO", "NOVEMBRO", "DEZEMBRO",
  ];
  if (p === "day") return ref.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" }).toUpperCase();
  if (p === "week") return `SEMANA DE ${ref.toLocaleDateString("pt-BR", { day: "2-digit", month: "long" }).toUpperCase()}`;
  if (p === "month") return `${months[ref.getMonth()]} DE ${ref.getFullYear()}`;
  return `ANO DE ${ref.getFullYear()}`;
}

// -------- Palette (orange + navy, matching the reference layout) --------
type RGB = [number, number, number];
const C = {
  ink: [15, 23, 42] as RGB,
  sub: [51, 65, 85] as RGB,
  muted: [100, 116, 139] as RGB,
  soft: [148, 163, 184] as RGB,
  border: [226, 232, 240] as RGB,
  bgAlt: [248, 250, 252] as RGB,
  bgHead: [241, 245, 249] as RGB,
  primary: [249, 115, 22] as RGB,        // orange-500
  primaryDark: [234, 88, 12] as RGB,     // orange-600
  primarySoft: [255, 237, 213] as RGB,   // orange-100
  navy: [15, 23, 42] as RGB,             // slate-900
  navyLight: [30, 41, 59] as RGB,        // slate-800
  success: [22, 101, 52] as RGB,
  successBg: [220, 252, 231] as RGB,
  danger: [153, 27, 27] as RGB,
  dangerBg: [254, 226, 226] as RGB,
  white: [255, 255, 255] as RGB,
};

const PW = 297;
const PH = 210;
const M = 10;
const CW = PW - M * 2;

export async function renderLeaderPdfBlob(input: LeaderPdfInput): Promise<Blob> {
  const { default: jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const now = new Date();
  const company = input.company ?? "GPVA";
  const generatedBy = input.generated_by ?? input.leader ?? "-";
  const periodStr = periodPeriodLabel(input.period, now);

  // ---------- low-level helpers ----------
  const setFill = (c: RGB) => pdf.setFillColor(c[0], c[1], c[2]);
  const setStroke = (c: RGB) => pdf.setDrawColor(c[0], c[1], c[2]);
  const setText = (c: RGB) => pdf.setTextColor(c[0], c[1], c[2]);
  const font = (size: number, weight: "normal" | "bold" = "normal") => {
    pdf.setFont("helvetica", weight);
    pdf.setFontSize(size);
  };
  const fit = (str: string, maxW: number): string => {
    if (pdf.getTextWidth(str) <= maxW) return str;
    let out = str;
    while (out.length > 1 && pdf.getTextWidth(`${out}…`) > maxW) out = out.slice(0, -1);
    return `${out}…`;
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
  const roundRect = (x: number, y: number, w: number, h: number, r = 2, mode: "F" | "S" | "FD" = "FD") => {
    pdf.roundedRect(x, y, w, h, r, r, mode);
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

  // ---------- Page decorators (orange top stripe + navy footer bar) ----------
  const pctV = input.current.total ? Math.round((input.current.viable / input.current.total) * 100) : 0;
  const pctVPrev = input.previous.total ? Math.round((input.previous.viable / input.previous.total) * 100) : 0;
  const avgPerShift = input.current.shifts ? +(input.current.total / input.current.shifts).toFixed(1) : 0;
  const avgPerShiftPrev = input.previous.shifts ? +(input.previous.total / input.previous.shifts).toFixed(1) : 0;
  const hasTeams = input.teams.length > 0;
  const totalPages = 3;

  const drawTopStripe = (pageIdx: number) => {
    // orange thin stripe
    setFill(C.primary);
    pdf.rect(0, 0, PW, 2.4, "F");
    // "PÁGINA N DE X" small caption
    font(6.5, "bold"); setText(C.muted);
    text(`PÁGINA ${pageIdx} DE ${totalPages}`, M, 5.5);
  };

  const drawFooter = (pageIdx: number) => {
    const fy = PH - 7;
    setFill(C.navy);
    pdf.rect(0, fy, PW, 7, "F");
    font(7.5, "bold"); setText(C.white);
    text(`SISTEMA ${company.toUpperCase()}`, M, fy + 4.5);
    font(7.5, "normal");
    text("RELATÓRIO EXECUTIVO DE PRODUÇÃO", PW / 2, fy + 4.5, { align: "center" });
    font(7.5, "bold");
    text(`${formatDateBR(now)}   |   PÁGINA ${pageIdx} DE ${totalPages}`, PW - M, fy + 4.5, { align: "right" });
  };

  // =========================================================================
  // PAGE 1 — Cabeçalho + KPIs + Projeção + Gráficos
  // =========================================================================
  drawTopStripe(1);

  // ----- Header block -----
  const headerY = 8;
  const headerH = 26;

  // Logo
  const logoDataUrl = await loadLogoDataUrl();
  if (logoDataUrl) {
    try { pdf.addImage(logoDataUrl, "JPEG", M, headerY, 22, 22); }
    catch {
      setFill(C.primary);
      pdf.roundedRect(M, headerY, 22, 22, 2, 2, "F");
    }
  } else {
    setFill(C.primary);
    pdf.roundedRect(M, headerY, 22, 22, 2, 2, "F");
    font(11, "bold"); setText(C.white);
    text(company.slice(0, 3).toUpperCase(), M + 11, headerY + 14, { align: "center" });
  }

  // Título
  font(15, "bold"); setText(C.ink);
  text("RELATÓRIO EXECUTIVO", M + 26, headerY + 8);
  text("DE PRODUÇÃO", M + 26, headerY + 15);
  font(9, "bold"); setText(C.primary);
  text(periodStr, M + 26, headerY + 22);

  // ---- middle metadata (2 columns) ----
  const iconSquare = (x: number, y: number) => {
    setFill(C.navy);
    pdf.roundedRect(x, y - 3, 3, 3, 0.5, 0.5, "F");
  };
  const metaCol1X = 118;
  const metaCol2X = 178;
  const metaLines: Array<[string, string, string, string]> = [
    ["EMPRESA:", company, "PERÍODO:", periodTitle(input.period)],
    ["SUPERVISOR:", input.supervisor || "-", "EMITIDO EM:", `${formatDateBR(now)} às ${now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`],
    ["ESCOPO:", input.scope_label, "GERADO POR:", generatedBy],
  ];
  metaLines.forEach((row, i) => {
    const y = headerY + 6 + i * 7;
    iconSquare(metaCol1X, y);
    font(7, "bold"); setText(C.muted); text(row[0], metaCol1X + 5, y);
    font(8.5, "normal"); setText(C.ink); text(row[1], metaCol1X + 22, y, { maxWidth: 32 });
    iconSquare(metaCol2X, y);
    font(7, "bold"); setText(C.muted); text(row[2], metaCol2X + 5, y);
    font(8.5, "normal"); setText(C.ink); text(row[3], metaCol2X + 24, y, { maxWidth: 42 });
  });

  // ---- Right navy card with 3 stats ----
  const rcX = PW - M - 62;
  const rcW = 62;
  setFill(C.navy);
  pdf.roundedRect(rcX, headerY, rcW, headerH, 2, 2, "F");
  const teamsCount = input.teams.length || 1;
  const collaborators = input.collaborators_count ?? null;
  const rcStats: [string, string][] = [
    ["EQUIPES", String(teamsCount)],
    ["COLABORADORES", collaborators !== null ? String(collaborators) : "—"],
    ["EXPEDIENTES", String(input.current.shifts)],
  ];
  const cellW = rcW / 3;
  rcStats.forEach((s, i) => {
    const cx = rcX + cellW * i + cellW / 2;
    font(14, "bold"); setText(C.primary);
    text(s[1], cx, headerY + 13, { align: "center" });
    font(6.5, "bold"); setText(C.white);
    text(s[0], cx, headerY + 20, { align: "center" });
  });

  // separator
  setStroke(C.ink);
  pdf.setLineWidth(0.4);
  pdf.line(M, headerY + headerH + 2, PW - M, headerY + headerH + 2);

  // ---- 6 KPI cards ----
  const kpiY = headerY + headerH + 6;
  const kpiH = 24;
  const kpiGap = 2.5;
  const kpiW = (CW - kpiGap * 5) / 6;
  const kpiProjPct = input.projected.total > 0
    ? Math.round((input.current.total / input.projected.total) * 100)
    : 0;
  const kpis: {
    label: string;
    value: string;
    d?: ReturnType<typeof delta>;
    sub: string;
    subRight?: string;
  }[] = [
    { label: "TOTAL DE SERVIÇOS", value: String(input.current.total), d: delta(input.current.total, input.previous.total), sub: `vs ${previousLabel(input.period)}: ${input.previous.total}` },
    { label: "VIABILIDADE", value: `${pctV}%`, d: delta(pctV, pctVPrev), sub: `${input.current.viable} viáveis / ${input.current.unviable} inviáveis` },
    { label: "TOTAL NEGOCIADO", value: formatBRL(input.current.negotiated_value), d: delta(input.current.negotiated_value, input.previous.negotiated_value), sub: `${input.current.negotiations} negociações` },
    { label: "EXPEDIENTES", value: String(input.current.shifts), d: delta(input.current.shifts, input.previous.shifts), sub: "fechados no período" },
    { label: "MÉDIA / EXPEDIENTE", value: String(avgPerShift), d: delta(avgPerShift * 10, avgPerShiftPrev * 10), sub: "serviços por dia trabalhado" },
    { label: "PROJEÇÃO DE FECHAMENTO", value: String(input.projected.total), sub: `Serviços projetados`, subRight: `${kpiProjPct}% da projeção` },
  ];
  kpis.forEach((k, i) => {
    const x = M + i * (kpiW + kpiGap);
    setFill(C.white); setStroke(C.border);
    pdf.setLineWidth(0.25);
    roundRect(x, kpiY, kpiW, kpiH, 2, "FD");

    // orange circle icon
    setFill(C.primary);
    pdf.circle(x + 5, kpiY + 6, 3, "F");

    // label
    font(6.5, "bold"); setText(C.muted);
    text(fit(k.label, kpiW - 12), x + 10, kpiY + 5);

    // value
    font(13, "bold"); setText(C.ink);
    text(fit(k.value, kpiW - 4), x + 3, kpiY + 14);

    // delta pill or percentage on right
    if (k.d) {
      const tone = k.d.tone;
      const dLabel = k.d.label;
      font(7, "bold");
      setText(tone === "up" ? C.success : tone === "down" ? C.danger : C.sub);
      text(dLabel, x + 3, kpiY + 18.5);
    } else if (k.subRight) {
      font(9, "bold"); setText(C.success);
      text(k.subRight, x + kpiW - 3, kpiY + 14, { align: "right" });
    }

    // sub
    font(6.5, "normal"); setText(C.muted);
    text(fit(k.sub, kpiW - 4), x + 3, kpiY + 22);
  });

  // ---- Middle row: Projeção panel + Comparativo chart + Evolução chart ----
  const midY = kpiY + kpiH + 3;
  const midH = PH - midY - 10;
  const midGap = 3;
  const projW = 100;
  const chartW = (CW - projW - midGap * 2) / 2;

  // --- Projeção panel (left) ---
  setFill(C.white); setStroke(C.border); pdf.setLineWidth(0.25);
  roundRect(M, midY, projW, midH, 2, "FD");
  font(8, "bold"); setText(C.primaryDark);
  text("PROJEÇÃO DE FECHAMENTO DO MÊS", M + 4, midY + 6);

  font(6.5, "bold"); setText(C.muted);
  text("SERVIÇOS PROJETADOS", M + 4, midY + 14);
  font(15, "bold"); setText(C.primary);
  text(String(input.projected.total), M + 4, midY + 22);
  font(6.5, "normal"); setText(C.sub);
  const diffT = input.projected.total - input.previous.total;
  text(`vs ${previousLabel(input.period)}: ${input.previous.total} (${diffT >= 0 ? "+" : ""}${diffT})`, M + 4, midY + 27);

  font(6.5, "bold"); setText(C.muted);
  text("VALOR NEGOCIADO PROJETADO", M + 4, midY + 34);
  font(12, "bold"); setText(C.primary);
  text(formatBRL(input.projected.negotiated_value), M + 4, midY + 41);
  font(6.5, "normal"); setText(C.sub);
  text(`vs ${previousLabel(input.period)}: ${formatBRL(input.previous.negotiated_value)}`, M + 4, midY + 46);

  font(6.5, "bold"); setText(C.muted);
  text("RITMO ATUAL", M + 4, midY + 53);
  font(9, "bold"); setText(C.ink);
  text(`${input.current.total} de ${input.projected.total}`, M + 4, midY + 59);
  const barY = midY + 62;
  const barW = projW - 8;
  const ratio = input.projected.total > 0 ? Math.min(1, input.current.total / input.projected.total) : 0;
  setFill(C.border); pdf.roundedRect(M + 4, barY, barW, 4, 1, 1, "F");
  setFill(C.primary); pdf.roundedRect(M + 4, barY, Math.max(1.2, barW * ratio), 4, 1, 1, "F");
  font(6.5, "bold"); setText(C.muted);
  text(`${Math.round(ratio * 100)}% da projeção`, M + projW - 4, barY + 8.5, { align: "right" });

  font(6, "normal"); setText(C.soft);
  const noteY = midY + midH - 6;
  const noteLines = pdf.splitTextToSize(
    `Projeção baseada no ritmo atual — não representa meta oficial. Referência: ${periodLabel(input.period)}`,
    projW - 8,
  ) as string[];
  noteLines.slice(0, 2).forEach((l, i) => pdf.text(l, M + 4, noteY - (noteLines.length - 1 - i) * 3));

  // --- Comparativo chart (middle) ---
  const compX = M + projW + midGap;
  const compareBars = input.compare_bars ?? [
    { name: "Total", atual: input.current.total, anterior: input.previous.total },
    { name: "Viáveis", atual: input.current.viable, anterior: input.previous.viable },
    { name: "Inviáveis", atual: input.current.unviable, anterior: input.previous.unviable },
    { name: "Negoc.", atual: input.current.negotiations, anterior: input.previous.negotiations },
  ];
  drawGroupedBar(pdf, compX, midY, chartW, midH, "COMPARATIVO ATUAL × MÊS ANTERIOR", compareBars);

  // --- Evolução chart (right) ---
  const evoX = compX + chartW + midGap;
  drawLineChart(pdf, evoX, midY, chartW, midH, "EVOLUÇÃO DIÁRIA DA PRODUÇÃO (VIÁVEIS)", input.evolution ?? []);

  drawFooter(1);

  // =========================================================================
  // PAGE 2 — Indicadores Operacionais
  // =========================================================================
  pdf.addPage("a4", "landscape");
  drawTopStripe(2);

  // Title bar (centered like reference)
  font(13, "bold"); setText(C.ink);
  text("INDICADORES OPERACIONAIS", PW / 2, 14, { align: "center" });
  font(8, "bold"); setText(C.primary);
  text(`${input.scope_label}   •   ${periodStr}`, PW / 2, 20, { align: "center" });

  // 4 rank tables + right MELHOR DIA card
  const tableY = 26;
  const tableH = PH - tableY - 14;
  const bestW = 55;
  const tableGap = 3;
  const tablesArea = CW - bestW - tableGap;
  const tableW = (tablesArea - tableGap * 3) / 4;

  const tables: { title: string; col: string; rows: { name: string; qty: number }[] }[] = [
    { title: "TOP SERVIÇOS (VIÁVEIS)", col: "SERVIÇO", rows: input.by_type },
    { title: "COMPLEMENTOS MAIS UTILIZADOS", col: "COMPLEMENTO", rows: input.top_complements },
    { title: "PRINCIPAIS MOTIVOS DE INVIABILIDADE", col: "MOTIVO", rows: input.top_reasons },
    { title: "IMPACTOS RECORRENTES", col: "IMPACTO", rows: input.top_impacts },
  ];
  tables.forEach((t, i) => {
    const x = M + i * (tableW + tableGap);
    drawRankTable(pdf, x, tableY, tableW, tableH, t.title, t.col, t.rows);
  });

  // MELHOR DIA card (right)
  const bestX = M + tablesArea + tableGap;
  setFill(C.white); setStroke(C.border); pdf.setLineWidth(0.3);
  roundRect(bestX, tableY, bestW, tableH, 3, "FD");
  // orange circle top
  setFill(C.primary);
  pdf.circle(bestX + bestW / 2, tableY + 14, 7, "F");
  // label
  font(7.5, "bold"); setText(C.muted);
  text("MELHOR DIA DO PERÍODO", bestX + bestW / 2, tableY + 28, { align: "center" });
  // date
  font(15, "bold"); setText(C.ink);
  if (input.best_day) {
    text(input.best_day.date, bestX + bestW / 2, tableY + 40, { align: "center" });
    // orange soft pill with detail
    setFill(C.primarySoft); setStroke(C.primary); pdf.setLineWidth(0.3);
    const pillW = bestW - 8;
    pdf.roundedRect(bestX + 4, tableY + 46, pillW, 12, 2, 2, "FD");
    font(9, "bold"); setText(C.primaryDark);
    text(`${input.best_day.qty} serviços viáveis`, bestX + bestW / 2, tableY + 51, { align: "center" });
    font(7, "normal"); setText(C.primaryDark);
    text("registrados", bestX + bestW / 2, tableY + 55.5, { align: "center" });
  } else {
    font(8, "normal"); setText(C.soft);
    text("Sem dados suficientes", bestX + bestW / 2, tableY + 40, { align: "center" });
  }

  drawFooter(2);

  // =========================================================================
  // PAGE 3 — Resumo Executivo
  // =========================================================================
  pdf.addPage("a4", "landscape");
  drawTopStripe(3);

  font(13, "bold"); setText(C.ink);
  text("RESUMO EXECUTIVO", PW / 2, 14, { align: "center" });
  font(8, "bold"); setText(C.primary);
  text(`${input.scope_label}   •   ${periodStr}`, PW / 2, 20, { align: "center" });

  const analysis = buildAnalysis(input, { pctV, pctVPrev, avgPerShift, avgPerShiftPrev });
  const blocks: { title: string; body: string; accent?: boolean }[] = [
    { title: "DESEMPENHO GERAL", body: analysis.overall },
    { title: "EVOLUÇÃO", body: analysis.evolution },
    { title: "SERVIÇOS EXECUTADOS", body: analysis.services },
    { title: "INVIABILIDADES", body: analysis.reasons },
    { title: "NEGOCIAÇÕES", body: analysis.negotiations },
    { title: "PRODUTIVIDADE", body: analysis.productivity },
    { title: "MELHOR DESEMPENHO", body: analysis.bestDay },
    { title: "RECOMENDAÇÕES", body: analysis.recommendations, accent: true },
  ];

  const gridY = 26;
  const gridAreaW = CW - 55; // reserve right column for signatures
  const gapX = 3;
  const gapY = 3;
  const cellW = (gridAreaW - gapX * 3) / 4;
  const cellH = (PH - gridY - 14 - gapY) / 2;

  blocks.forEach((b, i) => {
    const col = i % 4;
    const row = Math.floor(i / 4);
    const x = M + col * (cellW + gapX);
    const y = gridY + row * (cellH + gapY);
    if (b.accent) { setFill(C.primarySoft); }
    else { setFill(C.white); }
    setStroke(C.border); pdf.setLineWidth(0.25);
    roundRect(x, y, cellW, cellH, 2, "FD");
    // orange circle
    setFill(C.primary);
    pdf.circle(x + 5, y + 6, 2.6, "F");
    font(7.5, "bold"); setText(C.primaryDark);
    text(fit(b.title, cellW - 12), x + 10, y + 6.5);
    font(7.5, "normal"); setText(C.ink);
    const lines = pdf.splitTextToSize(b.body, cellW - 6) as string[];
    lines.slice(0, 7).forEach((l, li) => pdf.text(l, x + 3, y + 14 + li * 3.6));
  });

  // Right signature column
  const sigX = M + gridAreaW + gapX;
  const sigW = CW - gridAreaW - gapX;
  const sigTopY = gridY + 10;
  const sigStep = cellH + gapY;
  const drawSig = (label: string, y: number) => {
    setStroke(C.ink); pdf.setLineWidth(0.4);
    pdf.line(sigX + 2, y, sigX + sigW - 2, y);
    font(7.5, "bold"); setText(C.sub);
    text(label, sigX + sigW / 2, y + 5, { align: "center" });
  };
  drawSig("Supervisor", sigTopY + 20);
  drawSig("Gerência", sigTopY + sigStep + 10);

  drawFooter(3);

  // Optional teams page appended after
  if (hasTeams) drawTeamsPage(pdf, input, drawTopStripe, drawFooter);

  return pdf.output("blob");
}

// ---------------- Helpers ----------------

function drawRankTable(
  pdf: import("jspdf").jsPDF,
  x: number, y: number, w: number, h: number,
  title: string,
  colLabel: string,
  rows: { name: string; qty: number }[],
) {
  const setFill = (c: RGB) => pdf.setFillColor(c[0], c[1], c[2]);
  const setStroke = (c: RGB) => pdf.setDrawColor(c[0], c[1], c[2]);
  const setText = (c: RGB) => pdf.setTextColor(c[0], c[1], c[2]);
  const font = (s: number, wgt: "normal" | "bold" = "normal") => { pdf.setFont("helvetica", wgt); pdf.setFontSize(s); };
  setFill(C.white); setStroke(C.border); pdf.setLineWidth(0.3);
  pdf.roundedRect(x, y, w, h, 2, 2, "FD");

  // Title with small orange square icon
  setFill(C.primary);
  pdf.roundedRect(x + 3, y + 3, 3.4, 3.4, 0.6, 0.6, "F");
  font(7.5, "bold"); setText(C.ink);
  pdf.text(title, x + 9, y + 6, { baseline: "alphabetic" });

  // Header row (# | col | QTD)
  const headY = y + 10;
  const headH = 5.5;
  const numW = 6;
  const qtdW = 10;
  const nameW = w - numW - qtdW - 4;

  setFill(C.bgHead);
  pdf.rect(x + 2, headY, w - 4, headH, "F");
  font(6.5, "bold"); setText(C.muted);
  pdf.text("#", x + 2 + numW / 2, headY + 3.8, { align: "center", baseline: "alphabetic" });
  pdf.text(colLabel, x + 2 + numW + 2, headY + 3.8, { baseline: "alphabetic" });
  pdf.text("QTD", x + w - 2 - qtdW / 2, headY + 3.8, { align: "center", baseline: "alphabetic" });

  const top = rows.slice(0, 6);
  if (top.length === 0) {
    font(8, "normal"); setText(C.soft);
    pdf.text("Sem dados no período", x + w / 2, y + h / 2, { align: "center", baseline: "alphabetic" });
    return;
  }
  const rowH = 5.4;
  top.forEach((r, i) => {
    const ry = headY + headH + i * rowH;
    if (i % 2 === 1) {
      setFill(C.bgAlt);
      pdf.rect(x + 2, ry, w - 4, rowH, "F");
    }
    font(7.5, "normal"); setText(C.ink);
    pdf.text(String(i + 1), x + 2 + numW / 2, ry + 3.8, { align: "center", baseline: "alphabetic" });
    const nameStr = truncate(pdf, r.name, nameW);
    pdf.text(nameStr, x + 2 + numW + 2, ry + 3.8, { baseline: "alphabetic" });
    font(7.5, "bold"); setText(C.primaryDark);
    pdf.text(String(r.qty), x + w - 2 - qtdW / 2, ry + 3.8, { align: "center", baseline: "alphabetic" });
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
  pdf.setLineWidth(0.25);
  pdf.roundedRect(x, y, w, h, 2, 2, "FD");
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(8);
  pdf.setTextColor(C.ink[0], C.ink[1], C.ink[2]);
  pdf.text(title, x + 4, y + 6);

  // Legend
  const lx = x + w - 4;
  pdf.setFontSize(6.5);
  pdf.setFont("helvetica", "normal");
  pdf.setTextColor(C.sub[0], C.sub[1], C.sub[2]);
  pdf.setFillColor(C.soft[0], C.soft[1], C.soft[2]);
  pdf.rect(lx - 26, y + 4.2, 2, 2, "F");
  pdf.text("Anterior", lx - 23, y + 6);
  pdf.setFillColor(C.primary[0], C.primary[1], C.primary[2]);
  pdf.rect(lx - 10, y + 4.2, 2, 2, "F");
  pdf.text("Atual", lx - 7, y + 6);

  const px = x + 12;
  const py = y + 12;
  const pw = w - 16;
  const ph = h - 22;
  const maxV = Math.max(1, ...data.flatMap((d) => [d.atual, d.anterior]));
  pdf.setDrawColor(C.border[0], C.border[1], C.border[2]);
  pdf.setLineWidth(0.15);
  pdf.setFontSize(6);
  pdf.setTextColor(C.muted[0], C.muted[1], C.muted[2]);
  for (let i = 0; i <= 4; i++) {
    const gy = py + ph - (ph * i) / 4;
    pdf.line(px, gy, px + pw, gy);
    pdf.text(String(Math.round((maxV * i) / 4)), px - 1.5, gy + 1.2, { align: "right" });
  }
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
    pdf.setFontSize(6);
    pdf.setTextColor(C.muted[0], C.muted[1], C.muted[2]);
    if (hAnt > 5) pdf.text(String(d.anterior), gx + barW / 2, py + ph - hAnt - 0.8, { align: "center" });
    if (hAtu > 5) {
      pdf.setTextColor(C.primaryDark[0], C.primaryDark[1], C.primaryDark[2]);
      pdf.text(String(d.atual), gx + barW + 2 + barW / 2, py + ph - hAtu - 0.8, { align: "center" });
    }
    pdf.setFontSize(7);
    pdf.setTextColor(C.ink[0], C.ink[1], C.ink[2]);
    pdf.text(d.name, gx + groupW / 2, py + ph + 4, { align: "center" });
  });
}

function drawLineChart(
  pdf: import("jspdf").jsPDF,
  x: number, y: number, w: number, h: number,
  title: string,
  data: { date: string; qty: number; unviable?: number }[],
) {
  pdf.setFillColor(255, 255, 255);
  pdf.setDrawColor(C.border[0], C.border[1], C.border[2]);
  pdf.setLineWidth(0.25);
  pdf.roundedRect(x, y, w, h, 2, 2, "FD");
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(8);
  pdf.setTextColor(C.ink[0], C.ink[1], C.ink[2]);
  pdf.text(title, x + 4, y + 6);

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
  pdf.setFontSize(6);
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
  pdf.setLineWidth(0.8);
  for (let i = 1; i < n; i++) {
    const x1 = px + (i - 1) * step;
    const y1 = py + ph - (data[i - 1].qty / maxV) * ph;
    const x2 = px + i * step;
    const y2 = py + ph - (data[i].qty / maxV) * ph;
    pdf.line(x1, y1, x2, y2);
  }
  pdf.setFillColor(C.primary[0], C.primary[1], C.primary[2]);
  data.forEach((d, i) => {
    const cx = px + i * step;
    const cy = py + ph - (d.qty / maxV) * ph;
    pdf.circle(cx, cy, 1.1, "F");
    // value label
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(6.5);
    pdf.setTextColor(C.ink[0], C.ink[1], C.ink[2]);
    pdf.text(String(d.qty), cx, cy - 2, { align: "center" });
  });
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(6.5);
  pdf.setTextColor(C.muted[0], C.muted[1], C.muted[2]);
  const stride = Math.max(1, Math.ceil(n / 8));
  data.forEach((d, i) => {
    if (i % stride !== 0 && i !== n - 1) return;
    pdf.text(d.date, px + i * step, py + ph + 4, { align: "center" });
  });
}

function drawTeamsPage(
  pdf: import("jspdf").jsPDF,
  input: LeaderPdfInput,
  drawTopStripe: (n: number) => void,
  drawFooter: (n: number) => void,
) {
  pdf.addPage("a4", "landscape");
  drawTopStripe(4);
  const setFill = (c: RGB) => pdf.setFillColor(c[0], c[1], c[2]);
  const setStroke = (c: RGB) => pdf.setDrawColor(c[0], c[1], c[2]);
  const setText = (c: RGB) => pdf.setTextColor(c[0], c[1], c[2]);
  const font = (s: number, wgt: "normal" | "bold" = "normal") => { pdf.setFont("helvetica", wgt); pdf.setFontSize(s); };

  font(13, "bold"); setText(C.ink);
  pdf.text("DETALHAMENTO POR EQUIPE", PW / 2, 14, { align: "center" });

  const tblY = 24;
  const cols: { label: string; w: number; align?: "left" | "right" | "center" }[] = [
    { label: "Equipe", w: 55 },
    { label: "Líder", w: 42 },
    { label: "Total", w: 18, align: "right" },
    { label: "Viáveis", w: 20, align: "right" },
    { label: "Inviáveis", w: 22, align: "right" },
    { label: "Viab. %", w: 18, align: "right" },
    { label: "Negoc.", w: 18, align: "right" },
    { label: "Valor negoc.", w: 30, align: "right" },
    { label: "Expedientes", w: 24, align: "right" },
  ];
  const totalW = cols.reduce((s, c) => s + c.w, 0);
  const startX = M + Math.max(0, (CW - totalW) / 2);
  const rowH = 6.2;
  setFill(C.navy); setStroke(C.navy);
  pdf.rect(startX, tblY, totalW, rowH, "F");
  font(7.5, "bold"); setText(C.white);
  let cx = startX;
  for (const c of cols) {
    const tx = c.align === "right" ? cx + c.w - 2 : cx + 2;
    pdf.text(c.label, tx, tblY + 4, { align: c.align ?? "left", baseline: "alphabetic" });
    cx += c.w;
  }
  const rows = [...input.teams].sort((a, b) => b.current.total - a.current.total);
  let ry = tblY + rowH;
  rows.forEach((t, i) => {
    if (i % 2 === 0) { setFill(C.bgAlt); pdf.rect(startX, ry, totalW, rowH, "F"); }
    const pct = t.current.total ? Math.round((t.current.viable / t.current.total) * 100) : 0;
    const values: string[] = [
      t.team_name,
      t.leader || "-",
      String(t.current.total),
      String(t.current.viable),
      String(t.current.unviable),
      `${pct}%`,
      String(t.current.negotiations),
      formatBRL(t.current.negotiated_value),
      String(t.current.shifts),
    ];
    font(7.5, "normal"); setText(C.ink);
    let bx = startX;
    values.forEach((v, ci) => {
      const c = cols[ci];
      const tx = c.align === "right" ? bx + c.w - 2 : bx + 2;
      pdf.text(v, tx, ry + 4, { align: c.align ?? "left", baseline: "alphabetic" });
      bx += c.w;
    });
    ry += rowH;
  });
  drawFooter(4);
}

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

  const overall = `Foram registrados ${s.current.total} serviços, com ${s.current.viable} viáveis (${ext.pctV}%) e ${s.current.unviable} inviáveis, distribuídos em ${s.current.shifts} expedientes fechados. O volume total está ${trendWord(dTotal)} em relação a ${prevLbl} (${pctFmt(dTotal)}).`;

  const evolution = `Frente a ${prevLbl} (${s.previous.total} serviços, ${ext.pctVPrev}% de viabilidade), o período atual apresenta variação de ${pctFmt(dTotal)} em volume e ${pctFmt(dViab)} em viabilidade. Valor negociado variou ${pctFmt(dNegV)}.`;

  const topSvc = s.by_type.slice(0, 3);
  const topSum = topSvc.reduce((a, b) => a + b.qty, 0);
  const totalViab = s.current.viable || 1;
  const services = topSvc.length > 0
    ? `Os três serviços com maior volume viável foram ${topSvc.map((t) => `${t.name} (${t.qty})`).join(", ")}, concentrando ${Math.round((topSum / totalViab) * 100)}% dos viáveis do período.`
    : "Sem serviços viáveis no período.";

  const topR = s.top_reasons.slice(0, 3);
  const totInv = s.current.unviable || 1;
  const rShare = topR.reduce((a, b) => a + b.qty, 0);
  const reasons = topR.length > 0
    ? `Principais motivos: ${topR.map((t) => `${t.name} (${t.qty})`).join(", ")}, respondendo por ${Math.round((rShare / totInv) * 100)}% dos inviáveis. "${topR[0].name}" merece atenção prioritária.`
    : "Nenhum motivo de inviabilidade registrado.";

  const negotiations = s.current.negotiations > 0
    ? `Foram concluídas ${s.current.negotiations} negociações totalizando ${formatBRL(s.current.negotiated_value)} (${pctFmt(dNeg)} em volume, ${pctFmt(dNegV)} em valor). Ticket médio: ${formatBRL(s.current.negotiated_value / s.current.negotiations)}.`
    : `Sem negociações no período. Reforçar atuação vs ${prevLbl} (${formatBRL(s.previous.negotiated_value)}).`;

  const productivity = s.current.shifts > 0
    ? `Média de produção por expediente: ${ext.avgPerShift} serviços, ${trendWord(dAvg)} frente a ${prevLbl} (${ext.avgPerShiftPrev}). Base de ${s.current.shifts} expedientes fechados.`
    : "Nenhum expediente fechado — reforçar registro em campo.";

  const bestDay = s.best_day
    ? `Pico observado em ${s.best_day.date} com ${s.best_day.qty} serviços viáveis — estudar boas práticas para replicar esse resultado nos demais dias.`
    : "Sem dados suficientes para eleger o melhor dia.";

  const recs: string[] = [];
  if (topR[0]) recs.push(`Atacar prioritariamente "${topR[0].name}", principal motivo de inviabilidade.`);
  if (dViab !== null && dViab < 0) recs.push(`Recuperar viabilidade — hoje em ${ext.pctV}% (${pctFmt(dViab)} vs ${prevLbl}).`);
  if (dTotal !== null && dTotal < 0) recs.push("Reforçar pipeline de serviços para reverter queda de volume.");
  if (dNegV !== null && dNegV < 0) recs.push("Intensificar negociações — valor abaixo do período anterior.");
  if (s.best_day) recs.push(`Analisar o que fez de ${s.best_day.date} o melhor dia e replicar boas práticas.`);
  if (recs.length === 0) recs.push("Preservar padrão atual — indicadores dentro do esperado.");
  const recommendations = recs.slice(0, 4).map((r, i) => `${i + 1}. ${r}`).join("  ");

  return { overall, evolution, services, reasons, negotiations, productivity, bestDay, recommendations };
}
