import { useEffect, useMemo, useState } from "react";
import {
  repoAddService,
  repoAttachServiceLocation,
  repoSaveCatalogOrder,
  repoUpdateService,
} from "@/lib/db/repos";
import type { LocalService } from "@/lib/db/local-db";
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
import { Loader2, CheckCircle2, XCircle, ArrowUpDown, Check, X, Banknote } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { ReorderableGrid } from "./ReorderableGrid";
import { useTeam } from "@/hooks/use-team";
import {
  submitNegotiationToGoogleForm,
  PAYMENT_OPTIONS,
  type PaymentOption,
} from "@/lib/google-form";
import { buildCaption } from "@/lib/share-negotiation";
import { setFormsStatus, saveFailedPayload } from "@/lib/forms-status";
import { tryGetGeoFix } from "@/lib/geo";

type Step = "type" | "viability" | "reason" | "registration" | "payment" | "complements" | "negotiationCheck";

type ServiceType = { id: string; name: string; is_negotiation: boolean };

// Tipos de serviço que podem ou não resultar em negociação (ex.: "Pós corte").
// Após perguntar se é viável/inviável, se for viável, perguntamos se houve negociação.
function isNegotiableType(t: ServiceType | null): boolean {
  if (!t || t.is_negotiation) return false;
  return (
    t.name
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .trim() === "pos corte"
  );
}
type Reason = { id: string; name: string };

