import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  checkForWebUpdate,
  downloadAndApplyWebUpdate,
  type WebUpdateInfo,
} from "@/lib/ota/check-update";

/**
 * Barra fixa no rodapé da tela — só aparece quando existe um bundle web
 * novo publicado. Diferente da atualização nativa (que exige confirmação
 * de instalação do Android), essa é só JS/CSS: baixa e o próprio app
 * recarrega sozinho, sem precisar fechar e abrir manualmente.
 */
export function WebUpdateCard() {
  const [update, setUpdate] = useState<WebUpdateInfo | null>(null);
  const [progress, setProgress] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    void checkForWebUpdate().then((info) => {
      if (!cancelled) setUpdate(info);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!update) return null;

  async function apply() {
    if (!update) return;
    setProgress(0);
    try {
      await downloadAndApplyWebUpdate(update, setProgress);
      // Não chega aqui — reload() destrói o contexto JS antes de resolver.
    } catch (err) {
      toast.error(err instanceof Error ? `Erro ao atualizar: ${err.message}` : "Erro ao baixar atualização");
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
          <p className="text-xs text-muted-foreground">Nova versão do app pronta pra usar</p>
        </div>
        {progress === null ? (
          <Button onClick={apply} className="h-11 w-full">
            Baixar atualização
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
