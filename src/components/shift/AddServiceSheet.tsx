import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, CheckCircle2, XCircle, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";

type Step = "type" | "viability" | "reason" | "registration" | "amount";

type ServiceType = { id: string; name: string; is_negotiation: boolean };
type Reason = { id: string; name: string };

export function AddServiceSheet({
  open,
  onOpenChange,
  teamId,
  shiftId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  teamId: string;
  shiftId: string;
}) {
  const qc = useQueryClient();
  const [step, setStep] = useState<Step>("type");
  const [type, setType] = useState<ServiceType | null>(null);
  const [reason, setReason] = useState<Reason | null>(null);
  const [registration, setRegistration] = useState("");
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setStep("type");
      setType(null);
      setReason(null);
      setRegistration("");
      setAmount("");
    }
  }, [open]);

  const types = useQuery({
    queryKey: ["service_types", teamId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("service_types")
        .select("id,name,is_negotiation,sort_order")
        .eq("active", true)
        .order("sort_order")
        .order("name");
      if (error) throw error;
      return data as (ServiceType & { sort_order: number })[];
    },
  });

  const reasons = useQuery({
    queryKey: ["inviability_reasons", teamId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inviability_reasons")
        .select("id,name")
        .eq("active", true)
        .order("name");
      if (error) throw error;
      return data as Reason[];
    },
  });

  async function saveService(opts: {
    viable: boolean;
    reasonId?: string;
    reasonName?: string;
    registration?: string;
    negotiated?: number;
  }) {
    if (!type) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("services").insert({
        team_id: teamId,
        shift_id: shiftId,
        service_type_id: type.id,
        service_type_name: type.name,
        is_negotiation: type.is_negotiation,
        viable: opts.viable,
        reason_id: opts.reasonId ?? null,
        reason_name: opts.reasonName ?? null,
        registration_number: opts.registration ?? null,
        negotiated_value: opts.negotiated ?? null,
      });
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["shift-services", shiftId] });
      toast.success("Serviço registrado");
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  function pickType(t: ServiceType) {
    setType(t);
    if (t.is_negotiation) setStep("amount");
    else setStep("viability");
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[90vh] overflow-y-auto rounded-t-3xl p-0">
        <SheetHeader className="border-b border-border p-4">
          <div className="flex items-center gap-2">
            {step !== "type" && (
              <button
                onClick={() =>
                  setStep(step === "registration" ? "reason" : step === "reason" ? "viability" : "type")
                }
                className="rounded-md p-1 text-muted-foreground hover:text-foreground"
                aria-label="Voltar"
              >
                <ArrowLeft className="size-5" />
              </button>
            )}
            <SheetTitle className="text-left text-base">
              {step === "type" && "Tipo de Serviço"}
              {step === "viability" && type?.name}
              {step === "reason" && "Motivo da inviabilidade"}
              {step === "registration" && "Matrícula"}
              {step === "amount" && "Valor negociado"}
            </SheetTitle>
          </div>
        </SheetHeader>

        <div className="p-4">
          {step === "type" && (
            <div className="grid grid-cols-2 gap-3">
              {types.data?.map((t) => (
                <button
                  key={t.id}
                  onClick={() => pickType(t)}
                  className="flex h-24 items-center justify-center rounded-2xl border-2 border-border bg-card p-3 text-center text-base font-semibold transition-colors hover:border-primary hover:bg-accent"
                >
                  {t.name}
                </button>
              ))}
              {types.isLoading && (
                <div className="col-span-2 flex justify-center py-10">
                  <Loader2 className="size-6 animate-spin" />
                </div>
              )}
            </div>
          )}

          {step === "viability" && (
            <div className="grid grid-cols-2 gap-3">
              <button
                disabled={saving}
                onClick={() => saveService({ viable: true })}
                className="flex h-40 flex-col items-center justify-center gap-3 rounded-2xl border-2 border-border bg-card font-bold text-success transition-colors hover:border-success hover:bg-success/10"
              >
                <CheckCircle2 className="size-12" />
                <span className="text-xl">Viável</span>
              </button>
              <button
                disabled={saving}
                onClick={() => setStep("reason")}
                className="flex h-40 flex-col items-center justify-center gap-3 rounded-2xl border-2 border-border bg-card font-bold text-destructive transition-colors hover:border-destructive hover:bg-destructive/10"
              >
                <XCircle className="size-12" />
                <span className="text-xl">Inviável</span>
              </button>
            </div>
          )}

          {step === "reason" && (
            <div className="grid grid-cols-1 gap-2">
              {reasons.data?.map((r) => (
                <button
                  key={r.id}
                  onClick={() => {
                    setReason(r);
                    setStep("registration");
                  }}
                  className="rounded-xl border border-border bg-card px-4 py-4 text-left text-base font-medium hover:border-primary hover:bg-accent"
                >
                  {r.name}
                </button>
              ))}
            </div>
          )}

          {step === "registration" && (
            <div className="space-y-4">
              <div>
                <Label htmlFor="mat">Matrícula</Label>
                <Input
                  id="mat"
                  value={registration}
                  onChange={(e) => setRegistration(e.target.value)}
                  inputMode="numeric"
                  placeholder="Ex: 103442500"
                  className="h-14 text-lg"
                  autoFocus
                />
              </div>
              <Button
                disabled={saving || !registration.trim()}
                onClick={() =>
                  saveService({
                    viable: false,
                    reasonId: reason?.id,
                    reasonName: reason?.name,
                    registration: registration.trim(),
                  })
                }
                className="h-14 w-full text-base font-semibold"
              >
                {saving ? <Loader2 className="size-5 animate-spin" /> : "Salvar"}
              </Button>
            </div>
          )}

          {step === "amount" && (
            <div className="space-y-4">
              <div>
                <Label htmlFor="val">Valor negociado (R$)</Label>
                <Input
                  id="val"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value.replace(/[^0-9.,]/g, ""))}
                  inputMode="decimal"
                  placeholder="0,00"
                  className="h-14 text-lg"
                  autoFocus
                />
              </div>
              <Button
                disabled={saving || !amount.trim()}
                onClick={() => {
                  const n = Number(amount.replace(",", "."));
                  if (!isFinite(n) || n <= 0) {
                    toast.error("Valor inválido");
                    return;
                  }
                  saveService({ viable: true, negotiated: n });
                }}
                className="h-14 w-full text-base font-semibold"
              >
                {saving ? <Loader2 className="size-5 animate-spin" /> : "Salvar negociação"}
              </Button>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}