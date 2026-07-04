import { useEffect, useMemo, useState } from "react";
import { repoAddService, repoSaveCatalogOrder } from "@/lib/db/repos";
import {
  useServiceTypesCached,
  useReasonsCached,
  useComplementsCached,
  useOrdered,
  fetchAndCacheCatalogOrder,
} from "@/lib/db/catalogs";
import { getLocalDB } from "@/lib/db/local-db";
import { useLiveQuery } from "dexie-react-hooks";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetClose } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, CheckCircle2, XCircle, ArrowUpDown, Check, X } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { ReorderableGrid } from "./ReorderableGrid";
import { useTeam } from "@/hooks/use-team";
import {
  submitNegotiationToGoogleForm,
  PAYMENT_OPTIONS,
  type PaymentOption,
} from "@/lib/google-form";

type Step = "type" | "viability" | "reason" | "registration" | "amount" | "payment" | "complements";

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
  const [selectedComplements, setSelectedComplements] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [reorderMode, setReorderMode] = useState(false);
  const [payment, setPayment] = useState<PaymentOption | null>(null);
  const [parcelas, setParcelas] = useState("");
  const team = useTeam(teamId).data;

  useEffect(() => {
    if (open) {
      setStep("type");
      setType(null);
      setReason(null);
      setRegistration("");
      setAmount("");
      setSelectedComplements(new Set());
      setReorderMode(false);
      setPayment(null);
      setParcelas("");
      void fetchAndCacheCatalogOrder(teamId);
    }
  }, [open, teamId]);

  const types = useServiceTypesCached();
  const reasons = useReasonsCached();
  const complements = useComplementsCached();

  const orderedTypes = useOrdered(types.data, "tipos_servico");
  const orderedReasons = useOrdered(reasons.data, "motivos_inviabilidade");

  // Usage stats now come from the local Dexie mirror so they work offline.
  const complementUsage = useLiveQuery(async () => {
    const rows = await getLocalDB().complement_links.toArray();
    const m = new Map<string, number>();
    for (const r of rows) m.set(r.complement_name, (m.get(r.complement_name) ?? 0) + 1);
    return m;
  }, []);

  const sortedComplements = useMemo(() => {
    const list = complements.data ?? [];
    const usage = complementUsage ?? new Map<string, number>();
    return [...list].sort((a, b) => {
      const ua = usage.get(a.name) ?? 0;
      const ub = usage.get(b.name) ?? 0;
      if (ub !== ua) return ub - ua;
      return a.name.localeCompare(b.name);
    });
  }, [complements.data, complementUsage]);
  const orderedComplements = useOrdered(sortedComplements, "complementos_servico");

  const canReorder = step === "type" || step === "reason" || step === "complements";
  useEffect(() => {
    if (!canReorder && reorderMode) setReorderMode(false);
  }, [canReorder, reorderMode]);

  function saveOrder(catalog: "tipos_servico" | "motivos_inviabilidade" | "complementos_servico", ids: string[]) {
    void repoSaveCatalogOrder({ team_id: teamId, catalog, item_ids: ids });
  }

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
      <SheetContent side="bottom" hideClose className="h-[90vh] overflow-y-auto rounded-t-3xl p-0">
        <SheetHeader className="border-b border-border p-4">
          <div className="flex items-center justify-between gap-2">
            <SheetTitle className="text-left text-base">
              {step === "type" && "Tipo de Serviço"}
              {step === "viability" && type?.name}
              {step === "reason" && "Motivo da inviabilidade"}
              {step === "registration" && "Matrícula"}
              {step === "amount" && "Valor negociado"}
              {step === "payment" && "Forma de pagamento"}
              {step === "complements" && "Complemento(s) do Serviço"}
            </SheetTitle>
            <div className="flex items-center gap-2">
              {canReorder && (
                <button
                  type="button"
                  onClick={() => setReorderMode((v) => !v)}
                  className={
                    "flex items-center gap-1 rounded-lg border px-2 py-1 text-xs font-medium transition-colors " +
                    (reorderMode
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-card text-muted-foreground hover:text-foreground")
                  }
                  aria-label="Reorganizar"
                >
                  {reorderMode ? <Check className="size-4" /> : <ArrowUpDown className="size-4" />}
                  {reorderMode ? "Concluído" : "Reorganizar"}
                </button>
              )}
              <SheetClose className="flex size-8 items-center justify-center rounded-lg bg-destructive text-white hover:bg-destructive/90 focus:outline-none focus:ring-2 focus:ring-destructive focus:ring-offset-2">
                <X className="size-4" />
                <span className="sr-only">Fechar</span>
              </SheetClose>
            </div>
          </div>
        </SheetHeader>

        <div className="p-4">
          {step === "type" && (
            reorderMode ? (
              <ReorderableGrid
                items={orderedTypes.map((t) => ({ id: t.id, name: t.name }))}
                onReorder={(ids) => saveOrder("tipos_servico", ids)}
              />
            ) : (
            <div className="grid grid-cols-2 gap-3">
              {orderedTypes.map((t) => (
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
            )
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
            reorderMode ? (
              <ReorderableGrid
                columns={1}
                items={orderedReasons.map((r) => ({ id: r.id, name: r.name }))}
                onReorder={(ids) => saveOrder("motivos_inviabilidade", ids)}
              />
            ) : (
            <div className="grid grid-cols-1 gap-2">
              {orderedReasons.map((r) => (
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
            )
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
                  setStep("payment");
                }}
                className="h-14 w-full text-base font-semibold"
              >
                Continuar
              </Button>
            </div>
          )}

          {step === "payment" && (
            <div className="space-y-4">
              <div>
                <Label htmlFor="mat-neg">Matrícula</Label>
                <Input
                  id="mat-neg"
                  value={registration}
                  onChange={(e) => setRegistration(e.target.value)}
                  inputMode="numeric"
                  placeholder="Ex: 103442500"
                  className="h-14 text-lg"
                  autoFocus
                />
              </div>
              <div>
                <Label>Forma de pagamento</Label>
                <div className="mt-1 grid grid-cols-2 gap-2">
                  {PAYMENT_OPTIONS.map((p) => {
                    const on = payment === p;
                    return (
                      <button
                        key={p}
                        type="button"
                        onClick={() => {
                          setPayment(p);
                          if (p !== "PARCELAMENTO BOLETO") setParcelas("");
                        }}
                        className={
                          "rounded-xl border-2 px-3 py-3 text-sm font-medium transition-colors " +
                          (on
                            ? "border-primary bg-primary/15 text-primary"
                            : "border-border bg-card text-foreground hover:border-primary/50")
                        }
                      >
                        {p}
                      </button>
                    );
                  })}
                </div>
              </div>
              {payment === "PARCELAMENTO BOLETO" && (
                <div>
                  <Label htmlFor="parc">Quantidade de parcelas</Label>
                  <Input
                    id="parc"
                    value={parcelas}
                    onChange={(e) => setParcelas(e.target.value.replace(/[^0-9]/g, ""))}
                    inputMode="numeric"
                    placeholder="Ex: 6"
                    className="h-14 text-lg"
                  />
                </div>
              )}
              <Button
                disabled={
                  saving ||
                  !registration.trim() ||
                  !payment ||
                  (payment === "PARCELAMENTO BOLETO" && (!parcelas || Number(parcelas) < 2))
                }
                onClick={() => setStep("complements")}
                className="h-14 w-full text-base font-semibold"
              >
                Continuar
              </Button>
            </div>
          )}

          {step === "complements" && (
            <div className="space-y-4">
              {!reorderMode && (
                <p className="text-sm text-muted-foreground">
                  Selecione os complementos (opcional). Toque em Finalizar para concluir.
                </p>
              )}
              {reorderMode ? (
                <ReorderableGrid
                  items={orderedComplements.map((c) => ({ id: c.id, name: c.name }))}
                  onReorder={(ids) => saveOrder("complementos_servico", ids)}
                />
              ) : (
              <div className="grid grid-cols-2 gap-2">
                {orderedComplements.map((c) => {
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
              )}
              {!reorderMode && (
              <Button
                disabled={saving}
                onClick={() => {
                  const negotiated = type?.is_negotiation ? Number(amount.replace(",", ".")) : undefined;
                  saveService({
                    viable: true,
                    negotiated,
                    registration: type?.is_negotiation ? registration.trim() : undefined,
                    complementIds: Array.from(selectedComplements),
                  });

                  // Envio do descritivo de negociação em segundo plano com feedback.
                  if (type?.is_negotiation && payment && negotiated != null) {
                    const parc = payment === "PARCELAMENTO BOLETO" ? Number(parcelas) : 0;
                    const opened = submitNegotiationToGoogleForm({
                      date: new Date(),
                      leader: team?.leader,
                      setor: team?.setor_nome,
                      matricula: registration.trim(),
                      paymentMethod: payment,
                      valorAVista: parc >= 2 ? undefined : negotiated,
                      valorTotalParcelado: parc >= 2 ? negotiated : undefined,
                      qtdParcelas: parc >= 2 ? parc : undefined,
                    });
                    if (opened) {
                      toast.success("Confirmação do Forms abriu em nova aba — tire o print para compartilhar");
                    } else {
                      toast.error("Permita pop-ups para ver a confirmação do Google Forms");
                    }
                  }
                }}
                className="h-14 w-full text-base font-semibold"
              >
                {saving ? <Loader2 className="size-5 animate-spin" /> : "Finalizar"}
              </Button>
              )}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}