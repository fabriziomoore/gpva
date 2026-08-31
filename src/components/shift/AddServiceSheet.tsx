import { useState, useEffect, useRef } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetClose } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  X, ChevronRight, Check, Plus, Search, Scissors, Banknote,
  CheckCircle2, XCircle, MapPin, AlertTriangle, Loader2,
  GripVertical,
} from "lucide-react";
import { getLocalDB, type LocalService } from "@/lib/db/local-db";
import { repoUpsertService, repoUpsertComplementLink } from "@/lib/db/repos";
import { formatBRL } from "@/lib/format";
import { reverseGeocode } from "@/lib/reverse-geocode";
import { submitNegotiationToGoogleForm, getNegotiationFormUrl } from "@/lib/google-form";
import { setFormsStatus, getFormsStatus } from "@/lib/forms-status";
import { useOrdered } from "@/lib/db/catalogs";

// ─── Tipos ───────────────────────────────────────────────────────────────────
type Step =
  | "type"
  | "postCorteViability"
  | "reason"
  | "registration"
  | "negotiationCheck"
  | "negotiationDetails"
  | "complements"
  | "payment"
  | "details";

interface ServiceType {
  id: string;
  name: string;
  requires_negotiation: boolean;
  requires_complements: boolean;
  requires_registration: boolean;
  service_category?: string;
}

interface Complement {
  id: string;
  name: string;
}

interface Reason {
  id: string;
  name: string;
}

interface PaymentMethod {
  id: string;
  name: string;
}

