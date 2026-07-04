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
  submitNegotiationSilent,
  PAYMENT_OPTIONS,
  type PaymentOption,
} from "@/lib/google-form";
import { shareNegotiation } from "@/lib/share-negotiation";
import { setFormsStatus } from "@/lib/forms-status";

type Step = "type" | "viability" | "reason" | "registration" | "payment" | "complements";

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
  const [selectedComplements, setSelectedComplements] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [reorderMode, setReorderMode] = useState(false);
  const [payments, setPayments] = useState<Set<PaymentOption>>(new Set());
  const [valorAVista, setValorAVista] = useState("");
  const [valorParcelado, setValorParcelado] = useState("");
  const [parcelas, setParcelas] = useState("");
  const team = useTeam(teamId).data;

  useEffect(() => {
    if (open) {
      setStep("type");
      setType(null);
      setReason(null);
      setRegistration("");
      setSelectedComplements(new Set());
      setReorderMode(false);
      setPayments(new Set());
      setValorAVista("");
      setValorParcelado("");
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
  }): Promise<string | null> {
    if (!type) return null;
    setSaving(true);
    try {
      const chosen = (complements.data ?? []).filter((c) =>
        (opts.complementIds ?? []).includes(c.id),
      );
      const created = await repoAddService({
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
      return created.id;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar");
      return null;
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
                  if (type?.is_negotiation) setStep("registration");
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
                onClick={() => {
                  if (type?.is_negotiation) {
                    setStep("payment");
                    return;
                  }
                  void saveService({
                    viable: false,
                    reasonId: reason?.id,
                    reasonName: reason?.name,
                    registration: registration.trim(),
                  });
                }}
                className="h-14 w-full text-base font-semibold"
              >
                {saving ? (
                  <Loader2 className="size-5 animate-spin" />
                ) : type?.is_negotiation ? (
                  "Continuar"
                ) : (
                  "Salvar"
                )}
              </Button>
            </div>
          )}

          {step === "payment" && (
            <div className="space-y-4">
              <div>
                <Label>Forma(s) de pagamento</Label>
                <p className="mb-1 text-xs text-muted-foreground">
                  Toque para selecionar uma ou mais. Ao combinar à vista + parcelado, preencha os dois valores abaixo.
                </p>
                <div className="mt-1 grid grid-cols-2 gap-2">
                  {PAYMENT_OPTIONS.map((p) => {
                    const on = payments.has(p);
                    return (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setPayments(new Set([p]))}
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
              {(() => {
                const hasInstallment =
                  payments.has("PARCELAMENTO BOLETO") || payments.has("CARTÃO DE CRÉDITO");
                // Quando é parcelado, o campo à vista também abre (opcional) para casos
                // em que o cliente paga parte à vista e o restante parcelado.
                const showUpfront = payments.size > 0;
                const nVista = Number(valorAVista.replace(",", "."));
                const nParc = Number(valorParcelado.replace(",", "."));
                const nParcelas = Number(parcelas);
                const vistaFilled = valorAVista.trim() !== "" && isFinite(nVista) && nVista > 0;
                const invalidVista = !hasInstallment && !vistaFilled;
                const invalidParc = hasInstallment && (!valorParcelado.trim() || !isFinite(nParc) || nParc <= 0);
                const invalidQtd = hasInstallment && (!parcelas || nParcelas < 2);
                return (
                  <>
                    {showUpfront && (
                      <div>
                        <Label htmlFor="val-vista">
                          Valor à vista (R$){hasInstallment ? " — opcional" : ""}
                        </Label>
                        <Input
                          id="val-vista"
                          value={valorAVista}
                          onChange={(e) => setValorAVista(e.target.value.replace(/[^0-9.,]/g, ""))}
                          inputMode="decimal"
                          placeholder="0,00"
                          className="h-14 text-lg"
                        />
                      </div>
                    )}
                    {hasInstallment && (
                      <>
                        <div>
                          <Label htmlFor="val-parc">Valor total parcelado (R$)</Label>
                          <Input
                            id="val-parc"
                            value={valorParcelado}
                            onChange={(e) => setValorParcelado(e.target.value.replace(/[^0-9.,]/g, ""))}
                            inputMode="decimal"
                            placeholder="0,00"
                            className="h-14 text-lg"
                          />
                        </div>
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
                      </>
                    )}
                    <Button
                      disabled={
                        saving ||
                        !registration.trim() ||
                        payments.size === 0 ||
                        invalidVista ||
                        invalidParc ||
                        invalidQtd
                      }
                      onClick={() => setStep("complements")}
                      className="h-14 w-full text-base font-semibold"
                    >
                      Continuar
                    </Button>
                  </>
                );
              })()}
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
              (() => {
                const hasInstallment =
                  payments.has("PARCELAMENTO BOLETO") || payments.has("CARTÃO DE CRÉDITO");
                const rawVista = Number(valorAVista.replace(",", "."));
                const nVista = valorAVista.trim() && isFinite(rawVista) && rawVista > 0 ? rawVista : 0;
                const nParc = hasInstallment ? Number(valorParcelado.replace(",", ".")) : 0;
                const nParcelas = hasInstallment ? Number(parcelas) : 0;
                const negotiated = type?.is_negotiation
                  ? (isFinite(nVista) ? nVista : 0) + (isFinite(nParc) ? nParc : 0)
                  : undefined;
                const submission =
                  type?.is_negotiation && payments.size > 0 && negotiated != null && negotiated > 0
                    ? {
                        date: new Date(),
                        leader: team?.leader,
                        setor: team?.setor_nome,
                        matricula: registration.trim(),
                        paymentMethods: Array.from(payments),
                        valorAVista: nVista > 0 ? nVista : undefined,
                        valorTotalParcelado: hasInstallment ? nParc : undefined,
                        qtdParcelas: hasInstallment ? nParcelas : undefined,
                      }
                    : null;

                const finalizeService = () =>
                  saveService({
                    viable: true,
                    negotiated,
                    registration: type?.is_negotiation ? registration.trim() : undefined,
                    complementIds: Array.from(selectedComplements),
                  });

                if (!submission) {
                  return (
                    <Button
                      disabled={saving}
                      onClick={finalizeService}
                      className="h-14 w-full text-base font-semibold"
                    >
                      {saving ? <Loader2 className="size-5 animate-spin" /> : "Finalizar"}
                    </Button>
                  );
                }

                return (
                  <div className="space-y-2">
                    <Button
                      disabled={saving}
                      onClick={async () => {
                        const [serviceId, result] = await Promise.all([
                          finalizeService(),
                          submitNegotiationToGoogleForm(submission)
                            .then((opened) => ({ ok: opened as boolean, err: null as unknown }))
                            .catch((err: unknown) => ({ ok: false, err })),
                        ]);
                        if (serviceId) {
                          setFormsStatus(serviceId, result.ok ? "sent" : "failed");
                        }
                        if (result.ok) {
                          toast.success("Tela do Forms abriu em nova aba — tire o print");
                        } else if (result.err) {
                          toast.error(
                            `Falha ao enviar para o Forms: ${
                              result.err instanceof Error ? result.err.message : "erro desconhecido"
                            }`,
                          );
                        } else {
                          toast.error("Permita pop-ups para ver a confirmação do Forms");
                        }
                      }}
                      className="h-14 w-full text-base font-semibold"
                    >
                      {saving ? <Loader2 className="size-5 animate-spin" /> : "Finalizar e abrir Forms (print manual)"}
                    </Button>
                    <Button
                      variant="outline"
                      disabled={saving}
                      onClick={() => {
                        void (async () => {
                          const [serviceId, ok] = await Promise.all([
                            finalizeService(),
                            submitNegotiationSilent(submission),
                          ]);
                          if (serviceId) {
                            setFormsStatus(serviceId, ok ? "sent" : "failed");
                          }
                          if (ok) toast.success("Resposta enviada ao Forms");
                          else toast.error("Falha ao enviar para o Forms — verifique sua conexão");
                        })();
                        void shareNegotiation(submission)
                          .then((ok) => {
                            if (ok) {
                              toast.success("Legenda copiada — cole no campo de legenda da imagem no WhatsApp");
                            }
                          })
                          .catch(() => toast.error("Falha ao gerar imagem do descritivo"));
                      }}
                      className="h-14 w-full text-base font-semibold"
                    >
                      Finalizar e compartilhar imagem no WhatsApp
                    </Button>
                  </div>
                );
              })()
              )}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}