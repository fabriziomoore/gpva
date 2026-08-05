// Renderer de mapa (OSM tiles) para embutir no PDF.
// Centralizado em Maricá/RJ por padrão, plota pontos verdes (viáveis) e
// vermelhos (inviáveis). Retorna dataURL (image/jpeg) pronto para
// pdf.addImage(). Falha silenciosamente (retorna null) sem quebrar o PDF.

export type PdfMapPoint = { lat: number; lng: number; viable: boolean };

// Maricá — praça central aproximada.
export const OPERATIONAL_BASE = { lat: -22.911101, lng: -42.943486 };
export const MARICA_CENTER = OPERATIONAL_BASE;

const TILE = 256;
const OSM_TEMPLATE = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

function lngToPx(lng: number, z: number): number {
  return ((lng + 180) / 360) * TILE * Math.pow(2, z);
}
function latToPx(lat: number, z: number): number {
  const rad = (lat * Math.PI) / 180;
  const s = Math.sin(rad);
  return (
    (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * TILE * Math.pow(2, z)
  );
}

async function loadTile(url: string): Promise<HTMLImageElement | null> {
  try {
    const res = await fetch(url, {
      // Sem credenciais e sem cabeçalho customizado para não estourar CORS.
      mode: "cors",
      credentials: "omit",
    });
    if (!res.ok) return null;
    const blob = await res.blob();
    const dataUrl: string = await new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result));
      fr.onerror = () => reject(fr.error);
      fr.readAsDataURL(blob);
    });
    return await new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = dataUrl;
    });
  } catch {
    return null;
  }
}

export async function renderReportMapPng(opts: {
  width: number;
  height: number;
  center?: { lat: number; lng: number };
  zoom?: number;
  points?: PdfMapPoint[];
}): Promise<string | null> {
  if (typeof document === "undefined") return null;
  const W = Math.round(opts.width);
  const H = Math.round(opts.height);
  const points = opts.points ?? [];
  const zoom = opts.zoom ?? (points.length > 0 ? getOptimalZoom(points, W, H) : 12);
  const center = opts.center ?? (points.length > 0 ? getBoundsCenter(points) : MARICA_CENTER);

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  // Fundo neutro caso algum tile falhe.
  ctx.fillStyle = "#e8ecef";
  ctx.fillRect(0, 0, W, H);

  const cx = lngToPx(center.lng, zoom);
  const cy = latToPx(center.lat, zoom);
  const topLeftPxX = cx - W / 2;
  const topLeftPxY = cy - H / 2;

  const xMin = Math.floor(topLeftPxX / TILE);
  const yMin = Math.floor(topLeftPxY / TILE);
  const xMax = Math.floor((topLeftPxX + W) / TILE);
  const yMax = Math.floor((topLeftPxY + H) / TILE);
  const nMax = Math.pow(2, zoom);

  const jobs: Promise<{ img: HTMLImageElement | null; x: number; y: number }>[] = [];
  for (let x = xMin; x <= xMax; x++) {
    for (let y = yMin; y <= yMax; y++) {
      const tx = ((x % nMax) + nMax) % nMax;
      const ty = y;
      if (ty < 0 || ty >= nMax) continue;
      const url = OSM_TEMPLATE.replace("{z}", String(zoom))
        .replace("{x}", String(tx))
        .replace("{y}", String(ty));
      jobs.push(loadTile(url).then((img) => ({ img, x, y })));
    }
  }
  const tiles = await Promise.all(jobs);
  let anyLoaded = false;
  for (const t of tiles) {
    if (!t.img) continue;
    anyLoaded = true;
    const dx = t.x * TILE - topLeftPxX;
    const dy = t.y * TILE - topLeftPxY;
    ctx.drawImage(t.img, dx, dy);
  }
  if (!anyLoaded) return null;

  // Pontos.
  for (const p of points) {
    const px = lngToPx(p.lng, zoom) - topLeftPxX;
    const py = latToPx(p.lat, zoom) - topLeftPxY;
    if (px < -10 || py < -10 || px > W + 10 || py > H + 10) continue;
    ctx.beginPath();
    ctx.arc(px, py, 6, 0, Math.PI * 2);
    ctx.fillStyle = p.viable ? "#16a34a" : "#dc2626";
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#ffffff";
    ctx.stroke();
  }

  // Selo da base operacional (Inoã).
  const bpx = lngToPx(OPERATIONAL_BASE.lng, zoom) - topLeftPxX;
  const bpy = latToPx(OPERATIONAL_BASE.lat, zoom) - topLeftPxY;
  if (bpx > 0 && bpx < W && bpy > 0 && bpy < H) {
    ctx.beginPath();
    ctx.arc(bpx, bpy, 8, 0, Math.PI * 2);
    ctx.fillStyle = "#1e3a8a";
    ctx.fill();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.stroke();
    // Pequena letra "B" ou ícone de casa
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 10px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("B", bpx, bpy);
  }

  // Créditos OSM (obrigatório).
  ctx.font = "10px sans-serif";
  const label = "© OpenStreetMap";
  const pad = 4;
  const tw = ctx.measureText(label).width;
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.fillRect(W - tw - pad * 2 - 2, H - 16, tw + pad * 2, 14);
  ctx.fillStyle = "#333";
  ctx.fillText(label, W - tw - pad - 2, H - 6);

  try {
    return canvas.toDataURL("image/jpeg", 0.85);
  } catch {
    return null;
  }
}

function getBoundsCenter(pts: PdfMapPoint[]): { lat: number; lng: number } {
  let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
  pts.forEach(p => {
    minLat = Math.min(minLat, p.lat); maxLat = Math.max(maxLat, p.lat);
    minLng = Math.min(minLng, p.lng); maxLng = Math.max(maxLng, p.lng);
  });
  return { lat: (minLat + maxLat) / 2, lng: (minLng + maxLng) / 2 };
}

function getOptimalZoom(pts: PdfMapPoint[], w: number, h: number): number {
  if (pts.length === 0) return 12;
  // Always include the operational base in bounds calculation
  const allPts = pts;
  if (allPts.length < 2) return 13;
  let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
  allPts.forEach(p => {
    minLat = Math.min(minLat, p.lat); maxLat = Math.max(maxLat, p.lat);
    minLng = Math.min(minLng, p.lng); maxLng = Math.max(maxLng, p.lng);
  });
  
  const latDiff = maxLat - minLat;
  const lngDiff = maxLng - minLng;
  // Reduzimos drasticamente a margem para focar exatamente nos pontos
  const maxDiff = Math.max(latDiff * 1.02, lngDiff * 1.02) || 0.005;
  
  // Fórmula de zoom para Tiles 256px
  let z = Math.floor(Math.log2(360 / maxDiff));
  return Math.min(18, Math.max(10, z));
}