// ─── Props ────────────────────────────────────────────────────────────────────
export function AddServiceSheet({
  open,
  onOpenChange,
  teamId,
  shiftId,
  editService,
  editComplements,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  teamId: string;
  shiftId: string;
  editService?: LocalService | null;
  editComplements?: { id: string | null; name: string }[];
}) {
  const [step, setStep] = useState<Step>("type");
  const [search, setSearch] = useState("");

  // Tipo
  const [selectedType, setSelectedType] = useState<ServiceType | null>(null);

  // Viabilidade (Pós corte)
  const [postCorteViable, setPostCorteViable] = useState<boolean | null>(null);

  // Motivo de inviabilidade
  const [selectedReason, setSelectedReason] = useState<Reason | null>(null);
  const [reasonSearch, setReasonSearch] = useState("");

  // Matrícula
  const [registration, setRegistration] = useState("");

  // Negociação
  const [isNegotiation, setIsNegotiation] = useState<boolean | null>(null);
  const [negotiatedValue, setNegotiatedValue] = useState("");
  const [selectedPaymentMethods, setSelectedPaymentMethods] = useState<string[]>([]);
  const [parcelas, setParcelas] = useState("");

  // Complementos
  const [selectedComplements, setSelectedComplements] = useState<string[]>([]);
  const [complementSearch, setComplementSearch] = useState("");

  // GPS
  const [gpsStatus, setGpsStatus] = useState<"idle" | "loading" | "ok" | "fail">("idle");
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);

  // Saving
  const [saving, setSaving] = useState(false);

  // ─── Catalogos ──────────────────────────────────────────────────────────────
  const { data: typesRaw } = useOrdered<ServiceType>("service_types");
  const { data: complementsRaw } = useOrdered<Complement>("complements");
  const { data: reasonsRaw } = useOrdered<Reason>("unviability_reasons");
  const { data: paymentsRaw } = useOrdered<PaymentMethod>("payment_methods");

  const serviceTypes: ServiceType[] = typesRaw ?? [];
  const complements: Complement[] = complementsRaw ?? [];
  const reasons: Reason[] = reasonsRaw ?? [];
  const payments: PaymentMethod[] = paymentsRaw ?? [];

  // ─── Init / edit ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) {
      setStep("type");
      setSearch("");
      setSelectedType(null);
      setPostCorteViable(null);
      setSelectedReason(null);
      setReasonSearch("");
      setRegistration("");
      setIsNegotiation(null);
      setNegotiatedValue("");
      setSelectedPaymentMethods([]);
      setParcelas("");
      setSelectedComplements([]);
      setComplementSearch("");
      setGpsStatus("idle");
      setLocation(null);
      setSaving(false);
      return;
    }
    if (editService) {
      setSelectedType(
        serviceTypes.find((t) => t.id === editService.service_type_id) ?? null,
      );
      setPostCorteViable(editService.viable);
      setSelectedReason(
        reasons.find((r) => r.id === editService.reason_id) ?? null,
      );
      setRegistration(editService.registration_number ?? "");
      setIsNegotiation(editService.is_negotiation);
      setNegotiatedValue(editService.negotiated_value ? String(editService.negotiated_value) : "");
      setSelectedPaymentMethods(
        editService.payment_methods
          ? (JSON.parse(editService.payment_methods as string) as string[])
          : [],
      );
      setParcelas(editService.parcelas ? String(editService.parcelas) : "");
      setSelectedComplements(editComplements?.map((c) => c.name) ?? []);
      setLocation(editService.lat != null && editService.lng != null ? { lat: editService.lat, lng: editService.lng } : null);
      setGpsStatus(location ? "ok" : "idle");
      setStep("type");
    } else {
      setStep("type");
      void fetchLocation();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // ─── GPS ────────────────────────────────────────────────────────────────────
  async function fetchLocation() {
    setGpsStatus("loading");
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          timeout: 8000,
          enableHighAccuracy: true,
        });
      });
      setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      setGpsStatus("ok");
    } catch {
      setGpsStatus("fail");
      setLocation(null);
    }
  }

  // ─── Filtros ────────────────────────────────────────────────────────────────
  const filteredTypes = serviceTypes.filter((t) =>
    t.name.toLowerCase().includes(search.toLowerCase()),
  );
  const filteredComplements = complements.filter((c) =>
    c.name.toLowerCase().includes(complementSearch.toLowerCase()),
  );
  const filteredReasons = reasons.filter((r) =>
    r.name.toLowerCase().includes(reasonSearch.toLowerCase()),
  );

  // ─── Avançar passo ──────────────────────────────────────────────────────────
  function go(type: ServiceType) {
    setSelectedType(type);
    setSearch("");
    if (type.id === "pos-corte") {
      // Pós corte: a PRIMEIRA pergunta é se foi negociado.
      // Sim → fluxo de negociação. Não → pergunta viável/inviável.
      setStep("negotiationCheck");
    } else if (type.requires_negotiation) {
      setIsNegotiation(true);
      setStep("negotiationDetails");
    } else {
      if (type.requires_complements) {
        setStep("complements");
      } else {
        void save(type, true, null, null, null, null, null);
      }
    }
  }

  function handlePostCorteViability(viable: boolean) {
    setPostCorteViable(viable);
    if (!viable) {
      setStep("reason");
    } else {
      setStep("complements");
    }
  }

  function handleNegotiationCheck(negotiated: boolean) {
    setIsNegotiation(negotiated);
    if (negotiated) {
      setStep("negotiationDetails");
    } else {
      // Não negociado → pergunta se foi viável ou inviável.
      setStep("postCorteViability");
    }
  }

  function handleComplementToggle(name: string) {
    setSelectedComplements((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name],
    );
  }

  function handlePaymentToggle(id: string) {
    setSelectedPaymentMethods((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id],
    );
  }

  // ─── Salvar ─────────────────────────────────────────────────────────────────
  async function save(
    type: ServiceType,
    viable: boolean,
    reasonId: string | null,
    reasonName: string | null,
    isNeg: boolean | null,
    negValue: number | null,
    complementNames: string[] | null,
  ) {
    setSaving(true);
    try {
      const db = getLocalDB();
      const lat = location?.lat ?? null;
      const lng = location?.lng ?? null;
      let address = null;
      if (lat != null && lng != null) {
        try {
          address = await reverseGeocode(lat, lng);
        } catch {
          /* offline */
        }
      }

      const regNumber = registration.trim() || null;
      const paymentMethodsJson = selectedPaymentMethods.length > 0
        ? JSON.stringify(selectedPaymentMethods)
        : null;
      const qtdParcelas = parcelas ? parseInt(parcelas, 10) : null;

      await repoUpsertService({
        id: editService?.id,
        shift_id: shiftId,
        team_id: teamId,
        service_type_id: type.id,
        service_type_name: type.name,
        viable,
        reason_id: reasonId,
        reason_name: reasonName,
        registration_number: regNumber,
        is_negotiation: isNeg ?? false,
        negotiated_value: negValue,
        payment_methods: paymentMethodsJson,
        parcelas: qtdParcelas,
        lat,
        lng,
        address,
      });

      if (complementNames && complementNames.length > 0) {
        const svcRow = await db.services
          .where("[shift_id+team_id+service_type_id]")
          .between([shiftId, teamId, type.id], [shiftId, teamId, type.id + "\uffff"])
          .last();
        if (svcRow) {
          await db.complement_links
            .where("service_id")
            .equals(svcRow.id)
            .delete();
          for (const name of complementNames) {
            const compRow = complements.find((c) => c.name === name);
            await repoUpsertComplementLink({
              shift_id: shiftId,
              service_id: svcRow.id,
              complement_id: compRow?.id ?? null,
              complement_name: name,
            });
          }
        }
      }

      if (isNeg && negValue != null) {
        const formUrl = getNegotiationFormUrl({
          matricula: regNumber ?? "",
          valor: negValue,
          paymentMethods: selectedPaymentMethods
            .map((id) => payments.find((p) => p.id === id)?.name ?? "")
            .filter(Boolean),
          qtdParcelas,
        });
        const opened = await submitNegotiationToGoogleForm(formUrl);
        const svcRow = await db.services
          .where("[shift_id+team_id+service_type_id]")
          .between([shiftId, teamId, type.id], [shiftId, teamId, type.id + "\uffff"])
          .last();
        if (svcRow) {
          setFormsStatus(svcRow.id, opened ? "sent" : "failed");
        }
      }

      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  // ─── Concluir ───────────────────────────────────────────────────────────────
  async function finishFlow() {
    if (!selectedType) return;

    const compNames = selectedComplements;

    if (selectedType.id === "pos-corte") {
      if (postCorteViable === null) return;
      if (!postCorteViable) {
        await save(
          selectedType,
          false,
          selectedReason?.id ?? null,
          selectedReason?.name ?? null,
          null,
          null,
          compNames.length > 0 ? compNames : null,
        );
      } else {
        if (isNegotiation === null) return;
        if (isNegotiation) {
          const val = parseFloat(negotiatedValue.replace(",", ".")) || null;
          await save(
            selectedType,
            true,
            null,
            null,
            true,
            val,
            compNames.length > 0 ? compNames : null,
          );
        } else {
          await save(
            selectedType,
            true,
            null,
            null,
            false,
            null,
            compNames.length > 0 ? compNames : null,
          );
        }
      }
      return;
    }

    if (selectedType.requires_negotiation) {
      const val = parseFloat(negotiatedValue.replace(",", ".")) || null;
      await save(
        selectedType,
        true,
        null,
        null,
        isNegotiation ?? false,
        val,
        compNames.length > 0 ? compNames : null,
      );
      return;
    }

    await save(selectedType, true, null, null, null, null, compNames.length > 0 ? compNames : null);
  }

  // ─── Renders ────────────────────────────────────────────────────────────────
  const stepLabel = getStepLabel(step);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        hideClose
        className="flex h-[92vh] flex-col rounded-t-3xl p-0"
      >
        {/* Header */}
        <SheetHeader className="shrink-0 border-b border-border px-4 pb-3 pt-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {step !== "type" && (
                <button
                  type="button"
                  onClick={() => goBack()}
                  className="flex size-8 items-center justify-center rounded-lg bg-muted text-muted-foreground hover:text-foreground"
                  aria-label="Voltar"
                >
                  <X className="size-4" />
                </button>
              )}
              <SheetTitle className="text-left text-base font-semibold">
                {step === "type" ? "Novo serviço" : stepLabel}
              </SheetTitle>
            </div>
            {step !== "type" && (
              <SheetClose className="flex size-8 items-center justify-center rounded-lg bg-muted text-muted-foreground hover:text-foreground">
                <X className="size-4" />
                <span className="sr-only">Fechar</span>
              </SheetClose>
            )}
          </div>
          {step !== "type" && (
            <p className="mt-1 text-xs text-muted-foreground">
              {selectedType?.name}
            </p>
          )}
        </SheetHeader>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {step === "type" && (
            <TypeStep
              types={filteredTypes}
              search={search}
              onSearch={setSearch}
              onSelect={go}
              editMode={!!editService}
            />
          )}
          {step === "postCorteViability" && (
            <ViabilityStep
              onSelect={handlePostCorteViability}
            />
          )}
          {step === "reason" && (
            <ReasonStep
              reasons={filteredReasons}
              search={reasonSearch}
              onSearch={setReasonSearch}
              selectedReason={selectedReason}
              onSelect={(r) => {
                setSelectedReason(r);
                setStep("complements");
              }}
            />
          )}
          {step === "negotiationCheck" && (
            <NegotiationCheckStep
              onSelect={handleNegotiationCheck}
            />
          )}
          {step === "negotiationDetails" && (
            <NegotiationDetailsStep
              negotiatedValue={negotiatedValue}
              onNegotiatedValueChange={setNegotiatedValue}
              selectedPaymentMethods={selectedPaymentMethods}
              onPaymentToggle={handlePaymentToggle}
              payments={payments}
              parcelas={parcelas}
              onParcelasChange={setParcelas}
              onContinue={() => setStep("complements")}
            />
          )}
          {step === "complements" && (
            <ComplementStep
              complements={filteredComplements}
              search={complementSearch}
              onSearch={setComplementSearch}
              selected={selectedComplements}
              onToggle={handleComplementToggle}
            />
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-border p-4 pb-safe">
          {step === "complements" && (
            <Button
              onClick={finishFlow}
              disabled={saving}
              className="h-12 w-full text-base font-semibold"
            >
              {saving ? (
                <Loader2 className="size-5 animate-spin" />
              ) : (
                <>
                  <Check className="mr-2 size-5" /> Concluir
                </>
              )}
            </Button>
          )}
          {step === "type" && gpsStatus === "loading" && (
            <p className="text-center text-xs text-muted-foreground">
              <Loader2 className="mr-1 inline size-3 animate-spin" />
              Obtendo localização…
            </p>
          )}
          {step === "type" && gpsStatus === "ok" && (
            <p className="flex items-center justify-center gap-1 text-xs text-success">
              <MapPin className="size-3" /> Localização obtida
            </p>
          )}
          {step === "type" && gpsStatus === "fail" && (
            <p className="flex items-center justify-center gap-1 text-xs text-destructive">
              <AlertTriangle className="size-3" /> Sem GPS — {location ? "lançar sem local" : "tente novamente"}
              <button
                type="button"
                onClick={() => void fetchLocation()}
                className="ml-1 underline underline-offset-2"
              >
                retry
              </button>
            </p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );

  // ─── Voltar ─────────────────────────────────────────────────────────────────
  function goBack() {
    switch (step) {
      case "postCorteViability":
        setStep("type");
        setSelectedType(null);
        break;
      case "negotiationCheck":
        setStep("postCorteViability");
        break;
      case "negotiationDetails":
        setStep("negotiationCheck");
        break;
      case "reason":
        setStep("postCorteViability");
        setPostCorteViable(null);
        break;
      case "complements":
        if (selectedType?.id === "pos-corte") {
          if (postCorteViable === false) {
            setStep("reason");
          } else if (isNegotiation === true) {
            setStep("negotiationDetails");
          } else {
            setStep("negotiationCheck");
          }
        } else {
          setStep("type");
          setSelectedType(null);
        }
        break;
      default:
        setStep("type");
        setSelectedType(null);
    }
  }
}

// ─── Helpers de label ──────────────────────────────────────────────────────────
function getStepLabel(step: Step): string {
  switch (step) {
    case "postCorteViability": return "Pós corte";
    case "reason": return "Motivo da inviabilidade";
    case "negotiationCheck": return "Negociação";
    case "negotiationDetails": return "Detalhes da negociação";
    case "complements": return "Complementos";
    case "payment": return "Forma de pagamento";
    case "details": return "Detalhes";
    default: return "";
  }
}

// ─── Step: Tipo ───────────────────────────────────────────────────────────────
function TypeStep({
  types,
  search,
  onSearch,
  onSelect,
}: {
  types: ServiceType[];
  search: string;
  onSearch: (v: string) => void;
  onSelect: (t: ServiceType) => void;
  editMode: boolean;
}) {
  return (
    <div className="space-y-3 p-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Buscar tipo de serviço…"
          className="pl-9"
          autoFocus
        />
      </div>
      {types.length === 0 && (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Nenhum tipo encontrado.
        </p>
      )}
      <div className="space-y-1">
        {types.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onSelect(t)}
            className="flex w-full items-center justify-between rounded-xl border border-border bg-card px-4 py-3 text-left text-sm font-medium transition-colors hover:border-primary hover:bg-primary/5"
          >
            <span>{t.name}</span>
            <ChevronRight className="size-4 text-muted-foreground" />
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Step: Viabilidade (Pós corte) ────────────────────────────────────────────
function ViabilityStep({ onSelect }: { onSelect: (viable: boolean) => void }) {
  return (
    <div className="space-y-3 p-4">
      <div className="mb-6 mt-2 text-center">
        <Scissors className="mx-auto mb-3 size-12 text-primary" />
        <h2 className="text-lg font-bold">Pós corte</h2>
        <p className="mt-1 text-sm text-muted-foreground">O serviço foi viável?</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => onSelect(true)}
          className="flex flex-col items-center gap-2 rounded-2xl border-2 border-success/40 bg-success/10 px-4 py-6 text-success transition-all hover:border-success hover:bg-success/20 active:scale-95"
        >
          <CheckCircle2 className="size-10" />
          <span className="text-base font-bold">Viável</span>
        </button>
        <button
          type="button"
          onClick={() => onSelect(false)}
          className="flex flex-col items-center gap-2 rounded-2xl border-2 border-destructive/40 bg-destructive/10 px-4 py-6 text-destructive transition-all hover:border-destructive hover:bg-destructive/20 active:scale-95"
        >
          <XCircle className="size-10" />
          <span className="text-base font-bold">Inviável</span>
        </button>
      </div>
    </div>
  );
}

// ─── Step: Motivo ──────────────────────────────────────────────────────────────
function ReasonStep({
  reasons,
  search,
  onSearch,
  selectedReason,
  onSelect,
}: {
  reasons: Reason[];
  search: string;
  onSearch: (v: string) => void;
  selectedReason: Reason | null;
  onSelect: (r: Reason) => void;
}) {
  return (
    <div className="space-y-3 p-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Buscar motivo…"
          className="pl-9"
          autoFocus
        />
      </div>
      {reasons.length === 0 && (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Nenhum motivo encontrado.
        </p>
      )}
      <div className="space-y-1">
        {reasons.map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() => onSelect(r)}
            className={
              "flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left text-sm font-medium transition-colors " +
              (selectedReason?.id === r.id
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-card hover:border-primary hover:bg-primary/5")
            }
          >
            <span>{r.name}</span>
            {selectedReason?.id === r.id && <Check className="size-4 text-primary" />}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Step: Pergunta se houve negociação (destaque máximo) ─────────────────────
function NegotiationCheckStep({ onSelect }: { onSelect: (negotiated: boolean) => void }) {
  return (
    <div className="flex min-h-full flex-col justify-center p-6">
      {/* Cartão de destaque com fundo gradiente */}
      <div className="rounded-3xl bg-gradient-to-br from-primary/20 via-primary/10 to-transparent p-1">
        <div className="rounded-2xl border-2 border-primary/30 bg-card p-8">
          {/* Ícone grande */}
          <div className="mb-6 flex justify-center">
            <div className="flex size-20 items-center justify-center rounded-full bg-primary/15">
              <Banknote className="size-10 text-primary" />
            </div>
          </div>

          {/* Título grande e chamativo */}
          <h2 className="mb-2 text-center text-2xl font-black tracking-tight text-foreground">
            Houve negociação?
          </h2>
          <p className="mb-8 text-center text-sm text-muted-foreground">
            O cliente aceitou alguma forma de pagamento diferenciada?
          </p>

          {/* Botões grandes e destacados */}
          <div className="grid grid-cols-2 gap-4">
            <button
              type="button"
              onClick={() => onSelect(true)}
              className="flex flex-col items-center gap-2 rounded-2xl border-2 border-success/50 bg-success/15 px-6 py-7 font-bold text-success transition-all hover:border-success hover:bg-success/25 active:scale-95"
            >
              <CheckCircle2 className="size-9" />
              <span className="text-lg">Sim, houve</span>
              <span className="text-xs font-normal opacity-80">negociação</span>
            </button>
            <button
              type="button"
              onClick={() => onSelect(false)}
              className="flex flex-col items-center gap-2 rounded-2xl border-2 border-muted bg-muted/30 px-6 py-7 font-bold text-muted-foreground transition-all hover:border-destructive/50 hover:bg-destructive/10 hover:text-destructive active:scale-95"
            >
              <XCircle className="size-9" />
              <span className="text-lg">Não</span>
              <span className="text-xs font-normal opacity-80">não foi negociado</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Step: Detalhes da negociação ─────────────────────────────────────────────
function NegotiationDetailsStep({
  negotiatedValue,
  onNegotiatedValueChange,
  selectedPaymentMethods,
  onPaymentToggle,
  payments,
  parcelas,
  onParcelasChange,
  onContinue,
}: {
  negotiatedValue: string;
  onNegotiatedValueChange: (v: string) => void;
  selectedPaymentMethods: string[];
  onPaymentToggle: (id: string) => void;
  payments: PaymentMethod[];
  parcelas: string;
  onParcelasChange: (v: string) => void;
  onContinue: () => void;
}) {
  return (
    <div className="space-y-5 p-4">
      <div className="rounded-2xl border border-border bg-card p-4">
        <label className="mb-2 block text-sm font-semibold text-foreground">
          Valor negociado (R$)
        </label>
        <Input
          value={negotiatedValue}
          onChange={(e) => onNegotiatedValueChange(e.target.value)}
          placeholder="0,00"
          inputMode="decimal"
          className="h-12 text-lg font-semibold"
          autoFocus
        />
      </div>

      <div className="rounded-2xl border border-border bg-card p-4">
        <p className="mb-3 text-sm font-semibold text-foreground">Forma de pagamento</p>
        <div className="flex flex-wrap gap-2">
          {payments.map((p) => {
            const selected = selectedPaymentMethods.includes(p.id);
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => onPaymentToggle(p.id)}
                className={
                  "rounded-full border px-4 py-2 text-sm font-medium transition-colors " +
                  (selected
                    ? "border-primary bg-primary/15 text-primary"
                    : "border-border bg-card text-muted-foreground hover:border-primary/50")
                }
              >
                {p.name}
              </button>
            );
          })}
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-4">
        <label className="mb-2 block text-sm font-semibold text-foreground">
          Quantidade de parcelas
        </label>
        <Input
          value={parcelas}
          onChange={(e) => onParcelasChange(e.target.value)}
          placeholder="Ex: 2x"
          inputMode="numeric"
          className="h-12"
        />
      </div>

      <Button onClick={onContinue} className="h-12 w-full text-base font-semibold">
        Continuar <ChevronRight className="ml-2 size-4" />
      </Button>
    </div>
  );
}

// ─── Step: Complementos ───────────────────────────────────────────────────────
function ComplementStep({
  complements,
  search,
  onSearch,
  selected,
  onToggle,
}: {
  complements: Complement[];
  search: string;
  onSearch: (v: string) => void;
  selected: string[];
  onToggle: (name: string) => void;
}) {
  return (
    <div className="space-y-3 p-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Buscar complemento…"
          className="pl-9"
          autoFocus
        />
      </div>
      {complements.length === 0 && (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Nenhum complemento encontrado.
        </p>
      )}
      <div className="space-y-1">
        {complements.map((c) => {
          const on = selected.includes(c.name);
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => onToggle(c.name)}
              className={
                "flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm font-medium transition-colors " +
                (on
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-card hover:border-primary/50")
              }
            >
              <div
                className={
                  "flex size-5 shrink-0 items-center justify-center rounded border text-xs " +
                  (on ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground")
                }
              >
                {on && <Check className="size-3" />}
              </div>
              <span>{c.name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
