import { useEffect, useMemo, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

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
  const html = `<div style="
    width:18px;height:18px;border-radius:9999px;
    background:${color};border:2px solid #fff;
    box-shadow:0 0 0 1px rgba(0,0,0,.35);
  "></div>`;
  return L.divIcon({ html, className: "", iconSize: [18, 18], iconAnchor: [9, 9] });
}

const GREEN = coloredIcon("#16a34a");
const RED = coloredIcon("#dc2626");

export function ServicesMap({ points, height = 480 }: { points: MapPoint[]; height?: number }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);

  // Init map once.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, { zoomControl: true }).setView(
      [-14.235, -51.9253],
      4,
    );
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap",
      maxZoom: 19,
    }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, []);

  // Re-render markers on data change.
  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();
    if (points.length === 0) return;
    const latlngs: L.LatLngExpression[] = [];
    for (const p of points) {
      const m = L.marker([p.lat, p.lng], { icon: p.viable ? GREEN : RED });
      m.bindPopup(
        `<div style="font-size:12px;line-height:1.35">
          <div style="font-weight:600">${escapeHtml(p.label)}</div>
          ${p.sub ? `<div style="color:#555">${escapeHtml(p.sub)}</div>` : ""}
          ${p.when ? `<div style="color:#777;margin-top:2px">${escapeHtml(p.when)}</div>` : ""}
        </div>`,
      );
      m.addTo(layer);
      latlngs.push([p.lat, p.lng]);
    }
    try {
      const bounds = L.latLngBounds(latlngs);
      map.fitBounds(bounds.pad(0.2), { maxZoom: 15 });
    } catch {
      /* ignore */
    }
  }, [points]);

  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <div ref={containerRef} style={{ height }} />
      <div className="flex items-center gap-4 border-t border-border bg-card px-3 py-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="inline-block size-3 rounded-full bg-success" /> Viável
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block size-3 rounded-full bg-destructive" /> Inviável
        </span>
        <span className="ml-auto">{points.length} registros com GPS</span>
      </div>
    </div>
  );
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;",
  );
}