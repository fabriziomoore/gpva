import { Capacitor } from "@capacitor/core";
import { supabase } from "@/integrations/supabase/client";

/**
 * Confirma pro plugin de OTA que o bundle JS atual carregou com sucesso.
 * Precisa ser chamado sempre, cedo, em todo boot nativo — senão o plugin
 * assume que o bundle está quebrado e reverte pro anterior sozinho.
 */
export async function notifyOtaReady(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const { CapacitorUpdater } = await import("@capgo/capacitor-updater");
    await CapacitorUpdater.notifyAppReady();
  } catch {
    // Nunca deixa isso derrubar o boot do app.
  }
}

export type WebUpdateInfo = {
  buildNumber: number;
  url: string;
  checksum: string | null;
  releaseType: string | null;
};

/**
 * Só checa se existe uma versão web mais nova publicada — não baixa nada.
 * Usado pelo WebUpdateCard pra decidir se mostra o aviso.
 */
export async function checkForWebUpdate(): Promise<WebUpdateInfo | null> {
  if (!Capacitor.isNativePlatform()) return null;
  try {
    const { CapacitorUpdater } = await import("@capgo/capacitor-updater");
    const [{ data: release }, current] = await Promise.all([
      supabase
        .from("web_releases")
        .select("build_number, url, checksum, release_type")
        .order("build_number", { ascending: false })
        .limit(1)
        .maybeSingle(),
      CapacitorUpdater.current(),
    ]);
    if (!release?.url) return null;
    const currentVersion = Number(current.bundle.version) || 0;
    if (release.build_number <= currentVersion) return null;
    return {
      buildNumber: release.build_number,
      url: release.url,
      checksum: release.checksum,
      releaseType: release.release_type,
    };
  } catch {
    return null;
  }
}

/**
 * Baixa o bundle, marca como próximo e recarrega o app sozinho — sem
 * precisar que o usuário feche e abra manualmente (antes disso dependia de
 * 2 ciclos de fechar/abrir, sem nenhum aviso na tela).
 */
export async function downloadAndApplyWebUpdate(
  info: WebUpdateInfo,
  onProgress?: (percent: number) => void,
): Promise<void> {
  const { CapacitorUpdater } = await import("@capgo/capacitor-updater");
  // O plugin reporta download e extração como duas fases separadas, cada
  // uma reiniciando o percentual do zero — sem isso a barra "andava um
  // pouco, voltava pro início e recomeçava". Nunca deixamos o valor exibido
  // regredir, só avançar.
  let maxPercent = 0;
  const listener = onProgress
    ? await CapacitorUpdater.addListener("download", (state) => {
        maxPercent = Math.max(maxPercent, state.percent);
        onProgress(maxPercent);
      })
    : null;
  try {
    const bundle = await CapacitorUpdater.download({
      url: info.url,
      version: String(info.buildNumber),
      checksum: info.checksum ?? undefined,
    });
    await CapacitorUpdater.next({ id: bundle.id });
    // Nunca resolve — destrói o contexto JS e recarrega com o bundle novo.
    await CapacitorUpdater.reload();
  } finally {
    await listener?.remove();
  }
}
