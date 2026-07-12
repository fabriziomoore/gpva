// Request native permissions at app boot (Android/iOS via Capacitor).
// On web this is a no-op. Storage: Android 10+ uses scoped storage and the
// Capacitor Filesystem writes to app-owned directories, so no runtime
// permission is needed to save/open the generated PDF report.
import { Capacitor } from "@capacitor/core";
import { Geolocation } from "@capacitor/geolocation";

export async function requestBootPermissions(): Promise<void> {
  try {
    if (!Capacitor.isNativePlatform()) return;
    const status = await Geolocation.checkPermissions();
    if (status.location !== "granted" && status.coarseLocation !== "granted") {
      await Geolocation.requestPermissions({ permissions: ["location", "coarseLocation"] });
    }
  } catch (err) {
    console.warn("[boot-permissions] failed", err);
  }
}