export function AddServiceSheet({
  open,
  onOpenChange,
  teamId,
  shiftId,
  editService = null,
  editComplements = [],
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  teamId: string;
  shiftId: string;
  /** Quando presente, o sheet abre em modo de edição pré-preenchido. */
  editService?: LocalService | null;
  editComplements?: { id: string | null; name: string }[];
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
  const [negotiatedOverride, setNegotiatedOverride] = useState(false);
  const team = useTeam(teamId).data;

  // Serviço segue o fluxo de negociação quando o tipo já é de negociação
  // (catálogo) ou quando o usuário respondeu "Sim" para tipos negociáveis
  // como "Pós corte".
  const isNegotiation = type?.is_negotiation === true || negotiatedOverride;

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
      setNegotiatedOverride(false);
      if (editService) {
        // Pré-preenche o fluxo com os dados atuais do serviço. Para tipos
        // negociáveis como "Pós corte", o flag de negociação mora no
        // negotiatedOverride (o tipo do catálogo em si não é de negociação).
        const t: ServiceType = {
          id: editService.service_type_id ?? "",
          name: editService.service_type_name,
          is_negotiation: editService.is_negotiation,
        };
        if (editService.is_negotiation && isNegotiableType({ ...t, is_negotiation: false })) {
          t.is_negotiation = false;
          setNegotiatedOverride(true);
        }
        setType(t);
        if (editService.reason_id || editService.reason_name) {
          setReason({
            id: editService.reason_id ?? "",
            name: editService.reason_name ?? "",
          });
        }
        setRegistration(editService.registration_number ?? "");
        if (editService.is_negotiation && editService.negotiated_value != null) {
          // Não sabemos a divisão original à vista/parcelado: pré-preenche o
          // total no campo parcelado e o usuário ajusta se necessário.
          setValorParcelado(String(editService.negotiated_value).replace(".", ","));
        }
        setSelectedComplements(
          new Set(editComplements.map((c) => c.id).filter((v): v is string => !!v)),
        );
      }
      void fetchAndCacheCatalogOrder(teamId);
    }
  }, [open, teamId, editService, editComplements]);

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
      if (editService) {
        // Edição: preserva id/created_at e a localização já capturada.
        const updated = await repoUpdateService({
          service_id: editService.id,
          service_type_id: type.id || null,
          service_type_name: type.name,
          is_negotiation: isNegotiation,
          viable: opts.viable,
          reason_id: opts.reasonId ?? null,
          reason_name: opts.reasonName ?? null,
          registration_number: opts.registration ?? null,
          negotiated_value: opts.negotiated ?? null,
          complements: chosen.map((c) => ({ id: c.id, name: c.name })),
        });
        await qc.invalidateQueries({ queryKey: ["all-services", teamId] });
        toast.success("Serviço atualizado");
        onOpenChange(false);
        return updated.id;
      }
      // Captura GPS em paralelo: espera pouco para gravar junto; se o Android
      // entregar a posição depois (comum offline), anexamos ao registro local.
      const fixPromise = tryGetGeoFix(8_000);
      const fix = await withSoftTimeout(fixPromise, 1_200);
      const created = await repoAddService({
        team_id: teamId,
        shift_id: shiftId,
        service_type_id: type.id,
        service_type_name: type.name,
        is_negotiation: isNegotiation,
        viable: opts.viable,
        reason_id: opts.reasonId ?? null,
        reason_name: opts.reasonName ?? null,
        registration_number: opts.registration ?? null,
        negotiated_value: opts.negotiated ?? null,
        complements: chosen.map((c) => ({ id: c.id, name: c.name })),
        lat: fix?.lat ?? null,
        lng: fix?.lng ?? null,
        accuracy_m: fix?.accuracy_m ?? null,
        captured_at: fix?.captured_at ?? null,
      });

      if (!fix) {
        void fixPromise.then((lateFix) => {
          if (!lateFix) return;
          return repoAttachServiceLocation({
            service_id: created.id,
            lat: lateFix.lat,
            lng: lateFix.lng,
            accuracy_m: lateFix.accuracy_m,
            captured_at: lateFix.captured_at,
          });
        });
      }

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

  function withSoftTimeout<T>(promise: PromiseLike<T>, timeoutMs: number): Promise<T | null> {
    return Promise.race([
      promise,
      new Promise<null>((resolve) => window.setTimeout(() => resolve(null), timeoutMs)),
    ]);
  }

  function pickType(t: ServiceType) {
    setType(t);
    // Sempre vai para viabilidade primeiro — a pergunta de negociação
    // vem DEPOIS, só se for viável e o tipo for negociável.
    setStep("viability");
  }

  // Chamada quando o usuário escolhe Viável ou Inviável.
  // Se viável + tipo negociável (pós corte), pergunta sobre negociação.
  // Caso contrário, segue direto para o próximo passo.
  function onViabilityChosen(viable: boolean) {
    if (!viable) {
      // Inviável: vai para motivo, sem perguntar sobre negociação.
      setNegotiatedOverride(false);
      setStep("reason");
      return;
    }
    // Viável: se for tipo negociável, pergunta se houve negociação;
    // senão, vai direto para complementos.
    if (isNegotiableType(type)) {
      setStep("negotiationCheck");
    } else {
      setNegotiatedOverride(false);
      setStep("complements");
    }
  }

  function stepTitle(): string {
    if (editService && step !== "type") return "Editar";
    switch (step) {
      case "type": return "Tipo de Serviço";
      case "negotiationCheck": return ""; // título customizado no JSX
      case "viability": return type?.name ?? "";
      case "reason": return "Motivo da inviabilidade";
      case "registration": return "Matrícula";
      case "payment": return "Forma de pagamento";
      case "complements": return "Complemento(s) do Serviço";
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" hideClose className="h-[90vh] overflow-y-auto rounded-t-3xl p-0">
        <SheetHeader className="border-b border-border p-4">
          <div className="flex items-center justify-between gap-2">
            <SheetTitle className="text-left text-base">
              {stepTitle()}
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
            <div className="space-y-4">
              <p className="text-center text-sm text-muted-foreground">
                Este {type?.name} foi viável?
              </p>
              <div className="grid grid-cols-2 gap-3">
                <button
                  disabled={saving}
                  onClick={() => onViabilityChosen(true)}
                  className="flex h-40 flex-col items-center justify-center gap-3 rounded-2xl border-2 border-border bg-card font-bold text-success transition-colors hover:border-success hover:bg-success/10"
                >
                  <CheckCircle2 className="size-12" />
                  <span className="text-xl">Viável</span>
                </button>
                <button
                  disabled={saving}
                  onClick={() => onViabilityChosen(false)}
                  className="flex h-40 flex-col items-center justify-center gap-3 rounded-2xl border-2 border-border bg-card font-bold text-destructive transition-colors hover:border-destructive hover:bg-destructive/10"
                >
                  <XCircle className="size-12" />
                  <span className="text-xl">Inviável</span>
                </button>
              </div>
            </div>
          )}

          {step === "negotiationCheck" && (
            <div className="space-y-4">
              {/* Título destacado para chamar atenção */}
              <div className="rounded-2xl bg-primary/10 border-2 border-primary px-4 py-5 text-center">
                <p className="text-lg font-bold text-primary">
                  Houve negociação com o cliente?
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Responda para definir o fluxo deste {type?.name}.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <button
                  disabled={saving}
                  onClick={() => {
                    setNegotiatedOverride(true);
                    setStep("registration");
                  }}
                  className="flex h-40 flex-col items-center justify-center gap-3 rounded-2xl border-2 border-primary/40 bg-card font-bold text-primary transition-colors hover:border-primary hover:bg-primary/10"
                >
                  <Banknote className="size-12" />
                  <span className="text-xl">Sim, negociado</span>
                </button>
                <button
                  disabled={saving}
                  onClick={() => {
                    setNegotiatedOverride(false);
                    setStep("complements");
                  }}
                  className="flex h-40 flex-col items-center justify-center gap-3 rounded-2xl border-2 border-border bg-card font-bold text-foreground transition-colors hover:border-primary hover:bg-accent"
                >
                  <XCircle className="size-12 text-muted-foreground" />
                  <span className="text-xl">Não</span>
                </button>
              </div>
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
                  if (isNegotiation) {
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
                ) : isNegotiation ? (
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
                // Aceita 1 parcela: crédito à vista (pagamento único no cartão).
                const invalidQtd = hasInstallment && (!parcelas || nParcelas < 1);
                return (
                  <>
                    {showUpfront && (
                      <div>
                        <Label htmlFor="val-vista">Valor à vista (R$)</Label>
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
                const negotiated = isNegotiation
                  ? (isFinite(nVista) ? nVista : 0) + (isFinite(nParc) ? nParc : 0)
                  : undefined;
                const submission =
                  isNegotiation && payments.size > 0 && negotiated != null && negotiated > 0
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
                    registration: isNegotiation ? registration.trim() : undefined,
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
                        const online = typeof navigator === "undefined" ? true : navigator.onLine;
                        if (!online) {
                          const serviceId = await finalizeService();
                          if (serviceId) {
                            saveFailedPayload(serviceId, submission);
                            setFormsStatus(serviceId, "failed");
                          }
                          toast.warning(
                            "Sem conexão — Forms marcado como pendente. Toque no rótulo depois para enviar.",
                          );
                          return;
                        }
                        const caption = buildCaption(submission);
                        try {
                          await navigator.clipboard.writeText(caption);
                        } catch {
                          /* alguns navegadores exigem gesto — ignorado */
                        }
                        const [serviceId, result] = await Promise.all([
                          finalizeService(),
                          submitNegotiationToGoogleForm(submission)
                            .then((opened) => ({ ok: opened as boolean, err: null as unknown }))
                            .catch((err: unknown) => ({ ok: false, err })),
                        ]);
                        if (serviceId) {
                          setFormsStatus(serviceId, result.ok ? "sent" : "failed");
                          if (!result.ok) saveFailedPayload(serviceId, submission);
                        }
                        if (result.ok) {
                          toast.success("Forms aberto — descritivo copiado para colar");
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
                      {saving ? <Loader2 className="size-5 animate-spin" /> : "Finalizar e abrir Forms"}
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
