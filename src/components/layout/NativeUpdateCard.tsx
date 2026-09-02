import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  checkForNativeUpdate,
  downloadAndInstallNativeUpdate,
  type NativeUpdateInfo,
} from "@/lib/ota/native-update";

/**
 * Barra fixa no rodapé da tela — só aparece quando existe um APK novo
 * publicado.
 */
export function NativeUpdateCard() {
  const [update, setUpdate] = useState<NativeUpdateInfo | null>(null);
  const [progress, setProgress] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    void checkForNativeUpdate().then((info) => {
      if (!cancelled) setUpdate(info);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!update) return null;

  async function install() {
    if (!update) return;
    setProgress(0);
    try {
      await downloadAndInstallNativeUpdate(update, setProgress);
    } catch (err) {
      toast.error(err instanceof Error ? `Erro ao atualizar: ${err.message}` : "Erro ao baixar atualização");
    } finally {
      setProgress(null);
    }
  }

  return (
    <>
      {/* Reserva espaço no fluxo normal da página — a barra abaixo é fixed,
          senão o conteúdo final da tela ficaria escondido atrás dela. */}
      <div aria-hidden className="h-28" />
      <div
        className="fixed inset-x-0 bottom-0 z-20 space-y-2 bg-card p-4 text-center shadow-md"
        style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}
      >
        <div>
          <p className="text-sm font-bold uppercase tracking-wide">Atualização disponível</p>
          <p className="text-xs text-muted-foreground">
            {update.releaseType ?? "Atualização"} · v{update.versionName}
          </p>
        </div>
        {progress === null ? (
          <Button onClick={install} className="h-11 w-full">
            Baixar e instalar
          </Button>
        ) : (
          <div className="relative h-11 w-full overflow-hidden rounded-md bg-white">
            <div
              className="absolute inset-y-0 left-0 bg-blue-600 transition-[width] duration-150"
              style={{ width: `${progress}%` }}
            />
            <div className="relative flex h-full items-center justify-center text-sm font-bold text-black">
              {progress}%
            </div>
          </div>
        )}
      </div>
    </>
  );
}
