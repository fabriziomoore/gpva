import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  checkForNativeUpdate,
  downloadAndInstallNativeUpdate,
  type NativeUpdateInfo,
} from "@/lib/ota/native-update";
import {
  checkForWebUpdate,
  downloadAndApplyWebUpdate,
  type WebUpdateInfo,
} from "@/lib/ota/check-update";

function ProgressBar({ percent }: { percent: number }) {
  return (
    <div className="relative h-11 w-full overflow-hidden rounded-md bg-white">
      <div
        className="absolute inset-y-0 left-0 bg-blue-600 transition-[width] duration-150"
        style={{ width: `${percent}%` }}
      />
      <div className="relative flex h-full items-center justify-center text-sm font-bold text-black">
        {percent}%
      </div>
    </div>
  );
}

/**
 * Barra fixa no rodapé — mostra a atualização web (OTA) e/ou a atualização
 * nativa (APK) publicadas. As duas disputam o mesmo espaço no rodapé, então
 * ficam empilhadas dentro do MESMO container fixo em vez de cada uma abrir
 * seu próprio `fixed bottom-0` (o que faria uma cobrir a outra por completo).
 * A altura do espaçador reservado no fluxo normal da página é medida ao
 * vivo (ResizeObserver), já que 1 ou 2 cartões mudam a altura total.
 */
export function UpdateBanner() {
  const [nativeUpdate, setNativeUpdate] = useState<NativeUpdateInfo | null>(null);
  const [webUpdate, setWebUpdate] = useState<WebUpdateInfo | null>(null);
  const [nativeProgress, setNativeProgress] = useState<number | null>(null);
  const [webProgress, setWebProgress] = useState<number | null>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const [spacerHeight, setSpacerHeight] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void checkForNativeUpdate().then((info) => {
      if (!cancelled) setNativeUpdate(info);
    });
    void checkForWebUpdate().then((info) => {
      if (!cancelled) setWebUpdate(info);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const hasAny = !!nativeUpdate || !!webUpdate;

  useLayoutEffect(() => {
    if (!hasAny || !barRef.current) {
      setSpacerHeight(0);
      return;
    }
    const el = barRef.current;
    const update = () => setSpacerHeight(el.offsetHeight);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [hasAny, nativeUpdate, webUpdate, nativeProgress, webProgress]);

  if (!hasAny) return null;

  async function installNative() {
    if (!nativeUpdate) return;
    setNativeProgress(0);
    try {
      await downloadAndInstallNativeUpdate(nativeUpdate, setNativeProgress);
    } catch (err) {
      toast.error(err instanceof Error ? `Erro ao atualizar: ${err.message}` : "Erro ao baixar atualização");
    } finally {
      setNativeProgress(null);
    }
  }

  async function applyWeb() {
    if (!webUpdate) return;
    setWebProgress(0);
    try {
      await downloadAndApplyWebUpdate(webUpdate, setWebProgress);
      // Não chega aqui — reload() destrói o contexto JS antes de resolver.
    } catch (err) {
      toast.error(err instanceof Error ? `Erro ao atualizar: ${err.message}` : "Erro ao baixar atualização");
      setWebProgress(null);
    }
  }

  return (
    <>
      {/* Reserva espaço no fluxo normal — a barra abaixo é fixed, senão o
          conteúdo final da tela ficaria escondido atrás dela. */}
      <div aria-hidden style={{ height: spacerHeight }} />
      <div
        ref={barRef}
        className="fixed inset-x-0 bottom-0 z-20 bg-card shadow-md"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        {webUpdate && (
          <div className={"space-y-2 p-4 text-center" + (nativeUpdate ? " border-b border-border" : "")}>
            <div>
              <p className="text-sm font-bold uppercase tracking-wide">Atualização disponível</p>
              <p className="text-xs text-muted-foreground">Nova versão do app pronta pra usar</p>
            </div>
            {webProgress === null ? (
              <Button onClick={applyWeb} className="h-11 w-full">
                Baixar atualização
              </Button>
            ) : (
              <ProgressBar percent={webProgress} />
            )}
          </div>
        )}
        {nativeUpdate && (
          <div className="space-y-2 p-4 text-center">
            <div>
              <p className="text-sm font-bold uppercase tracking-wide">Atualização disponível</p>
              <p className="text-xs text-muted-foreground">
                {nativeUpdate.releaseType ?? "Atualização"} · v{nativeUpdate.versionName}
              </p>
            </div>
            {nativeProgress === null ? (
              <Button onClick={installNative} className="h-11 w-full">
                Baixar e instalar
              </Button>
            ) : (
              <ProgressBar percent={nativeProgress} />
            )}
          </div>
        )}
      </div>
    </>
  );
}
