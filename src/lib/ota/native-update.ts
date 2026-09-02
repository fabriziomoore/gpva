import { Capacitor } from "@capacitor/core";
import { supabase } from "@/integrations/supabase/client";

export type NativeUpdateInfo = {
  versionCode: number;
  versionName: string;
  url: string;
  releaseType: string | null;
};

/**
 * Checa se existe um APK novo publicado (versionCode maior que o instalado).
 * Diferente do OTA web, isso não baixa nem instala sozinho — instalar um
 * APK sempre exige confirmação do usuário via diálogo do próprio Android,
 * não tem como automatizar isso.
 */
export async function checkForNativeUpdate(): Promise<NativeUpdateInfo | null> {
  if (!Capacitor.isNativePlatform()) return null;
  try {
    const { App } = await import("@capacitor/app");
    const [appInfo, { data: release }] = await Promise.all([
      App.getInfo(),
      supabase
        .from("app_releases")
        .select("version_code, version_name, url, release_type")
        .order("version_code", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    if (!release?.url) return null;

    const currentVersionCode = Number(appInfo.build) || 0;
    if (release.version_code <= currentVersionCode) return null;

    return {
      versionCode: release.version_code,
      versionName: release.version_name,
      url: release.url,
      releaseType: release.release_type,
    };
  } catch {
    return null;
  }
}

/**
 * Baixa o APK (reportando progresso 0-100 via onProgress) e abre o
 * instalador nativo do Android (pede confirmação do usuário).
 */
export async function downloadAndInstallNativeUpdate(
  info: NativeUpdateInfo,
  onProgress?: (percent: number) => void,
): Promise<void> {
  const [{ Filesystem, Directory }, { FileTransfer }, { FileOpener }] = await Promise.all([
    import("@capacitor/filesystem"),
    import("@capacitor/file-transfer"),
    import("@capacitor-community/file-opener"),
  ]);

  const dest = await Filesystem.getUri({
    path: `gpva-update-${info.versionCode}.apk`,
    directory: Directory.Cache,
  });

  const listener = onProgress
    ? await FileTransfer.addListener("progress", (status) => {
        if (status.lengthComputable && status.contentLength > 0) {
          onProgress(Math.round((status.bytes / status.contentLength) * 100));
        }
      })
    : null;

  try {
    const result = await FileTransfer.downloadFile({
      url: info.url,
      path: dest.uri,
      progress: true,
    });
    if (!result.path) throw new Error("Falha ao baixar a atualização");
    await FileOpener.open({
      filePath: result.path,
      contentType: "application/vnd.android.package-archive",
    });
  } finally {
    await listener?.remove();
  }
}
