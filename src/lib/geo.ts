// Best-effort browser/Capacitor geolocation. Never blocks the save flow:
// resolves to null quickly if the API is unavailable, denied, or times out.

export type GeoFix = {
  lat: number;
  lng: number;
  accuracy_m: number | null;
  captured_at: string;
};

type PositionLike = {
  coords: {
    latitude: number;
    longitude: number;
    accuracy: number;
  };
  timestamp: number;
};

const LAST_GEO_FIX_KEY = "gpva:lastGeoFix";
const MAX_CACHED_FIX_AGE_MS = 5 * 60 * 1000;

export async function tryGetGeoFix(timeoutMs = 6000): Promise<GeoFix | null> {
  // Prefer the Capacitor plugin on native. Android may fail high-accuracy GPS
  // while offline, so use a second balanced/cached attempt before giving up.
  const native = await tryCapacitorFix(timeoutMs);
  if (native) return rememberGeoFix(native);
  if (typeof navigator === "undefined" || !navigator.geolocation) return null;

  const browserHigh = await tryBrowserFix({
    enableHighAccuracy: true,
    timeoutMs: Math.min(timeoutMs, 3500),
    maximumAge: 15_000,
  });
  if (browserHigh) return rememberGeoFix(browserHigh);

  const browserBalanced = await tryBrowserFix({
    enableHighAccuracy: false,
    timeoutMs: Math.min(timeoutMs, 2500),
    maximumAge: 120_000,
  });
  if (browserBalanced) return rememberGeoFix(browserBalanced);

  return readRecentGeoFix();
}

function tryBrowserFix(opts: {
  enableHighAccuracy: boolean;
  timeoutMs: number;
  maximumAge: number;
}): Promise<GeoFix | null> {
  if (typeof navigator === "undefined" || !navigator.geolocation) return Promise.resolve(null);
  return new Promise<GeoFix | null>((resolve) => {
    let done = false;
    const finish = (v: GeoFix | null) => {
      if (done) return;
      done = true;
      resolve(v);
    };
    const timer = setTimeout(() => finish(null), opts.timeoutMs);
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
        {
          enableHighAccuracy: opts.enableHighAccuracy,
          timeout: opts.timeoutMs,
          maximumAge: opts.maximumAge,
        },
      );
    } catch {
      clearTimeout(timer);
      finish(null);
    }
  });
}

async function tryCapacitorFix(timeoutMs: number): Promise<GeoFix | null> {
  try {
    // Dynamic imports so web builds don't fail if the plugin isn't wired.
    const { Capacitor } = await import("@capacitor/core");
    if (!Capacitor.isNativePlatform()) return null;
    const { Geolocation } = await import("@capacitor/geolocation");
    const perm = await Geolocation.checkPermissions();
    if (perm.location !== "granted" && perm.coarseLocation !== "granted") {
      const req = await Geolocation.requestPermissions({ permissions: ["location", "coarseLocation"] });
      if (req.location !== "granted" && req.coarseLocation !== "granted") return null;
    }
    const high = await withTimeout(Geolocation.getCurrentPosition({
      enableHighAccuracy: true,
      timeout: Math.min(timeoutMs, 3500),
      maximumAge: 15_000,
    }), Math.min(timeoutMs, 3800));
    if (high) return positionToFix(high);

    const balanced = await withTimeout(Geolocation.getCurrentPosition({
      enableHighAccuracy: false,
      timeout: Math.min(timeoutMs, 2500),
      maximumAge: 120_000,
    }), Math.min(timeoutMs, 2800));
    return balanced ? positionToFix(balanced) : null;
  } catch {
    return null;
  }
}

function positionToFix(pos: PositionLike): GeoFix {
  return {
    lat: pos.coords.latitude,
    lng: pos.coords.longitude,
    accuracy_m: Number.isFinite(pos.coords.accuracy) ? pos.coords.accuracy : null,
    captured_at: new Date(pos.timestamp || Date.now()).toISOString(),
  };
}

function withTimeout<T>(promise: PromiseLike<T>, timeoutMs: number): Promise<T | null> {
  if (typeof window === "undefined") return Promise.resolve(promise);
  return Promise.race([
    promise,
    new Promise<null>((resolve) => {
      window.setTimeout(() => resolve(null), timeoutMs);
    }),
  ]).catch(() => null);
}

function rememberGeoFix(fix: GeoFix): GeoFix {
  try {
    window.localStorage.setItem(LAST_GEO_FIX_KEY, JSON.stringify(fix));
  } catch {
    /* ignore */
  }
  return fix;
}

function readRecentGeoFix(): GeoFix | null {
  try {
    const raw = window.localStorage.getItem(LAST_GEO_FIX_KEY);
    if (!raw) return null;
    const fix = JSON.parse(raw) as Partial<GeoFix>;
    if (typeof fix.lat !== "number" || typeof fix.lng !== "number" || !fix.captured_at) return null;
    const capturedAt = Date.parse(fix.captured_at);
    if (!Number.isFinite(capturedAt) || Date.now() - capturedAt > MAX_CACHED_FIX_AGE_MS) return null;
    return {
      lat: fix.lat,
      lng: fix.lng,
      accuracy_m: typeof fix.accuracy_m === "number" ? fix.accuracy_m : null,
      captured_at: fix.captured_at,
    };
  } catch {
    return null;
  }
}