// Best-effort browser/Capacitor geolocation. Never blocks the save flow:
// resolves to null quickly if the API is unavailable, denied, or times out.

export type GeoFix = {
  lat: number;
  lng: number;
  accuracy_m: number | null;
  captured_at: string;
};

export async function tryGetGeoFix(timeoutMs = 6000): Promise<GeoFix | null> {
  if (typeof navigator === "undefined" || !navigator.geolocation) return null;
  return new Promise<GeoFix | null>((resolve) => {
    let done = false;
    const finish = (v: GeoFix | null) => {
      if (done) return;
      done = true;
      resolve(v);
    };
    const timer = setTimeout(() => finish(null), timeoutMs);
    try {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          clearTimeout(timer);
          finish({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy_m: Number.isFinite(pos.coords.accuracy) ? pos.coords.accuracy : null,
            captured_at: new Date(pos.timestamp || Date.now()).toISOString(),
          });
        },
        () => {
          clearTimeout(timer);
          finish(null);
        },
        { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 15_000 },
      );
    } catch {
      clearTimeout(timer);
      finish(null);
    }
  });
}