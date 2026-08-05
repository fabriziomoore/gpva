import { useEffect, useMemo, useRef, useState } from "react";

// Leaflet requires 'window' to be present. In TanStack Start SSR environment,
// we must ensure it only loads on the client side.
let L: typeof import("leaflet") | null = null;
if (typeof window !== "undefined") {
  L = require("leaflet");
  require("leaflet/dist/leaflet.css");
}

export type MapPoint = {
  id: string;
  lat: number;
  lng: number;
  viable: boolean;
  label: string;
  sub?: string;
  when?: string;
};

function coloredIcon(color: string) {
  if (!L) return null;
  const html = `<div style="
    width:18px;height:18px;border-radius:9999px;
    background:${color};border:2px solid #fff;
    box-shadow:0 0 0 1px rgba(0,0,0,.35);
  "></div>`;
  return L.divIcon({ html, className: "", iconSize: [18, 18], iconAnchor: [9, 9] });
}

type LeafletContainer = HTMLDivElement & {
  _leaflet_id?: number | null;
};

let globalMapInstanceId = 0;

function resetLeafletContainer(container: HTMLDivElement | null): void {
  if (!container) return;
  const leafletContainer = container as LeafletContainer;
  leafletContainer._leaflet_id = null;
  container.replaceChildren();
  container.className = "relative z-0";
}

// Desloca pontos com coordenadas quase idênticas em um pequeno círculo,
// para que sobreposições não escondam registros (ex.: 1 viável + 1 inviável
// no mesmo endereço).
function spreadOverlaps(points: MapPoint[]): Array<MapPoint & { _dlat: number; _dlng: number }> {
  const groups = new Map<string, MapPoint[]>();
  for (const p of points) {
    // ~11m de precisão no agrupamento (4 casas decimais).
    const k = `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`;
    const arr = groups.get(k) ?? [];
    arr.push(p);
    groups.set(k, arr);
  }
  const out: Array<MapPoint & { _dlat: number; _dlng: number }> = [];
  for (const arr of groups.values()) {
    if (arr.length === 1) {
      out.push({ ...arr[0], _dlat: arr[0].lat, _dlng: arr[0].lng });
      continue;
    }
    // Raio ~8m por marcador extra (0.00007° ≈ 7.7m).
    const step = 0.00008;
    const radius = step * Math.max(1, Math.ceil(arr.length / 8));
    arr.forEach((p, i) => {
      const angle = (2 * Math.PI * i) / arr.length;
      out.push({
        ...p,
        _dlat: p.lat + Math.sin(angle) * radius,
        _dlng: p.lng + Math.cos(angle) * radius,
      });
    });
  }
  return out;
}

