export type Period = "day" | "week" | "month" | "year";

export type Range = { start: Date; end: Date };

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function periodRange(period: Period, ref: Date = new Date()): Range {
  const start = startOfDay(ref);
  const end = new Date(start);
  if (period === "day") {
    end.setDate(end.getDate() + 1);
  } else if (period === "week") {
    start.setDate(start.getDate() - start.getDay());
    end.setTime(start.getTime());
    end.setDate(end.getDate() + 7);
  } else if (period === "month") {
    start.setDate(1);
    end.setTime(start.getTime());
    end.setMonth(end.getMonth() + 1);
  } else {
    start.setMonth(0, 1);
    end.setTime(start.getTime());
    end.setFullYear(end.getFullYear() + 1);
  }
  return { start, end };
}

export function previousRange(period: Period, ref: Date = new Date()): Range {
  const cur = periodRange(period, ref);
  const prevRef = new Date(cur.start);
  if (period === "day") prevRef.setDate(prevRef.getDate() - 1);
  else if (period === "week") prevRef.setDate(prevRef.getDate() - 7);
  else if (period === "month") prevRef.setMonth(prevRef.getMonth() - 1);
  else prevRef.setFullYear(prevRef.getFullYear() - 1);
  return periodRange(period, prevRef);
}

export function inRange(iso: string, r: Range): boolean {
  const t = new Date(iso).getTime();
  return t >= r.start.getTime() && t < r.end.getTime();
}

export function deltaPct(current: number, previous: number): number | null {
  if (!previous) return current > 0 ? 100 : null;
  return Math.round(((current - previous) / previous) * 100);
}

export function paceProjection(
  currentValue: number,
  period: Period,
  ref: Date = new Date(),
): number {
  const r = periodRange(period, ref);
  const total = r.end.getTime() - r.start.getTime();
  const elapsed = Math.max(1, ref.getTime() - r.start.getTime());
  const ratio = Math.min(1, elapsed / total);
  if (ratio <= 0) return currentValue;
  return Math.round(currentValue / ratio);
}

// Últimos N períodos equivalentes (exclui o período atual).
// Útil para calcular médias históricas usadas na projeção ponderada.
export function historicalRanges(
  period: Period,
  ref: Date = new Date(),
  count = 3,
): Range[] {
  const ranges: Range[] = [];
  let cursor = ref;
  for (let i = 0; i < count; i++) {
    const cur = periodRange(period, cursor);
    const prevRef = new Date(cur.start);
    if (period === "day") prevRef.setDate(prevRef.getDate() - 1);
    else if (period === "week") prevRef.setDate(prevRef.getDate() - 7);
    else if (period === "month") prevRef.setMonth(prevRef.getMonth() - 1);
    else prevRef.setFullYear(prevRef.getFullYear() - 1);
    ranges.push(periodRange(period, prevRef));
    cursor = prevRef;
  }
  return ranges;
}

// Projeção ponderada: mistura o ritmo atual extrapolado com a média
// histórica dos últimos períodos equivalentes. O peso do ritmo cresce
// conforme o período avança, e o peso do histórico diminui.
//   - início do período  → predomina o histórico (estável)
//   - fim do período     → predomina o ritmo atual (converge para o real)
export function blendedProjection(
  currentValue: number,
  historicalAvg: number,
  period: Period,
  ref: Date = new Date(),
): number {
  const ratio = elapsedRatio(period, ref);
  if (ratio <= 0) return Math.round(historicalAvg);
  const paceExtrapolated = currentValue / ratio;
  // Sem histórico (equipe nova): projeção puramente pelo ritmo atual.
  if (historicalAvg <= 0) return Math.round(paceExtrapolated);
  // Shrinkage Bayesiano sobre a *taxa* diária:
  //   taxa_observada = currentValue / dias_decorridos
  //   taxa_prior     = historicalAvg / duracao_periodo
  //   taxa_blend     = (n_obs * taxa_obs + n_prior * taxa_prior) / (n_obs + n_prior)
  // n_prior = 15% da duração do período (≈ 4,6 dias num mês). Assim, cada
  // dia observado reduz proporcionalmente o peso do histórico — no início
  // o prior segura oscilações, mas com poucos dias a mais a projeção já
  // acompanha o ritmo real.
  const nObs = ratio; // fração do período (unidade normalizada)
  // Peso do prior decai para 0 no fim do período: no último dia a
  // projeção equivale ao valor real acumulado, sem mais influência do histórico.
  const nPrior = 0.15 * (1 - ratio);
  if (nPrior <= 0) return Math.round(currentValue);
  const observedRate = currentValue / nObs;
  const priorRate = historicalAvg; // já é "total do período"
  const blendedTotal = (nObs * observedRate + nPrior * priorRate) / (nObs + nPrior);
  return Math.round(blendedTotal);
}

export function elapsedRatio(period: Period, ref: Date = new Date()): number {
  const r = periodRange(period, ref);
  const total = r.end.getTime() - r.start.getTime();
  const elapsed = Math.max(0, ref.getTime() - r.start.getTime());
  return Math.min(1, Math.max(0, elapsed / total));
}

export function periodLabel(period: Period): string {
  return period === "day"
    ? "hoje"
    : period === "week"
      ? "esta semana"
      : period === "month"
        ? "este mês"
        : "este ano";
}

export function previousLabel(period: Period): string {
  return period === "day"
    ? "ontem"
    : period === "week"
      ? "semana anterior"
      : period === "month"
        ? "mês anterior"
        : "ano anterior";
}

export function projectionLabel(period: Period): string {
  return period === "day"
    ? "Projeção até o fim do dia"
    : period === "week"
      ? "Projeção até domingo"
      : period === "month"
        ? "Projeção de fechamento do mês"
        : "Projeção de fechamento do ano";
}