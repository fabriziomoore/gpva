import { formatBRL, formatDateBR } from "./format";
import {
  type Period,
  deltaPct,
  elapsedRatio,
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
};

function esc(s: string | number | null | undefined): string {
  return String(s ?? "-").replace(/[<>&"']/g, (c) => (
    { "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&#39;" }[c]!
  ));
}

function pct(v: number): string {
  return `${Math.round(v * 100)}%`;
}

function deltaBadge(cur: number, prev: number): string {
  const d = deltaPct(cur, prev);
  if (d === null) return `<span class="delta neutral">—</span>`;
  const cls = d > 0 ? "up" : d < 0 ? "down" : "neutral";
  const arrow = d > 0 ? "▲" : d < 0 ? "▼" : "▬";
  const sign = d > 0 ? "+" : "";
  return `<span class="delta ${cls}">${arrow} ${sign}${d}%</span>`;
}

function periodTitle(p: Period): string {
  return p === "day" ? "Dia" : p === "week" ? "Semana" : p === "month" ? "Mês" : "Ano";
}

function kpi(label: string, value: string, sub?: string): string {
  return `<div class="kpi"><div class="k-label">${esc(label)}</div><div class="k-value">${value}</div>${sub ? `<div class="k-sub">${sub}</div>` : ""}</div>`;
}

function rankTable(title: string, rows: { name: string; qty: number }[]): string {
  if (rows.length === 0) {
    return `<div class="rank"><h4>${esc(title)}</h4><p class="empty">Sem dados</p></div>`;
  }
  const max = rows[0].qty || 1;
  const body = rows
    .slice(0, 5)
    .map(
      (r) => `
      <tr>
        <td class="name">${esc(r.name)}</td>
        <td class="qty">${r.qty}</td>
        <td class="bar-cell"><div class="bar"><span style="width:${Math.max(6, (r.qty / max) * 100)}%"></span></div></td>
      </tr>`,
    )
    .join("");
  return `<div class="rank"><h4>${esc(title)}</h4><table class="rank-t"><tbody>${body}</tbody></table></div>`;
}