export function ServicesMap({
  points,
  height = 480,
  onDelete,
  hideLegend = false,
}: {
  points: MapPoint[];
  height?: number;
  onDelete?: (id: string) => void | Promise<void>;
  hideLegend?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const layerRef = useRef<import("leaflet").LayerGroup | null>(null);
  const onDeleteRef = useRef(onDelete);
  const [containerKey, setContainerKey] = useState(() => `leader-map-${++globalMapInstanceId}`);
  const [disposedForSignOut, setDisposedForSignOut] = useState(false);
  onDeleteRef.current = onDelete;

  const GREEN = useMemo(() => coloredIcon("#16a34a"), []);
  const RED = useMemo(() => coloredIcon("#dc2626"), []);

  useEffect(() => {
    if (disposedForSignOut || !L) return;
    const container = containerRef.current;
    if (!container || mapRef.current) return;
    resetLeafletContainer(container);
    try {
      const map = L.map(container, { zoomControl: true }).setView(
        [-22.9192, -42.8186], // Maricá/RJ
        12,
      );
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap",
        maxZoom: 19,
      }).addTo(map);
      layerRef.current = L.layerGroup().addTo(map);
      mapRef.current = map;
    } catch (error) {
      resetLeafletContainer(container);
      throw error;
    }
    return () => {
      const currentMap = mapRef.current;
      if (currentMap) {
        try {
          currentMap.remove();
        } catch {
          /* ignore */
        }
      }
      resetLeafletContainer(container);
      mapRef.current = null;
      layerRef.current = null;
    };
  }, [disposedForSignOut]);

  useEffect(() => {
    const disposeMap = () => {
      setDisposedForSignOut(true);
      const map = mapRef.current;
      if (map) {
        try {
          map.remove();
        } catch {
          /* ignore */
        }
      }
      resetLeafletContainer(containerRef.current);
      mapRef.current = null;
      layerRef.current = null;
      setContainerKey(`leader-map-${++globalMapInstanceId}`);
    };
    window.addEventListener("gpva:user-signout", disposeMap);
    return () => window.removeEventListener("gpva:user-signout", disposeMap);
  }, []);

  const spread = useMemo(() => spreadOverlaps(points), [points]);

  useEffect(() => {
    if (!L) return;
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();
    if (spread.length === 0) return;
    const latlngs: import("leaflet").LatLngExpression[] = [];
    for (const p of spread) {
      const icon = p.viable ? GREEN : RED;
      if (!icon) continue;
      
      const m = L.marker([p._dlat, p._dlng], { icon });
      const delBtn = onDeleteRef.current
        ? `<button data-del="${p.id}" style="margin-top:6px;padding:4px 8px;background:#dc2626;color:#fff;border:0;border-radius:4px;font-size:11px;cursor:pointer">Apagar registro</button>`
        : "";
      const popup = L.popup().setContent(
        `<div style="font-size:12px;line-height:1.35;min-width:160px">
          <div style="font-weight:600">${escapeHtml(p.label)}</div>
          ${p.sub ? `<div style="color:#555">${escapeHtml(p.sub)}</div>` : ""}
          ${p.when ? `<div style="color:#777;margin-top:2px">${escapeHtml(p.when)}</div>` : ""}
          ${delBtn}
        </div>`,
      );
      m.bindPopup(popup);
      m.on("popupopen", (e) => {
        const el = (e.popup.getElement() as HTMLElement | null)?.querySelector(
          `button[data-del="${p.id}"]`,
        ) as HTMLButtonElement | null;
        if (!el) return;
        el.onclick = async () => {
          if (!onDeleteRef.current) return;
          const { confirmDelete } = await import("@/components/ui/confirm-dialog");
          if (!(await confirmDelete({ title: "Apagar registro?", description: "Este serviço será removido definitivamente do mapa. Esta ação não poderá ser desfeita." }))) return;
          el.disabled = true;
          el.textContent = "Apagando…";
          try {
            await onDeleteRef.current(p.id);
            map.closePopup();
          } catch {
            el.disabled = false;
            el.textContent = "Apagar registro";
          }
        };
      });
      m.addTo(layer);
      latlngs.push([p._dlat, p._dlng]);
    }
    try {
      const bounds = L.latLngBounds(latlngs);
      map.fitBounds(bounds.pad(0.2), { maxZoom: 16 });
    } catch {
      /* ignore */
    }
  }, [spread, GREEN, RED]);

  return (
    <div className={hideLegend ? "relative z-0" : "relative z-0 overflow-hidden rounded-xl border border-border"}>
      {disposedForSignOut ? (
        <div className="relative z-0 bg-background" style={{ height }} />
      ) : (
        <div key={containerKey} ref={containerRef} className="relative z-0" style={{ height }} />
      )}
      {!hideLegend && (
        <div className="flex items-center gap-4 border-t border-border bg-card px-3 py-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="inline-block size-3 rounded-full bg-success" /> Viável
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block size-3 rounded-full bg-destructive" /> Inviável
          </span>
          <span className="ml-auto">{points.length} registros com GPS</span>
        </div>
      )}
    </div>
  );
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;",
  );
}
