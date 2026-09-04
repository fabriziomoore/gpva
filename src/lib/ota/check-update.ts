import { Capacitor } from "@capacitor/core";
import { supabase } from "@/integrations/supabase/client";
// build de teste 2 — sem mudança funcional

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

// Diagnóstico TEMPORÁRIO — não dá pra ver o console de um APK real sem ADB.
// Grava o resultado de toda checagem em public.ota_debug_log (tabela também
// temporária) pra investigar um device que não detecta atualização nenhuma,
// sem depender do usuário capturar um toast a tempo. Remover (função +
// chamada + `DROP TABLE public.ota_debug_log`) depois de resolvido.
export async function logOtaDebug(payload: Record<string, unknown>): Promise<void> {
  try {
    // Não bloqueia (nem descarta o log) se a sessão ainda não restaurou —
    // isso pode não estar pronto bem cedo no boot, que é exatamente quando
    // a checagem automática roda. userId fica null nesse caso; a tabela
    // aceita isso (RLS libera insert pra anon também, temporariamente).
    let userId: string | null = null;
    try {
      const { data } = await supabase.auth.getSession();
      userId = data.session?.user.id ?? null;
    } catch {
      /* segue sem userId */
    }
    // Tabela temporária de diagnóstico, fora do types.ts gerado — cast direto.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from("ota_debug_log").insert({ user_id: userId, payload });
  } catch {
    // Diagnóstico nunca pode quebrar nada.
  }
}

/**
 * Só checa se existe uma versão web mais nova publicada — não baixa nada.
 * Usado pelo WebUpdateCard pra decidir se mostra o aviso.
 */
export async function checkForWebUpdate(): Promise<WebUpdateInfo | null> {
  if (!Capacitor.isNativePlatform()) return null;
  try {
    const { CapacitorUpdater } = await import("@capgo/capacitor-updater");
    const [{ data: release, error: dbError }, current] = await Promise.all([
      supabase
        .from("web_releases")
        .select("build_number, url, checksum, release_type")
        .order("build_number", { ascending: false })
        .limit(1)
        .maybeSingle(),
      CapacitorUpdater.current(),
    ]);
    const currentVersion = Number(current.bundle.version) || 0;
    if (dbError) {
      void logOtaDebug({ stage: "db_error", error: dbError.message, currentVersion, bundle: current.bundle });
      return null;
    }
    if (!release?.url) {
      void logOtaDebug({ stage: "no_release_row", currentVersion, bundle: current.bundle });
      return null;
    }
    const willUpdate = release.build_number > currentVersion;
    void logOtaDebug({
      stage: "compared",
      currentVersion,
      latestBuild: release.build_number,
      willUpdate,
      bundle: current.bundle,
    });
    if (!willUpdate) return null;
    return {
      buildNumber: release.build_number,
      url: release.url,
      checksum: release.checksum,
      releaseType: release.release_type,
    };
  } catch (e) {
    void logOtaDebug({ stage: "exception", error: e instanceof Error ? `${e.name}: ${e.message}` : String(e) });
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
