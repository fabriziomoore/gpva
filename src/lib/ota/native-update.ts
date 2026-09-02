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

/** Baixa o APK e abre o instalador nativo do Android (pede confirmação do usuário). */
export async function downloadAndInstallNativeUpdate(info: NativeUpdateInfo): Promise<void> {
  const [{ Filesystem, Directory }, { FileOpener }] = await Promise.all([
    import("@capacitor/filesystem"),
    import("@capacitor-community/file-opener"),
  ]);
  const result = await Filesystem.downloadFile({
    url: info.url,
    path: `gpva-update-${info.versionCode}.apk`,
    directory: Directory.Cache,
  });
  if (!result.path) throw new Error("Falha ao baixar a atualização");
  await FileOpener.open({
    filePath: result.path,
    contentType: "application/vnd.android.package-archive",
  });
}
