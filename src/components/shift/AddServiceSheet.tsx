import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { repoAddService } from "@/lib/db/repos";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";

type Step = "type" | "viability" | "reason" | "registration" | "amount" | "complements";

type ServiceType = { id: string; name: string; is_negotiation: boolean };
type Reason = { id: string; name: string };
type Complement = { id: string; name: string };

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
  const [selectedComplements, setSelectedComplements] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setStep("type");
      setType(null);
      setReason(null);
      setRegistration("");
      setAmount("");
      setSelectedComplements(new Set());
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

  const complements = useQuery({
    queryKey: ["service_complements", teamId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("service_complements")
        .select("id,name,sort_order")
        .eq("active", true)
        .order("sort_order")
        .order("name");
      if (error) throw error;
      return (data ?? []) as (Complement & { sort_order: number })[];
    },
  });

  const complementUsage = useQuery({
    queryKey: ["complement-usage", teamId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("service_complement_links")
        .select("complement_name")
        .limit(1000);
      if (error) throw error;
      const m = new Map<string, number>();
      for (const r of data ?? []) m.set(r.complement_name, (m.get(r.complement_name) ?? 0) + 1);
      return m;
    },
  });

  const sortedComplements = useMemo(() => {
    const list = complements.data ?? [];
    const usage = complementUsage.data ?? new Map<string, number>();
    return [...list].sort((a, b) => {
      const ua = usage.get(a.name) ?? 0;
      const ub = usage.get(b.name) ?? 0;
      if (ub !== ua) return ub - ua;
      return a.name.localeCompare(b.name);
    });
  }, [complements.data, complementUsage.data]);

  async function saveService(opts: {
    viable: boolean;
    reasonId?: string;
    reasonName?: string;
    registration?: string;
    negotiated?: number;
    complementIds?: string[];
  }) {
    if (!type) return;
    setSaving(true);
    try {
      const chosen = (complements.data ?? []).filter((c) =>
        (opts.complementIds ?? []).includes(c.id),
      );
      await repoAddService({
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
        complements: chosen.map((c) => ({ id: c.id, name: c.name })),
      });

      await qc.invalidateQueries({ queryKey: ["all-services", teamId] });
      await qc.invalidateQueries({ queryKey: ["complement-usage", teamId] });
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
    setStep("viability");
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[90vh] overflow-y-auto rounded-t-3xl p-0">
        <SheetHeader className="border-b border-border p-4">
          <div className="flex items-center gap-2">
            <SheetTitle className="text-left text-base">
              {step === "type" && "Tipo de Serviço"}
              {step === "viability" && type?.name}
              {step === "reason" && "Motivo da inviabilidade"}
              {step === "registration" && "Matrícula"}
              {step === "amount" && "Valor negociado"}
              {step === "complements" && "Complemento(s) do Serviço"}
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
                onClick={() => {
                  if (type?.is_negotiation) setStep("amount");
                  else setStep("complements");
                }}
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
                  setStep("complements");
                }}
                className="h-14 w-full text-base font-semibold"
              >
                Continuar
              </Button>
            </div>
          )}

          {step === "complements" && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Selecione os complementos (opcional). Toque em Finalizar para concluir.
              </p>
              <div className="grid grid-cols-2 gap-2">
                {sortedComplements.map((c) => {
                  const on = selectedComplements.has(c.id);
                  return (
                    <button
                      key={c.id}
                      onClick={() => {
                        setSelectedComplements((prev) => {
                          const n = new Set(prev);
                          if (n.has(c.id)) n.delete(c.id);
                          else n.add(c.id);
                          return n;
                        });
                      }}
                      className={
                        "rounded-xl border-2 px-3 py-4 text-sm font-medium transition-colors " +
                        (on
                          ? "border-primary bg-primary/15 text-primary"
                          : "border-border bg-card text-foreground hover:border-primary/50")
                      }
                    >
                      {c.name}
                    </button>
                  );
                })}
              </div>
              <Button
                disabled={saving}
                onClick={() => {
                  const negotiated = type?.is_negotiation ? Number(amount.replace(",", ".")) : undefined;
                  saveService({
                    viable: true,
                    negotiated,
                    complementIds: Array.from(selectedComplements),
                  });
                }}
                className="h-14 w-full text-base font-semibold"
              >
                {saving ? <Loader2 className="size-5 animate-spin" /> : "Finalizar"}
              </Button>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}