export function buildLeaderPdfHtml(s: LeaderPdfInput): string {
  const elapsed = elapsedRatio(s.period);
  const paceTarget = s.projected.total;
  const paceRatio = paceTarget ? Math.min(1, s.current.total / paceTarget) : 0;
  const pctV = s.current.total ? Math.round((s.current.viable / s.current.total) * 100) : 0;
  const pctVPrev = s.previous.total ? Math.round((s.previous.viable / s.previous.total) * 100) : 0;
  const avgPerShift = s.current.shifts ? +(s.current.total / s.current.shifts).toFixed(1) : 0;

  const teamsRows = s.teams
    .map((t) => {
      const tPctV = t.current.total ? Math.round((t.current.viable / t.current.total) * 100) : 0;
      return `<tr>
        <td class="tname">${esc(t.team_name)}</td>
        <td>${t.current.shifts}</td>
        <td>${t.current.total} ${deltaBadge(t.current.total, t.previous.total)}</td>
        <td>${t.current.viable} <span class="muted">(${tPctV}%)</span></td>
        <td>${t.current.unviable}</td>
        <td>${t.current.negotiations}</td>
        <td>${formatBRL(t.current.negotiated_value)} ${deltaBadge(t.current.negotiated_value, t.previous.negotiated_value)}</td>
      </tr>`;
    })
    .join("");

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"/>
<title>Relatório de Produtividade — ${esc(periodTitle(s.period))}</title>
<style>
  * { box-sizing: border-box; }
  html, body { width: 1123px; margin: 0; padding: 0; overflow: hidden; font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #0f172a; font-size: 10px; line-height: 1.32; background: #ffffff; }
  h1, h2, h3, h4 { margin: 0; font-weight: 700; }
  .page { width: 1123px; height: 794px; overflow: hidden; padding: 32px 42px; background: #ffffff; }
  .header { display: flex; justify-content: space-between; align-items: flex-end; gap: 24px; border-bottom: 3px solid #0f172a; padding-bottom: 10px; margin-bottom: 12px; }
  .header .title { font-size: 20px; line-height: 1.15; letter-spacing: 0; }
  .header .sub { font-size: 10px; line-height: 1.3; color: #475569; margin-top: 2px; }
  .header .meta { flex: 0 0 270px; text-align: right; font-size: 10px; color: #334155; }
  .header .meta b { color: #0f172a; }

  .kpi-grid { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 8px; margin-bottom: 10px; }
  .kpi { min-width: 0; border: 1px solid #e2e8f0; border-radius: 8px; padding: 8px 9px; background: #f8fafc; }
  .kpi .k-label { font-size: 8px; line-height: 1.25; letter-spacing: 0.08em; text-transform: uppercase; color: #64748b; }
  .kpi .k-value { font-size: 15px; line-height: 1.15; font-weight: 800; color: #0f172a; margin-top: 2px; overflow-wrap: anywhere; }
  .kpi .k-sub { font-size: 8px; line-height: 1.25; color: #64748b; margin-top: 2px; }

  .delta { font-size: 8.5px; font-weight: 700; padding: 1px 5px; border-radius: 999px; margin-left: 4px; white-space: nowrap; }
  .delta.up { background: #dcfce7; color: #166534; }
  .delta.down { background: #fee2e2; color: #991b1b; }
  .delta.neutral { background: #f1f5f9; color: #475569; }

  .row-2 { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 10px; margin-bottom: 10px; }
  .card { min-width: 0; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 12px; background: #fff; }
  .card h3 { font-size: 10px; line-height: 1.25; text-transform: uppercase; letter-spacing: 0.08em; color: #475569; margin-bottom: 6px; }

  .proj-block { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .proj { }
  .proj .lg { font-size: 20px; line-height: 1.1; font-weight: 800; color: #1e3a8a; overflow-wrap: anywhere; }
  .proj .lbl { font-size: 9px; line-height: 1.25; color: #64748b; text-transform: uppercase; letter-spacing: 0.08em; }
  .proj .cmp { font-size: 9px; line-height: 1.3; color: #334155; margin-top: 2px; }

  .pace-wrap { margin-top: 10px; }
  .pace-row { display: flex; justify-content: space-between; gap: 12px; font-size: 9px; line-height: 1.25; color: #475569; margin-bottom: 3px; }
  .pace-bar { position: relative; height: 12px; background: #e2e8f0; border-radius: 999px; overflow: hidden; }
  .pace-bar .fill { position: absolute; left: 0; top: 0; bottom: 0; background: linear-gradient(90deg, #2563eb, #60a5fa); border-radius: 999px; }
  .pace-bar .marker { position: absolute; top: -3px; bottom: -3px; width: 2px; background: #ef4444; }
  .pace-legend { display: flex; flex-wrap: wrap; gap: 4px 12px; font-size: 8.5px; line-height: 1.25; color: #475569; margin-top: 4px; }
  .pace-legend .dot { display: inline-block; width: 8px; height: 8px; border-radius: 2px; vertical-align: middle; margin-right: 3px; }

  .cmp-table { width: 100%; border-collapse: collapse; font-size: 10px; }
  .cmp-table th, .cmp-table td { padding: 5px 6px; line-height: 1.25; text-align: right; }
  .cmp-table th { background: #f1f5f9; color: #475569; font-weight: 600; text-align: right; }
  .cmp-table th:first-child, .cmp-table td:first-child { text-align: left; }
  .cmp-table tr + tr td { border-top: 1px solid #f1f5f9; }

  .rank { }
  .rank h4 { font-size: 9px; line-height: 1.25; color: #475569; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 6px; }
  .rank-t { width: 100%; border-collapse: separate; border-spacing: 0 5px; }
  .rank-t td { height: 18px; padding: 0; font-size: 9.5px; line-height: 1; vertical-align: middle; }
  .rank-t td.name { max-width: 145px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .rank-t td.qty { text-align: right; padding-right: 6px; width: 26px; font-variant-numeric: tabular-nums; color: #334155; }
  .rank-t td.bar-cell { width: 60px; }
  .rank-t .bar { height: 6px; background: #e2e8f0; border-radius: 999px; overflow: hidden; }
  .rank-t .bar span { display: block; height: 100%; background: #2563eb; border-radius: 999px; }
  .rank .empty { font-size: 9px; color: #94a3b8; text-align: center; padding: 8px 0; }

  .ranks-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; margin-top: 14px; margin-bottom: 10px; }

  .teams-block { }
  .teams-block h2 { font-size: 14px; line-height: 1.25; margin-bottom: 6px; color: #0f172a; border-bottom: 2px solid #0f172a; padding-bottom: 4px; }
  .teams-t { width: 100%; border-collapse: collapse; font-size: 9.5px; }
  .teams-t th { background: #0f172a; color: #fff; padding: 7px 8px; text-align: left; font-weight: 600; font-size: 9px; line-height: 1.25; text-transform: uppercase; letter-spacing: 0.05em; }
  .teams-t td { padding: 7px 8px; line-height: 1.25; border-bottom: 1px solid #e2e8f0; vertical-align: middle; }
  .teams-t td.tname { max-width: 210px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 700; color: #0f172a; }
  .teams-t tr:nth-child(even) td { background: #f8fafc; }
  .muted { color: #64748b; font-size: 9px; }

  .best { margin-top: 6px; font-size: 9.5px; line-height: 1.3; color: #334155; }
  .footer { margin-top: 10px; font-size: 8px; color: #94a3b8; text-align: right; }
</style></head><body><div class="page">

  <div class="header">
    <div>
      <div class="title">Painel de Produtividade — ${esc(periodTitle(s.period))}</div>
      <div class="sub">Escopo: <b>${esc(s.scope_label)}</b> · Comparativo vs ${esc(previousLabel(s.period))}</div>
    </div>
    <div class="meta">
      <div><b>Líder:</b> ${esc(s.leader)}</div>
      <div><b>Supervisor:</b> ${esc(s.supervisor)}</div>
      <div><b>Gerado em:</b> ${esc(formatDateBR(new Date()))}</div>
    </div>
  </div>

  <div class="kpi-grid">
    ${kpi("Serviços", `${s.current.total} ${deltaBadge(s.current.total, s.previous.total)}`, `${previousLabel(s.period)}: ${s.previous.total}`)}
    ${kpi("Viabilidade", `${pctV}% ${deltaBadge(pctV, pctVPrev)}`, `${s.current.viable} viáveis · ${s.current.unviable} inviáveis`)}
    ${kpi("Negociações", `${s.current.negotiations} ${deltaBadge(s.current.negotiations, s.previous.negotiations)}`, `${previousLabel(s.period)}: ${s.previous.negotiations}`)}
    ${kpi("Total negociado", `${formatBRL(s.current.negotiated_value)}`, `${deltaBadge(s.current.negotiated_value, s.previous.negotiated_value)}`)}
    ${kpi("Expedientes / Média", `${s.current.shifts} · ${avgPerShift}`, "fechados · serviços por dia")}
  </div>

  <div class="row-2">
    <div class="card">
      <h3>${esc(projectionLabel(s.period))}</h3>
      <div class="proj-block">
        <div class="proj">
          <div class="lbl">Serviços projetados</div>
          <div class="lg">${s.projected.total}</div>
          <div class="cmp">${previousLabel(s.period)}: ${s.previous.total} · diferença: ${s.projected.total - s.previous.total >= 0 ? "+" : ""}${s.projected.total - s.previous.total}</div>
        </div>
        <div class="proj">
          <div class="lbl">Negociado projetado</div>
          <div class="lg">${formatBRL(s.projected.negotiated_value)}</div>
          <div class="cmp">${previousLabel(s.period)}: ${formatBRL(s.previous.negotiated_value)}</div>
        </div>
      </div>
      <div class="pace-wrap">
        <div class="pace-row"><span>Ritmo atual: <b>${s.current.total}</b> de <b>${paceTarget}</b> projetados</span><span>${pct(paceRatio)} da projeção</span></div>
        <div class="pace-bar">
          <div class="fill" style="width:${pct(paceRatio)}"></div>
          <div class="marker" style="left:${pct(elapsed)}"></div>
        </div>
        <div class="pace-legend">
          <span><span class="dot" style="background:#2563eb"></span>Produção atual</span>
          <span><span class="dot" style="background:#ef4444"></span>Tempo decorrido no ${periodLabel(s.period)} (${pct(elapsed)})</span>
        </div>
      </div>
      ${s.best_day ? `<div class="best">Melhor dia: <b>${esc(s.best_day.date)}</b> — ${s.best_day.qty} viáveis</div>` : ""}
    </div>

    <div class="card">
      <h3>Atual vs ${esc(previousLabel(s.period))}</h3>
      <table class="cmp-table">
        <thead><tr><th>Métrica</th><th>Anterior</th><th>Atual</th><th>Δ</th></tr></thead>
        <tbody>
          <tr><td>Total de serviços</td><td>${s.previous.total}</td><td><b>${s.current.total}</b></td><td>${deltaBadge(s.current.total, s.previous.total)}</td></tr>
          <tr><td>Viáveis</td><td>${s.previous.viable}</td><td><b>${s.current.viable}</b></td><td>${deltaBadge(s.current.viable, s.previous.viable)}</td></tr>
          <tr><td>Inviáveis</td><td>${s.previous.unviable}</td><td><b>${s.current.unviable}</b></td><td>${deltaBadge(s.current.unviable, s.previous.unviable)}</td></tr>
          <tr><td>Negociações</td><td>${s.previous.negotiations}</td><td><b>${s.current.negotiations}</b></td><td>${deltaBadge(s.current.negotiations, s.previous.negotiations)}</td></tr>
          <tr><td>Total negociado</td><td>${formatBRL(s.previous.negotiated_value)}</td><td><b>${formatBRL(s.current.negotiated_value)}</b></td><td>${deltaBadge(s.current.negotiated_value, s.previous.negotiated_value)}</td></tr>
          <tr><td>Viabilidade</td><td>${pctVPrev}%</td><td><b>${pctV}%</b></td><td>${deltaBadge(pctV, pctVPrev)}</td></tr>
        </tbody>
      </table>
    </div>
  </div>

  <div class="ranks-grid">
    ${rankTable("Top serviços (viáveis)", s.by_type)}
    ${rankTable("Top motivos de inviabilidade", s.top_reasons)}
    ${rankTable("Complementos mais usados", s.top_complements)}
    ${rankTable("Impactos recorrentes", s.top_impacts)}
  </div>

  ${
    s.teams.length > 0
      ? `<div class="teams-block">
          <h2>Desempenho por equipe — ${esc(periodTitle(s.period))}</h2>
          <table class="teams-t">
            <thead><tr>
              <th>Equipe</th><th>Exped.</th><th>Serviços</th><th>Viáveis</th><th>Inviáv.</th><th>Negoc.</th><th>Negociado</th>
            </tr></thead>
            <tbody>${teamsRows}</tbody>
          </table>
        </div>`
      : ""
  }

  <div class="footer">GPVA · Painel do Líder — relatório em PDF gerado automaticamente.</div>
</div>
</body></html>`;
}

export async function renderLeaderPdfBlob(input: LeaderPdfInput): Promise<Blob> {
  const { default: jsPDF } = await import("jspdf");

  const PAGE_W = 1123;
  const PAGE_H = 794;
  const SCALE = 2;
  const M = 42;
  const CONTENT_W = PAGE_W - M * 2;
  const pdf = new jsPDF({ orientation: "landscape", unit: "pt", format: [PAGE_W, PAGE_H] });

  const createPage = () => {
    const canvas = document.createElement("canvas");
    canvas.width = PAGE_W * SCALE;
    canvas.height = PAGE_H * SCALE;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Não foi possível preparar o PDF.");
    ctx.scale(SCALE, SCALE);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, PAGE_W, PAGE_H);
    ctx.textBaseline = "alphabetic";
    ctx.lineJoin = "round";
    return { canvas, ctx };
  };

  const font = (ctx: CanvasRenderingContext2D, size: number, weight: 400 | 600 | 700 | 800 = 400, hex = "#0f172a") => {
    ctx.font = `${weight} ${size}px Arial, Helvetica, sans-serif`;
    ctx.fillStyle = hex;
    ctx.textAlign = "left";
  };
  const text = (ctx: CanvasRenderingContext2D, value: string | number, x: number, y: number, align: CanvasTextAlign = "left") => {
    ctx.textAlign = align;
    ctx.fillText(String(value), x, y);
  };
  const fit = (ctx: CanvasRenderingContext2D, value: string | number, maxWidth: number) => {
    const str = String(value ?? "-");
    if (ctx.measureText(str).width <= maxWidth) return str;
    let out = str;
    while (out.length > 1 && ctx.measureText(`${out}...`).width > maxWidth) out = out.slice(0, -1);
    return `${out}...`;
  };
  const line = (ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, hex = "#e2e8f0", width = 1) => {
    ctx.strokeStyle = hex;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  };
  const box = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, bg = "#ffffff", border = "#e2e8f0", r = 8) => {
    ctx.fillStyle = bg;
    ctx.strokeStyle = border;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.fill();
    ctx.stroke();
  };
  const delta = (cur: number, prev: number) => {
    const d = deltaPct(cur, prev);
    if (d === null) return { label: "-", bg: "#f1f5f9", fg: "#475569" };
    return {
      label: `${d > 0 ? "+" : ""}${d}%`,
      bg: d > 0 ? "#dcfce7" : d < 0 ? "#fee2e2" : "#f1f5f9",
      fg: d > 0 ? "#166534" : d < 0 ? "#991b1b" : "#475569",
    };
  };
  const pill = (ctx: CanvasRenderingContext2D, label: string, x: number, y: number, d: ReturnType<typeof delta>) => {
    font(ctx, 10, 800, d.fg);
    const w = Math.max(34, ctx.measureText(label).width + 14);
    ctx.fillStyle = d.bg;
    ctx.beginPath();
    ctx.roundRect(x, y - 14, w, 18, 9);
    ctx.fill();
    ctx.fillStyle = d.fg === "#166534" ? "#064e3b" : d.fg;
    text(ctx, label, x + w / 2, y, "center");
    return w;
  };
  const bar = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, pctValue: number, fillHex = "#2563eb") => {
    ctx.fillStyle = "#e2e8f0";
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, h / 2);
    ctx.fill();
    ctx.fillStyle = fillHex;
    ctx.beginPath();
    ctx.roundRect(x, y, Math.max(h, w * Math.max(0, Math.min(1, pctValue))), h, h / 2);
    ctx.fill();
  };
  const header = (ctx: CanvasRenderingContext2D) => {
    font(ctx, 22, 400);
    text(ctx, `Painel de Produtividade — ${periodTitle(input.period)}`, M, 58);
    font(ctx, 10, 700, "#475569");
    text(ctx, `Escopo: ${input.scope_label} · Comparativo vs ${previousLabel(input.period)}`, M, 73);
    font(ctx, 9, 700);
    text(ctx, "Líder:", PAGE_W - M - 190, 48);
    text(ctx, "Supervisor:", PAGE_W - M - 190, 61);
    text(ctx, "Gerado em:", PAGE_W - M - 190, 74);
    font(ctx, 9, 400, "#334155");
    text(ctx, fit(ctx, input.leader, 118), PAGE_W - M, 48, "right");
    text(ctx, fit(ctx, input.supervisor, 118), PAGE_W - M, 61, "right");
    text(ctx, formatDateBR(new Date()), PAGE_W - M, 74, "right");
    line(ctx, M, 82, PAGE_W - M, 82, "#0f172a", 3);
  };
  const drawKpi = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, label: string, value: string, d: ReturnType<typeof delta> | null, sub: string) => {
    box(ctx, x, y, w, 56, "#f8fafc");
    font(ctx, 8, 400, "#64748b");
    text(ctx, label.toUpperCase(), x + 10, y + 19);
    font(ctx, value.length > 14 ? 13 : 16, 800);
    text(ctx, fit(ctx, value, w - 55), x + 10, y + 36);
    if (d) pill(ctx, d.label, x + w - 43, y + 36, d);
    font(ctx, 8, 400, "#64748b");
    text(ctx, fit(ctx, sub, w - 20), x + 10, y + 49);
  };
  const drawRank = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, title: string, rows: { name: string; qty: number }[]) => {
    font(ctx, 10, 800, "#475569");
    text(ctx, title.toUpperCase(), x, y);
    const top = rows.slice(0, 5);
    if (top.length === 0) {
      font(ctx, 9, 400, "#94a3b8");
      text(ctx, "Sem dados", x + w / 2, y + 32, "center");
      return;
    }
    const max = top[0].qty || 1;
    top.forEach((row, index) => {
      const yy = y + 18 + index * 19;
      font(ctx, 10, 400, "#0f172a");
      text(ctx, fit(ctx, row.name, w - 116), x, yy);
      font(ctx, 10, 400, "#334155");
      text(ctx, row.qty, x + w - 88, yy, "right");
      bar(ctx, x + w - 78, yy - 8, 78, 7, row.qty / max);
    });
  };
  const drawFooter = (ctx: CanvasRenderingContext2D) => {
    font(ctx, 8, 400, "#94a3b8");
    text(ctx, "GPVA · Painel do Líder — relatório em PDF gerado automaticamente.", PAGE_W - M, PAGE_H - 34, "right");
  };

  const pctV = input.current.total ? Math.round((input.current.viable / input.current.total) * 100) : 0;
  const pctVPrev = input.previous.total ? Math.round((input.previous.viable / input.previous.total) * 100) : 0;
  const avgPerShift = input.current.shifts ? +(input.current.total / input.current.shifts).toFixed(1) : 0;
  const elapsed = elapsedRatio(input.period);
  const paceTarget = input.projected.total;
  const paceRatio = paceTarget ? Math.min(1, input.current.total / paceTarget) : 0;

  const { canvas: page1, ctx } = createPage();
  header(ctx);
  const kpiW = (CONTENT_W - 32) / 5;
  [
    ["Serviços", String(input.current.total), delta(input.current.total, input.previous.total), `${previousLabel(input.period)}: ${input.previous.total}`],
    ["Viabilidade", `${pctV}%`, delta(pctV, pctVPrev), `${input.current.viable} viáveis · ${input.current.unviable} inviáveis`],
    ["Negociações", String(input.current.negotiations), delta(input.current.negotiations, input.previous.negotiations), `${previousLabel(input.period)}: ${input.previous.negotiations}`],
    ["Total negociado", formatBRL(input.current.negotiated_value), delta(input.current.negotiated_value, input.previous.negotiated_value), ""],
    ["Expedientes / Média", `${input.current.shifts} · ${avgPerShift}`, null, "fechados · serviços por dia"],
  ].forEach(([label, value, d, sub], i) => drawKpi(ctx, M + i * (kpiW + 8), 98, kpiW, label as string, value as string, d as ReturnType<typeof delta> | null, sub as string));

  const cardY = 166;
  const cardW = (CONTENT_W - 10) / 2;
  box(ctx, M, cardY, cardW, 178);
  box(ctx, M + cardW + 10, cardY, cardW, 178);
  font(ctx, 10, 800, "#475569");
  text(ctx, projectionLabel(input.period).toUpperCase(), M + 12, cardY + 22);
  font(ctx, 9, 400, "#64748b");
  text(ctx, "SERVIÇOS PROJETADOS", M + 12, cardY + 48);
  text(ctx, "NEGOCIADO PROJETADO", M + 250, cardY + 48);
  font(ctx, 24, 800, "#1e3a8a");
  text(ctx, input.projected.total, M + 12, cardY + 72);
  text(ctx, formatBRL(input.projected.negotiated_value), M + 250, cardY + 72);
  font(ctx, 9, 400, "#334155");
  text(ctx, `${previousLabel(input.period)}: ${input.previous.total} · diferença: ${input.projected.total - input.previous.total >= 0 ? "+" : ""}${input.projected.total - input.previous.total}`, M + 12, cardY + 88);
  text(ctx, `${previousLabel(input.period)}: ${formatBRL(input.previous.negotiated_value)}`, M + 250, cardY + 88);
  font(ctx, 9, 400, "#475569");
  text(ctx, `Ritmo atual: ${input.current.total} de ${paceTarget} projetados`, M + 12, cardY + 116);
  text(ctx, `${pct(paceRatio)} da projeção`, M + cardW - 12, cardY + 116, "right");
  bar(ctx, M + 12, cardY + 124, cardW - 24, 12, paceRatio, "#3b82f6");
  const markerX = M + 12 + (cardW - 24) * elapsed;
  line(ctx, markerX, cardY + 121, markerX, cardY + 139, "#ef4444", 2);
  font(ctx, 8, 400, "#475569");
  ctx.fillStyle = "#2563eb";
  ctx.fillRect(M + 12, cardY + 149, 7, 7);
  text(ctx, "Produção atual", M + 24, cardY + 156);
  ctx.fillStyle = "#ef4444";
  ctx.fillRect(M + 104, cardY + 149, 7, 7);
  text(ctx, `Tempo decorrido (${pct(elapsed)})`, M + 116, cardY + 156);
  if (input.best_day) {
    font(ctx, 9, 400, "#334155");
    text(ctx, `Melhor dia: ${input.best_day.date} — ${input.best_day.qty} viáveis`, M + 12, cardY + 172);
  }

  const tx = M + cardW + 22;
  font(ctx, 10, 800, "#475569");
  text(ctx, `ATUAL VS ${previousLabel(input.period).toUpperCase()}`, tx, cardY + 22);
  const rows = [
    ["Métrica", "Anterior", "Atual", "Δ"],
    ["Total de serviços", String(input.previous.total), String(input.current.total), delta(input.current.total, input.previous.total)],
    ["Viáveis", String(input.previous.viable), String(input.current.viable), delta(input.current.viable, input.previous.viable)],
    ["Inviáveis", String(input.previous.unviable), String(input.current.unviable), delta(input.current.unviable, input.previous.unviable)],
    ["Negociações", String(input.previous.negotiations), String(input.current.negotiations), delta(input.current.negotiations, input.previous.negotiations)],
    ["Total negociado", formatBRL(input.previous.negotiated_value), formatBRL(input.current.negotiated_value), delta(input.current.negotiated_value, input.previous.negotiated_value)],
    ["Viabilidade", `${pctVPrev}%`, `${pctV}%`, delta(pctV, pctVPrev)],
  ];
  const tableX = tx;
  const tableY = cardY + 40;
  const col = [0, 150, 270, 390];
  ctx.fillStyle = "#f1f5f9";
  ctx.fillRect(tableX, tableY, cardW - 24, 20);
  rows.forEach((r, i) => {
    const yy = tableY + 15 + i * 20;
    if (i === 0) font(ctx, 9, 700, "#475569");
    else font(ctx, 10, i === 5 ? 700 : 400, "#0f172a");
    text(ctx, r[0] as string, tableX + col[0] + 8, yy);
    text(ctx, r[1] as string, tableX + col[1] + 92, yy, "right");
    text(ctx, r[2] as string, tableX + col[2] + 92, yy, "right");
    if (i > 0) pill(ctx, (r[3] as ReturnType<typeof delta>).label, tableX + col[3] + 44, yy, r[3] as ReturnType<typeof delta>);
    if (i > 0) line(ctx, tableX, yy + 7, tableX + cardW - 24, yy + 7, "#f1f5f9");
  });

  const rankY = 375;
  const rankW = (CONTENT_W - 42) / 4;
  drawRank(ctx, M, rankY, rankW, "Top serviços (viáveis)", input.by_type);
  drawRank(ctx, M + rankW + 14, rankY, rankW, "Top motivos de inviabilidade", input.top_reasons);
  drawRank(ctx, M + (rankW + 14) * 2, rankY, rankW, "Complementos mais usados", input.top_complements);
  drawRank(ctx, M + (rankW + 14) * 3, rankY, rankW, "Impactos recorrentes", input.top_impacts);
  drawFooter(ctx);
  pdf.addImage(page1.toDataURL("image/jpeg", 0.95), "JPEG", 0, 0, PAGE_W, PAGE_H, undefined, "FAST");

  if (input.teams.length > 0) {
    pdf.addPage([PAGE_W, PAGE_H], "landscape");
    const { canvas: page2, ctx: ctx2 } = createPage();
    font(ctx2, 15, 800);
    text(ctx2, `Desempenho por equipe — ${periodTitle(input.period)}`, M, 54);
    line(ctx2, M, 64, PAGE_W - M, 64, "#0f172a", 3);
    const x = M;
    let y = 72;
    const widths = [340, 80, 110, 110, 90, 90, 190];
    const heads = ["Equipe", "Exped.", "Serviços", "Viáveis", "Inviáv.", "Negoc.", "Negociado"];
    ctx2.fillStyle = "#0f172a";
    ctx2.fillRect(x, y, CONTENT_W, 28);
    font(ctx2, 9, 800, "#ffffff");
    let cx = x;
    heads.forEach((h, i) => {
      text(ctx2, h.toUpperCase(), cx + 10, y + 18);
      cx += widths[i] ?? 0;
    });
    y += 28;
    input.teams.slice(0, 22).forEach((team, index) => {
      if (index % 2 === 1) {
        ctx2.fillStyle = "#f8fafc";
        ctx2.fillRect(x, y, CONTENT_W, 27);
      }
      font(ctx2, 10, 700);
      text(ctx2, fit(ctx2, team.team_name, widths[0] - 18), x + 10, y + 18);
      font(ctx2, 10, 400);
      const teamPctV = team.current.total ? Math.round((team.current.viable / team.current.total) * 100) : 0;
      const values = [
        String(team.current.shifts),
        String(team.current.total),
        `${team.current.viable} (${teamPctV}%)`,
        String(team.current.unviable),
        String(team.current.negotiations),
        formatBRL(team.current.negotiated_value),
      ];
      cx = x + widths[0];
      values.forEach((value, i) => {
        const width = widths[i + 1] ?? 0;
        text(ctx2, value, cx + width / 2, y + 18, "center");
        cx += width;
      });
      pill(ctx2, delta(team.current.total, team.previous.total).label, x + widths[0] + 74, y + 18, delta(team.current.total, team.previous.total));
      line(ctx2, x, y + 27, PAGE_W - M, y + 27, "#e2e8f0");
      y += 27;
    });
    drawFooter(ctx2);
    pdf.addImage(page2.toDataURL("image/jpeg", 0.95), "JPEG", 0, 0, PAGE_W, PAGE_H, undefined, "FAST");
  }

  return pdf.output("blob");
}