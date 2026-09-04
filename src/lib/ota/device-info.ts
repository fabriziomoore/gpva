// Reporta ao backend qual versão (nativa e do bundle web/OTA) este device
// está rodando. Grava em dois lugares com propósitos diferentes:
// - `equipes`: persiste mesmo com a equipe deslogada, pra ver o rollout
//   por equipe mesmo offline (só existe pra contas de equipe/teste).
// - `active_sessions`: uma linha por QUALQUER conta logada agora mesmo
//   (equipe, teste, líder ou admin) — usada pra unificar "quem tá logado"
//   com "em que versão" numa página só no admin.
import { Capacitor } from "@capacitor/core";
import { supabase } from "@/integrations/supabase/client";

type DeviceVersionInfo = {
  native_version_code: number | null;
  web_bundle_version: number | null;
};

let cached: Promise<DeviceVersionInfo> | null = null;
let reportedForUserId: string | null = null;

async function readDeviceVersionInfo(): Promise<DeviceVersionInfo> {
  if (!Capacitor.isNativePlatform()) {
    return { native_version_code: null, web_bundle_version: null };
  }
  try {
    const [{ App }, { CapacitorUpdater }] = await Promise.all([
      import("@capacitor/app"),
      import("@capgo/capacitor-updater"),
    ]);
    const [appInfo, current] = await Promise.all([App.getInfo(), CapacitorUpdater.current()]);
    return {
      native_version_code: Number(appInfo.build) || null,
      web_bundle_version: Number(current.bundle.version) || null,
    };
  } catch {
    return { native_version_code: null, web_bundle_version: null };
  }
}

function getDeviceVersionInfo(): Promise<DeviceVersionInfo> {
  if (!cached) cached = readDeviceVersionInfo();
  return cached;
}

/**
 * Grava a versão atual em `equipes` para o usuário logado. Best-effort e
 * throttlado por processo — só reporta de novo se o userId mudar (ex.:
 * troca de conta no mesmo device), já que a versão não muda durante uma
 * sessão em execução (só muda depois de um cold start, que recarrega o
 * módulo e reseta o cache).
 */
export async function reportDeviceVersion(userId: string): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  if (reportedForUserId === userId) return;
  try {
    const info = await getDeviceVersionInfo();
    if (info.native_version_code == null && info.web_bundle_version == null) return;
    const [sessionRes] = await Promise.all([
      supabase
        .from("active_sessions")
        .update({
          native_version_code: info.native_version_code,
          web_bundle_version: info.web_bundle_version,
        })
        .eq("user_id", userId),
      // Só afeta linhas de verdade quando userId é uma equipe — pra líder/admin
      // essa update() não casa com nenhuma linha e não faz nada, sem erro.
      supabase
        .from("equipes")
        .update({
          native_version_code: info.native_version_code,
          web_bundle_version: info.web_bundle_version,
          version_reported_at: new Date().toISOString(),
        })
        .eq("id", userId),
    ]);
    if (!sessionRes.error) reportedForUserId = userId;
  } catch {
    // Nunca derruba o heartbeat por causa disso.
  }
}
