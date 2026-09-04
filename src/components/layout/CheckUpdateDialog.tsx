import { useState } from "react";
import { Loader2, RefreshCw, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ProgressBar } from "@/components/layout/UpdateBanner";
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
import { toast } from "sonner";

type CheckState = "checking" | "found" | "empty";

/**
 * Botão "Verificar atualização" + card flutuante no meio da tela (usado nas
 * Configurações da equipe). Ao abrir, busca atualização web e nativa; se
 * achar, mostra o(s) card(s) com o botão "Atualizar" — mesmo efeito
 * (download + barra de progresso) do card que aparece na Home.
 */
export function CheckUpdateDialog() {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<CheckState>("checking");
  const [nativeUpdate, setNativeUpdate] = useState<NativeUpdateInfo | null>(null);
  const [webUpdate, setWebUpdate] = useState<WebUpdateInfo | null>(null);
  const [nativeProgress, setNativeProgress] = useState<number | null>(null);
  const [webProgress, setWebProgress] = useState<number | null>(null);

  async function runCheck() {
    setState("checking");
    setNativeUpdate(null);
    setWebUpdate(null);
    setNativeProgress(null);
    setWebProgress(null);
    const [native, web] = await Promise.all([checkForNativeUpdate(), checkForWebUpdate()]);
    setNativeUpdate(native);
    setWebUpdate(web);
    setState(native || web ? "found" : "empty");
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) void runCheck();
  }

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

  return (
    <>
      <Button type="button" variant="outline" className="h-11 w-full" onClick={() => handleOpenChange(true)}>
        <RefreshCw className="mr-2 size-4" />
        Verificar atualização
      </Button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-sm text-center">
          <DialogHeader>
            <DialogTitle className="text-center">Atualização</DialogTitle>
            <DialogDescription className="sr-only">
              Verifica se há uma atualização disponível pra baixar.
            </DialogDescription>
          </DialogHeader>

          {state === "checking" && (
            <div className="flex flex-col items-center gap-3 py-6">
              <Loader2 className="size-8 animate-spin text-primary" />
              <p className="text-sm font-medium text-foreground">Buscando atualização...</p>
            </div>
          )}

          {state === "empty" && (
            <div className="flex flex-col items-center gap-3 py-6">
              <CheckCircle2 className="size-8 text-emerald-500" />
              <p className="text-sm font-medium text-foreground">Não foram encontradas atualizações</p>
            </div>
          )}

          {state === "found" && (
            <div className="space-y-4 py-2">
              {webUpdate && (
                <div className="space-y-2 rounded-xl border border-border p-4">
                  <div>
                    <p className="text-sm font-bold uppercase tracking-wide">Atualização disponível</p>
                    <p className="text-xs text-muted-foreground">{webUpdate.releaseType ?? "Atualização"}</p>
                  </div>
                  {webProgress === null ? (
                    <Button onClick={applyWeb} className="h-11 w-full">
                      Atualizar
                    </Button>
                  ) : (
                    <ProgressBar percent={webProgress} />
                  )}
                </div>
              )}
              {nativeUpdate && (
                <div className="space-y-2 rounded-xl border border-border p-4">
                  <div>
                    <p className="text-sm font-bold uppercase tracking-wide">Atualização disponível</p>
                    <p className="text-xs text-muted-foreground">
                      {nativeUpdate.releaseType ?? "Atualização"} · v{nativeUpdate.versionName}
                    </p>
                  </div>
                  {nativeProgress === null ? (
                    <Button onClick={installNative} className="h-11 w-full">
                      Atualizar
                    </Button>
                  ) : (
                    <ProgressBar percent={nativeProgress} />
                  )}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
