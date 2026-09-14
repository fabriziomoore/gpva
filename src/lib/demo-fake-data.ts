// Dados fictícios para telas de Produtividade e Variável quando a equipe é
// de teste (`equipes.is_test = true`). Gerados inteiramente no cliente, sem
// nenhuma leitura ou escrita no banco — por isso é impossível esses números
// aparecerem em qualquer painel de líder, admin ou de outra equipe: eles
// nunca existem fora da memória do navegador de quem está com uma conta de
// teste aberta. Servem só para apresentação/demonstração do app.

type FakeServiceRow = {
  id: string;
  service_type_name: string;
  is_negotiation: boolean;
  viable: boolean;
  negotiated_value: number | null;
  created_at: string;
};

// PRNG determinístico (mulberry32) — mesma equipe de teste sempre vê os
// mesmos números na mesma sessão de navegação, em vez de trocar a cada
// re-render (o que pareceria um bug durante uma apresentação).
function mulberry32(seed: number) {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  }
  return h;
}

const VIABLE_TYPES = [
  "Consumo",
  "Hidrometria",
  "Corte Cavalete",
  "Religação no cavalete",
  "Instalação de HD",
  "Cadastral",
  "Revisita",
];
const INVIABLE_TYPES = ["Consumo", "Hidrometria", "Corte Cavalete", "Cadastral"];

function isBusinessDay(d: Date): boolean {
  const day = d.getDay();
  return day !== 0; // folga aos domingos, como uma equipe de campo real
}

/**
 * Gera um histórico fictício de ~12 meses de serviços para uma equipe de
 * teste — mistura de viáveis/inviáveis e negociações com valores, com mais
 * volume nos dias/meses recentes (equipe "ativa"), pra ficar visualmente
 * rico em Produtividade e Variável.
 */
export function generateFakeServiceRows(teamId: string): FakeServiceRow[] {
  const rng = mulberry32(hashSeed(teamId || "demo"));
  const rows: FakeServiceRow[] = [];
  const now = new Date();
  let idCounter = 0;

  for (let monthsAgo = 11; monthsAgo >= 0; monthsAgo--) {
    const monthDate = new Date(now.getFullYear(), now.getMonth() - monthsAgo, 1);
    // Mais serviços em meses recentes (equipe crescendo/ativa).
    const recencyBoost = 1 + (11 - monthsAgo) * 0.12;
    const daysInMonth = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0).getDate();

    for (let day = 1; day <= daysInMonth; day++) {
      const d = new Date(monthDate.getFullYear(), monthDate.getMonth(), day);
      if (d > now) continue;
      if (!isBusinessDay(d)) continue;
      if (rng() < 0.22) continue; // dias sem expediente registrado

      const servicesToday = Math.round((1 + rng() * 5) * Math.min(recencyBoost, 1.8));
      for (let i = 0; i < servicesToday; i++) {
        const hour = 7 + Math.floor(rng() * 9);
        const minute = Math.floor(rng() * 60);
        const created = new Date(d.getFullYear(), d.getMonth(), d.getDate(), hour, minute);
        if (created > now) continue;

        const isNegotiation = rng() < 0.18;
        const viable = isNegotiation ? true : rng() < 0.82;
        const typeName = isNegotiation
          ? "Negociação"
          : viable
            ? VIABLE_TYPES[Math.floor(rng() * VIABLE_TYPES.length)]
            : INVIABLE_TYPES[Math.floor(rng() * INVIABLE_TYPES.length)];

        rows.push({
          id: `demo-${teamId}-${idCounter++}`,
          service_type_name: typeName,
          is_negotiation: isNegotiation,
          viable,
          negotiated_value: isNegotiation ? Math.round((80 + rng() * 650) / 5) * 5 : null,
          created_at: created.toISOString(),
        });
      }
    }
  }

  return rows.sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export type FakeShiftEntry = { id: string; started_at: string; status: "closed" };

/** Histórico fictício de expedientes fechados, pra lista "Histórico" de Produtividade. */
export function generateFakeShiftHistory(teamId: string, count = 12): FakeShiftEntry[] {
  const rng = mulberry32(hashSeed(teamId || "demo") ^ 0x51ed270b);
  const now = new Date();
  const out: FakeShiftEntry[] = [];
  let d = new Date(now);
  while (out.length < count) {
    d = new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1);
    if (!isBusinessDay(d)) continue;
    if (rng() < 0.15) continue;
    d.setHours(7 + Math.floor(rng() * 2), Math.floor(rng() * 60), 0, 0);
    out.push({ id: `demo-shift-${teamId}-${out.length}`, started_at: d.toISOString(), status: "closed" });
  }
  return out;
}
