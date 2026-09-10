import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";

export type AppVersionInfo = {
  version: string;
  build: string;
  otaBuild: string | null;
};

// Só existe no app nativo (Capacitor): versão do APK instalado + qual
// atualização OTA está ativa agora (ou null se ainda é a original do APK).
export function useAppVersionInfo(): AppVersionInfo | null {
  const [info, setInfo] = useState<AppVersionInfo | null>(null);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let cancelled = false;
    void (async () => {
      try {
        const [{ App }, { CapacitorUpdater }] = await Promise.all([
          import("@capacitor/app"),
          import("@capgo/capacitor-updater"),
        ]);
        const [appInfo, current] = await Promise.all([App.getInfo(), CapacitorUpdater.current()]);
        if (cancelled) return;
        setInfo({
          version: appInfo.version,
          build: appInfo.build,
          otaBuild: current.bundle.id === "builtin" ? null : current.bundle.version,
        });
      } catch {
        // Sem info disponível — a seção simplesmente não aparece.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return info;
}
