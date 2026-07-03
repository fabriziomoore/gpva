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
        <td>${formatBRL(t.variable_estimated)}</td>
      </tr>`;
    })
    .join("");

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"/>
<title>Relatório de Produtividade — ${esc(periodTitle(s.period))}</title>
<style>
  @page { size: A4 landscape; margin: 10mm 12mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #0f172a; font-size: 10px; }
  h1, h2, h3, h4 { margin: 0; font-weight: 700; }
  .page { padding: 0; }
  .header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 3px solid #0f172a; padding-bottom: 8px; margin-bottom: 10px; }
  .header .title { font-size: 20px; letter-spacing: -0.02em; }
  .header .sub { font-size: 10px; color: #475569; margin-top: 2px; }
  .header .meta { text-align: right; font-size: 10px; color: #334155; }
  .header .meta b { color: #0f172a; }

  .kpi-grid { display: grid; grid-template-columns: repeat(6, 1fr); gap: 6px; margin-bottom: 10px; }
  .kpi { border: 1px solid #e2e8f0; border-radius: 8px; padding: 8px 10px; background: #f8fafc; }
  .kpi .k-label { font-size: 8px; letter-spacing: 0.08em; text-transform: uppercase; color: #64748b; }
  .kpi .k-value { font-size: 16px; font-weight: 800; color: #0f172a; margin-top: 2px; }
  .kpi .k-sub { font-size: 8px; color: #64748b; margin-top: 2px; }

  .delta { font-size: 8.5px; font-weight: 700; padding: 1px 5px; border-radius: 999px; margin-left: 4px; white-space: nowrap; }
  .delta.up { background: #dcfce7; color: #166534; }
  .delta.down { background: #fee2e2; color: #991b1b; }
  .delta.neutral { background: #f1f5f9; color: #475569; }

  .row-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 10px; }
  .card { border: 1px solid #e2e8f0; border-radius: 10px; padding: 10px 12px; background: #fff; }
  .card h3 { font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; color: #475569; margin-bottom: 6px; }

  .proj-block { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .proj { }
  .proj .lg { font-size: 22px; font-weight: 800; color: #1e3a8a; }
  .proj .lbl { font-size: 9px; color: #64748b; text-transform: uppercase; letter-spacing: 0.08em; }
  .proj .cmp { font-size: 9px; color: #334155; margin-top: 2px; }

  .pace-wrap { margin-top: 10px; }
  .pace-row { display: flex; justify-content: space-between; font-size: 9px; color: #475569; margin-bottom: 3px; }
  .pace-bar { position: relative; height: 12px; background: #e2e8f0; border-radius: 999px; overflow: hidden; }
  .pace-bar .fill { position: absolute; left: 0; top: 0; bottom: 0; background: linear-gradient(90deg, #2563eb, #60a5fa); border-radius: 999px; }
  .pace-bar .marker { position: absolute; top: -3px; bottom: -3px; width: 2px; background: #ef4444; }
  .pace-legend { display: flex; gap: 12px; font-size: 8.5px; color: #475569; margin-top: 4px; }
  .pace-legend .dot { display: inline-block; width: 8px; height: 8px; border-radius: 2px; vertical-align: middle; margin-right: 3px; }

  .cmp-table { width: 100%; border-collapse: collapse; font-size: 10px; }
  .cmp-table th, .cmp-table td { padding: 4px 6px; text-align: right; }
  .cmp-table th { background: #f1f5f9; color: #475569; font-weight: 600; text-align: right; }
  .cmp-table th:first-child, .cmp-table td:first-child { text-align: left; }
  .cmp-table tr + tr td { border-top: 1px solid #f1f5f9; }

  .rank { }
  .rank h4 { font-size: 9px; color: #475569; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 4px; }
  .rank-t { width: 100%; border-collapse: collapse; }
  .rank-t td { padding: 2px 0; font-size: 9.5px; vertical-align: middle; }
  .rank-t td.name { max-width: 130px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .rank-t td.qty { text-align: right; padding-right: 6px; width: 26px; font-variant-numeric: tabular-nums; color: #334155; }
  .rank-t td.bar-cell { width: 60px; }
  .rank-t .bar { height: 5px; background: #e2e8f0; border-radius: 999px; overflow: hidden; }
  .rank-t .bar span { display: block; height: 100%; background: #2563eb; border-radius: 999px; }
  .rank .empty { font-size: 9px; color: #94a3b8; text-align: center; padding: 8px 0; }

  .ranks-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 10px; }

  .teams-block { page-break-before: always; }
  .teams-block h2 { font-size: 14px; margin-bottom: 6px; color: #0f172a; border-bottom: 2px solid #0f172a; padding-bottom: 4px; }
  .teams-t { width: 100%; border-collapse: collapse; font-size: 9.5px; }
  .teams-t th { background: #0f172a; color: #fff; padding: 6px 8px; text-align: left; font-weight: 600; font-size: 9px; text-transform: uppercase; letter-spacing: 0.05em; }
  .teams-t td { padding: 6px 8px; border-bottom: 1px solid #e2e8f0; }
  .teams-t td.tname { font-weight: 700; color: #0f172a; }
  .teams-t tr:nth-child(even) td { background: #f8fafc; }
  .muted { color: #64748b; font-size: 9px; }

  .best { margin-top: 6px; font-size: 9.5px; color: #334155; }
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
              <th>Equipe</th><th>Exped.</th><th>Serviços</th><th>Viáveis</th><th>Inviáv.</th><th>Negoc.</th><th>Negociado</th><th>Variável est.</th>
            </tr></thead>
            <tbody>${teamsRows}</tbody>
          </table>
        </div>`
      : ""
  }

  <div class="footer">GPVA · Painel do Líder — impressão em paisagem, use "Salvar como PDF" no diálogo do navegador.</div>
</div>
<script>window.addEventListener("load", () => setTimeout(() => window.print(), 400));</script>
</body></html>`;
}