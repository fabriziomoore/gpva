export function formatBRL(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  }).format(value || 0);
}

export function formatDateBR(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("pt-BR");
}

export function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

export function formatDurationMin(totalMinutes: number): string {
  if (!Number.isFinite(totalMinutes) || totalMinutes <= 0) return "—";
  const mins = Math.round(totalMinutes);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${pad2(m)}min` : `${m}min`;
}
/** Primeiro nome de um nome cadastrado (alguns colaboradores foram salvos com o nome completo). */
export function firstName(name: string | null | undefined): string {
  return (name ?? "").trim().split(/\s+/)[0] ?? "";
}

/** "André e Marcley" — só o primeiro nome de cada colaborador, como nos cards de equipe. */
export function collaboratorsLabel(c1: string | null | undefined, c2: string | null | undefined): string {
  return [firstName(c1), firstName(c2)].filter(Boolean).join(" e ");
}

/** true se a data (ISO) cai no dia de hoje, no fuso do aparelho. */
export function isToday(iso: string | null | undefined): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}
