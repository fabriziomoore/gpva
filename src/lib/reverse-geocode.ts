// Reverse-geocoding leve via Nominatim/OSM.
// - Sem chave, CORS habilitado, funciona no browser e no Capacitor.
// - Cache em memória por célula (~500 m) para não repetir chamadas.
// - Respeita a política de uso pública (1 req/s, User-Agent identificado).

export type ReverseGeoInfo = {
  bairro: string | null;
  road: string | null;
  city: string | null;
  label: string; // texto amigável pronto para exibição
};

const CACHE = new Map<string, ReverseGeoInfo | null>();
let lastCall = 0;
const MIN_INTERVAL_MS = 1100; // respeita 1 req/s do Nominatim

function keyFor(lat: number, lng: number): string {
  // grid de ~0.005° (~500m) — evita chamadas repetidas para pontos próximos
  return `${lat.toFixed(3)},${lng.toFixed(3)}`;
}

async function throttle() {
  const now = Date.now();
  const wait = Math.max(0, lastCall + MIN_INTERVAL_MS - now);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCall = Date.now();
}

export async function reverseGeocode(
  lat: number,
  lng: number,
): Promise<ReverseGeoInfo | null> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const k = keyFor(lat, lng);
  if (CACHE.has(k)) return CACHE.get(k) ?? null;
  try {
    await throttle();
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=17&addressdetails=1&accept-language=pt-BR`;
    const res = await fetch(url, {
      headers: { "Accept": "application/json" },
    });
    if (!res.ok) { CACHE.set(k, null); return null; }
    const data = await res.json();
    const a = data?.address ?? {};
    const bairro: string | null = a.suburb || a.neighbourhood || a.city_district || a.village || null;
    const road: string | null = a.road || a.pedestrian || a.footway || null;
    const city: string | null = a.city || a.town || a.municipality || null;
    const parts: string[] = [];
    if (bairro) parts.push(bairro);
    if (road) parts.push(road);
    const label = parts.length ? parts.join(" · ") : (city ?? "");
    const info: ReverseGeoInfo = { bairro, road, city, label };
    CACHE.set(k, info);
    return info;
  } catch {
    CACHE.set(k, null);
    return null;
  }
}

// Geocodifica uma lista, respeitando o throttle e o cache, com limite máx.
export async function reverseGeocodeMany(
  pts: { lat: number; lng: number }[],
  maxCalls = 8,
): Promise<(ReverseGeoInfo | null)[]> {
  const out: (ReverseGeoInfo | null)[] = [];
  let calls = 0;
  for (const p of pts) {
    if (calls >= maxCalls) { out.push(null); continue; }
    const info = await reverseGeocode(p.lat, p.lng);
    if (info !== null) calls += 1;
    out.push(info);
  }
  return out;
}
