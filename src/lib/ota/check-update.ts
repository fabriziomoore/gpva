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

/**
 * Checa se existe uma versão web mais nova publicada, baixa em segundo
 * plano e agenda pra ativar no próximo cold start (App.next não interrompe
 * a sessão atual — só troca quando o app for reaberto do zero).
 */
export async function checkForOtaUpdate(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const { CapacitorUpdater } = await import("@capgo/capacitor-updater");

    const [{ data: release }, current] = await Promise.all([
      supabase
        .from("web_releases")
        .select("build_number, url, checksum")
        .order("build_number", { ascending: false })
        .limit(1)
        .maybeSingle(),
      CapacitorUpdater.current(),
    ]);

    if (!release?.url) return;

    const currentVersion = Number(current.bundle.version) || 0;
    if (release.build_number <= currentVersion) return;

    const bundle = await CapacitorUpdater.download({
      url: release.url,
      version: String(release.build_number),
      checksum: release.checksum ?? undefined,
    });
    await CapacitorUpdater.next({ id: bundle.id });
  } catch {
    // Sem internet, servidor fora do ar, etc. — tenta de novo no próximo boot.
  }
}
