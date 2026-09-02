import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import {
  checkForNativeUpdate,
  downloadAndInstallNativeUpdate,
  type NativeUpdateInfo,
} from "@/lib/ota/native-update";

/**
 * Barra fixa no rodapé da tela — só aparece quando existe um APK novo
 * publicado. Toque em qualquer lugar da barra já baixa e abre o instalador.
 */
export function NativeUpdateCard() {
  const [update, setUpdate] = useState<NativeUpdateInfo | null>(null);
  const [installing, setInstalling] = useState(false);

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
    setInstalling(true);
    try {
      toast.info("Baixando atualização...");
      await downloadAndInstallNativeUpdate(update);
      toast.success("Instalador aberto — confirme a instalação se o Android pedir.");
    } catch (err) {
      toast.error(err instanceof Error ? `Erro ao atualizar: ${err.message}` : "Erro ao baixar atualização");
    } finally {
      setInstalling(false);
    }
  }

  return (
    <>
      {/* Reserva espaço no fluxo normal da página — a barra abaixo é fixed,
          senão o conteúdo final da tela ficaria escondido atrás dela. */}
      <div aria-hidden className="h-16" />
      <button
        type="button"
        onClick={install}
        disabled={installing}
        className="fixed inset-x-0 bottom-0 z-20 bg-card py-3 text-center shadow-md"
        style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
      >
        {installing ? (
          <Loader2 className="mx-auto size-4 animate-spin" />
        ) : (
          <>
            <p className="text-sm font-bold uppercase tracking-wide">Atualização disponível</p>
            <p className="text-xs text-muted-foreground">
              {update.releaseType ?? "Atualização"} · v{update.versionName}
            </p>
          </>
        )}
      </button>
    </>
  );
}
