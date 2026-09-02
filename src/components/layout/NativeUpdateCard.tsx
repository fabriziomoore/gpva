import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  checkForNativeUpdate,
  downloadAndInstallNativeUpdate,
  type NativeUpdateInfo,
} from "@/lib/ota/native-update";

/** Card "Atualização disponível" — só aparece quando existe um APK novo publicado. */
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
    <div className="space-y-2 rounded-2xl bg-card p-4 shadow-md">
      <p className="text-sm font-semibold">Atualização disponível</p>
      <p className="text-xs text-muted-foreground">
        Versão {update.versionName} — baixa o instalador e o Android pede pra confirmar.
      </p>
      <Button onClick={install} disabled={installing} className="h-11 w-full">
        {installing ? <Loader2 className="size-4 animate-spin" /> : "Baixar e instalar"}
      </Button>
    </div>
  );
}
