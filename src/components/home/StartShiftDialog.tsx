import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type Condutor = { label: string; fullName: string };

export function StartShiftDialog({
  open,
  onOpenChange,
  collaborators,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  collaborators: Condutor[];
  // Chamado de forma síncrona a partir do clique no botão — quem usa isso
  // precisa chamar openShiftStartForm sem nenhum await antes, senão o
  // navegador bloqueia a nova aba/WebView por não estar mais dentro do
  // gesto de clique do usuário.
  onConfirm: (condutorFullName: string, km: string) => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [km, setKm] = useState("");

  const canConfirm = !!selected && km.trim().length > 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          setSelected(null);
          setKm("");
        }
        onOpenChange(o);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Início de expediente</DialogTitle>
          <DialogDescription>Confirme o condutor do dia e o KM do veículo.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Condutor do dia</Label>
            <div className={cn("mt-2 grid gap-2", collaborators.length === 2 ? "grid-cols-2" : "grid-cols-1")}>
              {collaborators.map((c) => (
                <button
                  key={c.fullName}
                  type="button"
                  onClick={() => setSelected(c.fullName)}
                  className={cn(
                    "h-14 rounded-xl border-2 px-2 text-sm font-semibold transition-colors",
                    selected === c.fullName
                      ? "border-primary bg-primary/15 text-primary"
                      : "border-border bg-card text-foreground hover:border-primary/50",
                  )}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <Label>KM do veículo</Label>
            <Input
              value={km}
              onChange={(e) => setKm(e.target.value.replace(/\D/g, ""))}
              inputMode="numeric"
              placeholder="Ex: 123456"
              className="mt-2 h-11"
            />
          </div>
          <Button
            className="h-11 w-full"
            disabled={!canConfirm}
            onClick={() => onConfirm(selected!, km.trim())}
          >
            Iniciar expediente
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
