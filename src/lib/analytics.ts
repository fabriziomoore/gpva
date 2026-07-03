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