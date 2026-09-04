import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Carousel, CarouselContent, CarouselItem, type CarouselApi } from "@/components/ui/carousel";
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

const MANUAL_CHECK_EVENT = "gpva:check-update";

/**
 * Dispara uma nova checagem de atualização a partir de qualquer lugar do
 * app (ex.: botão "Verificar atualização" no menu). Se nada de novo for
 * encontrado, o próprio `UpdateBanner` mostra um toast avisando — o botão
 * nunca fica sem resposta.
 */
export function requestUpdateCheck(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(MANUAL_CHECK_EVENT));
}

export function ProgressBar({ percent }: { percent: number }) {
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
 * nativa (APK) publicadas. Quando as duas existem ao mesmo tempo, viram
 * slides de um carrossel (um card por vez, deslize pra ver o outro) com um
 * aviso acima informando que há mais de uma disponível — em vez de
 * empilhar os dois cards um sobre o outro. A altura do espaçador reservado
 * no fluxo normal da página é medida ao vivo (ResizeObserver).
 */
export function UpdateBanner() {
  const [nativeUpdate, setNativeUpdate] = useState<NativeUpdateInfo | null>(null);
  const [webUpdate, setWebUpdate] = useState<WebUpdateInfo | null>(null);
  const [nativeProgress, setNativeProgress] = useState<number | null>(null);
  const [webProgress, setWebProgress] = useState<number | null>(null);
  const [slide, setSlide] = useState(0);
  const [api, setApi] = useState<CarouselApi>();
  const barRef = useRef<HTMLDivElement>(null);
  const [spacerHeight, setSpacerHeight] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function runCheck(manual: boolean) {
      if (manual) toast.message("Verificando atualização...", { id: "gpva-update-check" });
      const [native, web] = await Promise.all([checkForNativeUpdate(), checkForWebUpdate()]);
      if (cancelled) return;
      setNativeUpdate(native);
      setWebUpdate(web);
      // Feedback explícito só na checagem manual — a automática (no boot)
      // fica silenciosa quando não há nada novo, pra não incomodar à toa.
      if (manual) {
        if (native || web) {
          toast.success("Atualização encontrada.", { id: "gpva-update-check" });
        } else {
          toast.success("Você já está com a versão mais recente.", { id: "gpva-update-check" });
        }
      }
    }

    void runCheck(false);
    const onManualCheck = () => void runCheck(true);
    window.addEventListener(MANUAL_CHECK_EVENT, onManualCheck);
    return () => {
      cancelled = true;
      window.removeEventListener(MANUAL_CHECK_EVENT, onManualCheck);
    };
  }, []);

  const hasAny = !!nativeUpdate || !!webUpdate;
  const hasBoth = !!nativeUpdate && !!webUpdate;

  useEffect(() => {
    if (!api) return;
    const onSelect = () => setSlide(api.selectedScrollSnap());
    onSelect();
    api.on("select", onSelect);
    return () => {
      api.off("select", onSelect);
    };
  }, [api]);

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
  }, [hasAny, hasBoth, nativeUpdate, webUpdate, nativeProgress, webProgress]);

  if (!hasAny) return null;

  async function installNative() {
    if (!nativeUpdate) return;
    setNativeProgress(0);
    try {
      const result = await downloadAndInstallNativeUpdate(nativeUpdate, setNativeProgress);
      if (result.usedFallback) {
        toast.info("Este aparelho precisa atualizar pelo navegador desta vez — baixe o arquivo e instale manualmente.", {
          duration: 10_000,
        });
      }
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

  const webCard = (
    <div className="space-y-2 p-4 text-center">
      <div>
        <p className="text-sm font-bold uppercase tracking-wide">Atualização disponível</p>
        <p className="text-xs text-muted-foreground">{webUpdate?.releaseType ?? "Atualização"}</p>
      </div>
      {webProgress === null ? (
        <Button onClick={applyWeb} className="h-11 w-full">
          Baixar atualização
        </Button>
      ) : (
        <ProgressBar percent={webProgress} />
      )}
    </div>
  );

  const nativeCard = nativeUpdate && (
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
  );

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
        {hasBoth && (
          <p className="border-b border-border bg-primary/10 px-4 py-1.5 text-center text-[11px] font-semibold uppercase tracking-wide text-primary">
            2 atualizações disponíveis · deslize para ver
          </p>
        )}
        {hasBoth ? (
          <>
            <Carousel setApi={setApi}>
              <CarouselContent className="ml-0">
                <CarouselItem className="pl-0">{webCard}</CarouselItem>
                <CarouselItem className="pl-0">{nativeCard}</CarouselItem>
              </CarouselContent>
            </Carousel>
            <div className="flex justify-center gap-1.5 pb-3">
              {[0, 1].map((i) => (
                <span
                  key={i}
                  className={
                    "size-1.5 rounded-full transition-colors " +
                    (slide === i ? "bg-primary" : "bg-muted-foreground/30")
                  }
                />
              ))}
            </div>
          </>
        ) : webUpdate ? (
          webCard
        ) : (
          nativeCard
        )}
      </div>
    </>
  );
}
