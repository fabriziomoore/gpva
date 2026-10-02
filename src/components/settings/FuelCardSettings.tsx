import { useEffect, useState } from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { confirmAction } from "@/components/ui/confirm-dialog";
import { FUEL_CODE_LEN, clearFuelPin, saveFuelCard, useFuelCards } from "@/lib/fuel-cards";

/**
 * Configurações → Cartão de abastecimento. A senha nunca é mostrada aqui
 * (fica criptografada com o código pessoal do dono — ver lib/fuel-cards).
 */
export function FuelCardSettings({
  userId,
  collaborators,
}: {
  userId: string | null;
  collaborators: [string | null, string | null];
}) {
  const cards = useFuelCards(userId);
  if (!collaborators[0] && !collaborators[1]) return null;

  return (
    <div className="space-y-3 border-t border-border pt-6">
      <p className="text-sm font-semibold text-canvas-foreground">Cartão de abastecimento</p>
      <p className="text-xs text-canvas-foreground/60">
        A senha é individual: cada colaborador cria um código pessoal de {FUEL_CODE_LEN} números, e ela só
        aparece com esse código.
      </p>
      {collaborators.map((name, idx) =>
        name ? (
          <CollaboratorFuelCard
            key={idx}
            userId={userId}
            index={idx as 0 | 1}
            name={name}
            matricula={cards[idx].matricula}
            hasPin={!!cards[idx].vault}
          />
        ) : null,
      )}
    </div>
  );
}

function CollaboratorFuelCard({
  userId,
  index,
  name,
  matricula,
  hasPin,
}: {
  userId: string | null;
  index: 0 | 1;
  name: string;
  matricula: string;
  hasPin: boolean;
}) {
  const [mat, setMat] = useState(matricula);
  const [editingPin, setEditingPin] = useState(false);
  const [pin, setPin] = useState("");
  const [code, setCode] = useState("");
  const [code2, setCode2] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => setMat(matricula), [matricula]);

  const showPinForm = !hasPin || editingPin;
  const digits = (v: string) => v.replace(/\D/g, "").slice(0, FUEL_CODE_LEN);
  const codeOk = code.length === FUEL_CODE_LEN && code === code2;

  async function save() {
    if (!userId) return;
    if (showPinForm && pin.trim()) {
      if (code.length !== FUEL_CODE_LEN) {
        toast.error(`O código pessoal precisa ter ${FUEL_CODE_LEN} números.`);
        return;
      }
      if (code !== code2) {
        toast.error("Os códigos pessoais não conferem.");
        return;
      }
    }
    setBusy(true);
    try {
      const withPin = showPinForm && !!pin.trim();
      const { synced } = await saveFuelCard(userId, index, {
        matricula: mat,
        ...(withPin ? { pin, code } : {}),
      });
      if (withPin) setEditingPin(false);
      setPin("");
      setCode("");
      setCode2("");
      if (synced) toast.success(`Cartão de ${name} salvo`);
      else toast.success(`Cartão de ${name} salvo neste aparelho — sobe pro sistema quando tiver internet`);
    } catch {
      toast.error("Não foi possível salvar o cartão neste aparelho.");
    } finally {
      setBusy(false);
    }
  }

  async function removePin() {
    if (!userId) return;
    const ok = await confirmAction({
      title: "Apagar senha?",
      description: `A senha do cartão de ${name} será apagada deste aparelho. A matrícula continua.`,
      confirmText: "Apagar",
      cancelText: "Cancelar",
    });
    if (!ok) return;
    await clearFuelPin(userId, index);
    setEditingPin(false);
  }

  return (
    <div className="space-y-2 rounded-card bg-card p-3 shadow-md">
      <Label className="text-foreground">{name}</Label>
      <Input
        value={mat}
        onChange={(e) => setMat(e.target.value)}
        placeholder="Matrícula do cartão"
        inputMode="numeric"
        autoComplete="off"
        className="h-11"
      />

      {hasPin && !editingPin ? (
        <div className="flex items-center justify-between gap-2 rounded-lg bg-muted px-3 py-2">
          <span className="flex items-center gap-2 text-sm text-foreground">
            <ShieldCheck className="size-4 text-success" /> Senha protegida por código pessoal
          </span>
          <span className="flex shrink-0 gap-1">
            <Button type="button" variant="outline" className="h-8 px-2 text-xs" onClick={() => setEditingPin(true)}>
              Trocar
            </Button>
            <Button type="button" variant="ghost" className="h-8 px-2 text-xs text-destructive" onClick={removePin}>
              Apagar
            </Button>
          </span>
        </div>
      ) : (
        <div className="space-y-2">
          <Input
            type="password"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            placeholder="Senha do cartão"
            inputMode="numeric"
            autoComplete="off"
            className="h-11"
          />
          {pin.trim() && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  type="password"
                  value={code}
                  onChange={(e) => setCode(digits(e.target.value))}
                  placeholder="Código pessoal"
                  inputMode="numeric"
                  autoComplete="off"
                  className="h-11"
                />
                <Input
                  type="password"
                  value={code2}
                  onChange={(e) => setCode2(digits(e.target.value))}
                  placeholder="Repita o código"
                  inputMode="numeric"
                  autoComplete="off"
                  className="h-11"
                />
              </div>
              <p className="text-[11px] text-muted-foreground">
                {FUEL_CODE_LEN} números, só seus. Ele é pedido pra ver a senha no cartão.
              </p>
            </>
          )}
          {editingPin && (
            <button
              type="button"
              className="text-xs text-muted-foreground underline-offset-2 hover:underline"
              onClick={() => {
                setEditingPin(false);
                setPin("");
                setCode("");
                setCode2("");
              }}
            >
              Cancelar troca de senha
            </button>
          )}
        </div>
      )}

      <Button
        onClick={save}
        className="h-11 w-full"
        disabled={busy || (showPinForm && !!pin.trim() && !codeOk)}
      >
        {busy ? <Loader2 className="size-4 animate-spin" /> : "Salvar cartão"}
      </Button>
    </div>
  );
}
