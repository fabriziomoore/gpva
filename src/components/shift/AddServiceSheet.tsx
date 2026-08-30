import { useEffect, useMemo, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  ChevronLeft,
  ChevronRight,
  Check,
  X,
  Handshake,
  ArrowRight,
  Search,
  User,
  CreditCard,
  Wrench,
} from "lucide-react";
import { useLiveQuery } from "dexie-react-hooks";
import { getLocalDB, type LocalService } from "@/lib/db/local-db";
import { repoUpsertService } from "@/lib/db/repos";
import { fetchCatalogs, type ServiceType, type Complement, type Reason } from "@/lib/db/catalogs";
import { lowLevelGeolocation, buildAddressLine } from "@/lib/geo";
import { toast } from "sonner";
import { setFormsStatus, setFailedPayload } from "@/lib/forms-status";
import { buildNegotiationPayload } from "@/lib/google-form";

export type AddServiceSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  teamId: string;
  shiftId: string;
  editService?: LocalService | null;
  editComplements?: { id: string | null; name: string }[];
};

type Step =
  | "type"
  | "viability"
  | "reason"
  | "registration"
  | "payment"
  | "complements"
  | "negotiationCheck";

const ALL_STEPS: Step[] = [
  "type",
  "viability",
  "reason",
  "registration",
  "payment",
  "complements",
  "negotiationCheck",
];

const STEP_LABELS: Record<Step, string> = {
  type: "Tipo",
  viability: "Viável?",
  reason: "Motivo",
  registration: "Matrícula",
  payment: "Pagamento",
  complements: "Complementos",
  negotiationCheck: "Negociação",
};

export function AddServiceSheet({
  open,
  onOpenChange,
  teamId,
  shiftId,
  editService,
  editComplements,
}: AddServiceSheetProps) {
  const isEdit = !!editService;
  const [step, setStep] = useState<Step>("type");
  const [serviceTypeId, setServiceTypeId] = useState<string | null>(null);
  const [serviceTypeName, setServiceTypeName] = useState<string>("");
  const [isNegotiable, setIsNegotiable] = useState<boolean | null>(null);
  const [viable, setViable] = useState<boolean | null>(null);
  const [isNegotiation, setIsNegotiation] = useState<boolean | null>(null);
  const [reasonId, setReasonId] = useState<string | null>(null);
  const [reasonName, setReasonName] = useState<string>("");
  const [registration, setRegistration] = useState<string>("");
  const [complementIds, setComplementIds] = useState<string[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<string>("");
  const [negotiatedValue, setNegotiatedValue] = useState<string>("");
  const [catalogQuery, setCatalogQuery] = useState<string>("");
  const [saving, setSaving] = useState(false);

  const catalogs = useLiveQuery(async () => {
    return await getLocalDB().kv.get("catalogs");
  }, []);

  useEffect(() => {
    if (open && !catalogs) {
      void fetchCatalogs();
    }
  }, [open, catalogs]);

  useEffect(() => {
    if (!open) return;
    if (editService) {
      setServiceTypeId(editService.service_type_id);
      setServiceTypeName(editService.service_type_name);
      setViable(editService.viable);
      setIsNegotiation(editService.is_negotiation);
      setReasonId(editService.reason_id ?? null);
      setReasonName(editService.reason_name ?? "");
      setNegotiatedValue(
        editService.negotiated_value != null ? String(editService.negotiated_value) : "",
      );
      const ids = (editComplements ?? [])
        .map((c) => c.id)
        .filter((id): id is string => !!id);
      setComplementIds(ids);
      setStep("negotiationCheck");
    } else {
      setServiceTypeId(null);
      setServiceTypeName("");
      setIsNegotiable(null);
      setViable(null);
      setIsNegotiation(null);
      setReasonId(null);
      setReasonName("");
      setRegistration("");
      setComplementIds([]);
      setPaymentMethod("");
      setNegotiatedValue("");
      setCatalogQuery("");
      setStep("type");
    }
  }, [open, editService, editComplements]);

  const serviceTypes: ServiceType[] = (catalogs?.value as any)?.service_types ?? [];
  const complements: Complement[] = (catalogs?.value as any)?.complements ?? [];
  const reasons: Reason[] = (catalogs?.value as any)?.reasons ?? [];

  const filteredServiceTypes = useMemo(() => {
    const q = catalogQuery.trim().toLowerCase();
    if (!q) return serviceTypes;
    return serviceTypes.filter((s) => s.name.toLowerCase().includes(q));
  }, [serviceTypes, catalogQuery]);

  function close() {
    if (saving) return;
    onOpenChange(false);
  }

  function pickServiceType(s: ServiceType) {
    setServiceTypeId(s.id);
    setServiceTypeName(s.name);
    setIsNegotiable(s.is_negotiation ?? false);
    setStep("viability");
  }

  function toggleComplement(id: string) {
    setComplementIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  async function save() {
    if (!serviceTypeId) {
      toast.error("Selecione o tipo de serviço.");
      return;
    }
    if (viable == null) {
      toast.error("Selecione se o serviço é viável ou inviável.");
      return;
    }
    if (!viable && !reasonId) {
      toast.error("Selecione um motivo para o serviço inviável.");
      return;
    }
    if (isNegotiation === true) {
      const num = Number(negotiatedValue);
      if (!Number.isFinite(num) || num <= 0) {
        toast.error("Informe um valor de negociação válido.");
        return;
      }
    }

    setSaving(true);
    try {
      const id = editService?.id ?? crypto.randomUUID();
      const now = new Date().toISOString();

      let lat: number | null = null;
      let lng: number | null = null;
      let address: string | null = null;
      try {
        const pos = await lowLevelGeolocation({ timeout: 8000 });
        lat = pos.coords.latitude;
        lng = pos.coords.longitude;
        address = await buildAddressLine(lat, lng);
      } catch {
        /* GPS indisponível */
      }

      const payload: LocalService = {
        id,
        shift_id: shiftId,
        team_id: teamId,
        viable: viable!,
        is_negotiation: isNegotiation === true,
        service_type_id: serviceTypeId,
        service_type_name: serviceTypeName,
        reason_id: !viable ? reasonId : null,
        reason_name: !viable ? reasonName : null,
        negotiated_value: isNegotiation === true ? Number(negotiatedValue) : null,
        lat,
        lng,
        address,
        created_at: editService?.created_at ?? now,
        updated_at: now,
        sync_state: "pending",
      };

      await repoUpsertService(payload);

      const db = getLocalDB();
      const existing = await db.complement_links.where("service_id").equals(id).toArray();
      await db.transaction("rw", db.complement_links, async () => {
        for (const ex of existing) {
          await db.complement_links.delete(ex.id);
        }
        if (complementIds.length > 0) {
          for (const cid of complementIds) {
            const comp = complements.find((c) => c.id === cid);
            if (!comp) continue;
            await db.complement_links.put({
              id: crypto.randomUUID(),
              service_id: id,
              shift_id: shiftId,
              complement_id: comp.id,
              complement_name: comp.name,
              created_at: now,
              sync_state: "pending",
            });
          }
        }
      });

      if (isNegotiation === true) {
        setFailedPayload(id, buildNegotiationPayload(payload));
        setFormsStatus(id, "failed");
      }

      toast.success(isEdit ? "Serviço atualizado" : "Serviço registrado");
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar serviço");
    } finally {
      setSaving(false);
    }
  }

  function goBack() {
    const idx = ALL_STEPS.indexOf(step);
    if (idx <= 0) {
      close();
    } else {
      setStep(ALL_STEPS[idx - 1]);
    }
  }

  function goNext() {
    const idx = ALL_STEPS.indexOf(step);
    if (idx < ALL_STEPS.length - 1) {
      setStep(ALL_STEPS[idx + 1]);
    } else {
      void save();
    }
  }

  const headerTone =
    step === "negotiationCheck" ? "bg-primary text-primary-foreground" : "bg-card text-foreground";

  const stepTitle =
    step === "type" ? "QUAL TIPO DE SERVIÇO?" :
    step === "viability" ? "O SERVIÇO FOI VIÁVEL?" :
    step === "reason" ? "MOTIVO DO INVÁVEL" :
    step === "registration" ? "MATRÍCULA DO CLIENTE" :
    step === "payment" ? "FORMA DE PAGAMENTO" :
    step === "complements" ? "COMPLEMENTOS" :
    "O PÓS-CORTE FOI NEGOCIADO?";

  return (
    <Sheet open={open} onOpenChange={close}>
      <SheetContent
        side="bottom"
        className="flex h-[92dvh] max-h-[92dvh] flex-col gap-0 p-0"
      >
        <SheetHeader
          className={
            "sticky top-0 z-10 flex flex-col gap-1 border-b border-border px-4 py-4 " +
            headerTone
          }
        >
          <SheetTitle
            className={
              "text-left text-xl font-extrabold leading-tight " +
              (step === "negotiationCheck" ? "tracking-wide" : "")
            }
          >
            {stepTitle}
          </SheetTitle>
          <SheetDescription className="sr-only">
            Fluxo de registro de serviço do expediente
          </SheetDescription>
          <Stepper step={step} />
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          {step === "type" && (
            <TypeStep
              serviceTypes={filteredServiceTypes}
              catalogQuery={catalogQuery}
              onCatalogQueryChange={setCatalogQuery}
              serviceTypeId={serviceTypeId}
              onPickServiceType={pickServiceType}
            />
          )}

          {step === "viability" && (
            <ViabilityStep
              value={viable}
              serviceTypeName={serviceTypeName}
              onPick={(v) => {
                setViable(v);
                if (!v) {
                  setStep("reason");
                } else {
                  setStep("registration");
                }
              }}
            />
          )}

          {step === "reason" && (
            <ReasonStep
              reasons={reasons}
              reasonId={reasonId}
              onPickReason={(r) => {
                setReasonId(r.id);
                setReasonName(r.name);
                setStep("negotiationCheck");
              }}
            />
          )}

          {step === "registration" && (
            <RegistrationStep
              value={registration}
              onChange={setRegistration}
              onNext={() => setStep("payment")}
            />
          )}

          {step === "payment" && (
            <PaymentStep
              value={paymentMethod}
              onChange={(v) => {
                setPaymentMethod(v);
                setStep("complements");
              }}
            />
          )}

          {step === "complements" && (
            <ComplementsStep
              complements={complements}
              complementIds={complementIds}
              onToggleComplement={toggleComplement}
              onNext={() => setStep("negotiationCheck")}
            />
          )}

          {step === "negotiationCheck" && (
            <NegotiationStep
              isNegotiable={isNegotiable}
              value={isNegotiation}
              negotiatedValue={negotiatedValue}
              onChangeNegotiatedValue={setNegotiatedValue}
              onPick={(v) => {
                setIsNegotiation(v);
                if (!v) {
                  void save();
                }
              }}
            />
          )}
        </div>

        <footer className="sticky bottom-0 flex items-center justify-between gap-2 border-t border-border bg-background px-4 py-3">
          <Button
            type="button"
            variant="outline"
            className="h-12 flex-1"
            onClick={goBack}
            disabled={saving}
          >
            <ChevronLeft className="mr-1 size-4" /> Voltar
          </Button>
          {step !== "negotiationCheck" || isNegotiation !== true ? (
            <Button
              type="button"
              className="h-12 flex-1"
              onClick={goNext}
              disabled={saving}
            >
              {saving ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
              {isEdit ? "Salvar alterações" : "Continuar"}
              {!saving && <ArrowRight className="ml-1 size-4" />}
            </Button>
          ) : (
            <Button
              type="button"
              className="h-12 flex-1"
              onClick={() => void save()}
              disabled={saving}
            >
              {saving ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
              Finalizar
              {!saving && <Check className="ml-1 size-4" />}
            </Button>
          )}
        </footer>
      </SheetContent>
    </Sheet>
  );
}

function Stepper({ step }: { step: Step }) {
  const currentIdx = ALL_STEPS.indexOf(step);
  return (
    <ol className="flex items-center gap-2 pt-1">
      {ALL_STEPS.map((s, i) => {
        const active = i === currentIdx;
        const done = i < currentIdx;
        return (
          <li key={s} className="flex flex-1 items-center gap-2">
            <span
              className={
                "flex size-6 items-center justify-center rounded-full text-[11px] font-bold " +
                (active
                  ? "bg-white text-primary"
                  : done
                    ? "bg-white/80 text-primary"
                    : "bg-white/20 text-white/70")
              }
            >
              {done ? <Check className="size-3" /> : i + 1}
            </span>
            <span
              className={
                "text-[11px] font-semibold uppercase tracking-wide " +
                (active ? "text-white" : "text-white/70")
              }
            >
              {STEP_LABELS[s]}
            </span>
            {i < ALL_STEPS.length - 1 && (
              <span className="h-px flex-1 bg-white/30" aria-hidden />
            )}
          </li>
        );
      })}
    </ol>
  );
}

function TypeStep({
  serviceTypes,
  catalogQuery,
  onCatalogQueryChange,
  serviceTypeId,
  onPickServiceType,
}: {
  serviceTypes: ServiceType[];
  catalogQuery: string;
  onCatalogQueryChange: (q: string) => void;
  serviceTypeId: string | null;
  onPickServiceType: (s: ServiceType) => void;
}) {
  const sorted = useMemo(() => {
    return [...serviceTypes].sort((a, b) => {
      const oa = a.sort_order ?? 999;
      const ob = b.sort_order ?? 999;
      return oa !== ob ? oa - ob : a.name.localeCompare(b.name);
    });
  }, [serviceTypes]);

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="service-search"
            placeholder="Buscar tipo de serviço..."
            value={catalogQuery}
            onChange={(e) => onCatalogQueryChange(e.target.value)}
            className="h-12 pl-9"
          />
        </div>
        <div className="grid max-h-72 grid-cols-1 gap-1 overflow-y-auto pr-1">
          {sorted.length === 0 && (
            <p className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
              Nenhum serviço encontrado.
            </p>
          )}
          {sorted.map((s) => {
            const selected = s.id === serviceTypeId;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => onPickServiceType(s)}
                className={
                  "flex items-center justify-between rounded-lg border p-3 text-left transition-colors " +
                  (selected
                    ? "border-primary bg-primary/10"
                    : "border-border bg-card hover:bg-muted")
                }
              >
                <span className="flex items-center gap-2">
                  <Wrench className="size-4 text-muted-foreground" />
                  <span className="text-sm font-semibold">{s.name}</span>
                  {s.is_negotiation && (
                    <Badge variant="secondary" className="text-[10px]">
                      Negociável
                    </Badge>
                  )}
                </span>
                {selected && <Check className="size-4 text-primary" />}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ViabilityStep({
  value,
  serviceTypeName,
  onPick,
}: {
  value: boolean | null;
  serviceTypeName: string;
  onPick: (v: boolean) => void;
}) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        O serviço{" "}
        <span className="font-semibold text-foreground">{serviceTypeName}</span>{
          " "
        }
        foi executado com sucesso?
      </p>
      <div className="grid grid-cols-1 gap-3">
        <button
          type="button"
          onClick={() => onPick(true)}
          className={
            "flex items-center justify-between rounded-2xl border-2 p-5 text-left transition-colors " +
            (value === true
              ? "border-success bg-success/10"
              : "border-border bg-card hover:bg-muted")
          }
        >
          <span className="flex items-center gap-3">
            <Check className="size-6 text-success" />
            <span className="text-lg font-bold">Viável</span>
          </span>
          <ChevronRight className="size-5 text-muted-foreground" />
        </button>
        <button
          type="button"
          onClick={() => onPick(false)}
          className={
            "flex items-center justify-between rounded-2xl border-2 p-5 text-left transition-colors " +
            (value === false
              ? "border-destructive bg-destructive/10"
              : "border-border bg-card hover:bg-muted")
          }
        >
          <span className="flex items-center gap-3">
            <X className="size-6 text-destructive" />
            <span className="text-lg font-bold">Inviável</span>
          </span>
          <ChevronRight className="size-5 text-muted-foreground" />
        </button>
      </div>
    </div>
  );
}

function ReasonStep({
  reasons,
  reasonId,
  onPickReason,
}: {
  reasons: Reason[];
  reasonId: string | null;
  onPickReason: (r: Reason) => void;
}) {
  const sorted = useMemo(() => {
    return [...reasons].sort((a, b) => a.name.localeCompare(b.name));
  }, [reasons]);

  return (
    <div className="space-y-3">
      <p className="text-sm font-semibold text-foreground">
        Qual o motivo da inviabilidade?
      </p>
      <div className="grid grid-cols-1 gap-2">
        {sorted.length === 0 && (
          <p className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
            Nenhum motivo cadastrado.
          </p>
        )}
        {sorted.map((r) => {
          const selected = r.id === reasonId;
          return (
            <button
              key={r.id}
              type="button"
              onClick={() => onPickReason(r)}
              className={
                "flex items-center justify-between rounded-xl border p-3 text-left transition-colors " +
                (selected
                  ? "border-destructive bg-destructive/10"
                  : "border-border bg-card hover:bg-muted")
              }
            >
              <span className="text-sm font-semibold">{r.name}</span>
              {selected && <Check className="size-4 text-destructive" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function RegistrationStep({
  value,
  onChange,
  onNext,
}: {
  value: string;
  onChange: (v: string) => void;
  onNext: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label
          htmlFor="registration"
          className="text-base font-semibold flex items-center gap-2"
        >
          <User className="size-4" />
          Matrícula do cliente
        </Label>
        <Input
          id="registration"
          placeholder="Ex: 1234567"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-12 text-lg"
        />
        <p className="text-xs text-muted-foreground">
          Número de matrícula ou identificação do cliente.
        </p>
      </div>
      <Button type="button" className="w-full h-12" onClick={onNext}>
        Continuar <ArrowRight className="ml-2 size-4" />
      </Button>
    </div>
  );
}

function PaymentStep({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const methods = [
    "Dinheiro",
    "PIX",
    "Cartão de Crédito",
    "Cartão de Débito",
    "Boleto",
    "Faturado",
    "Isento",
  ];

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label className="text-base font-semibold flex items-center gap-2">
          <CreditCard className="size-4" />
          Forma de pagamento
        </Label>
        <div className="grid grid-cols-1 gap-2">
          {methods.map((method) => {
            const selected = value === method;
            return (
              <button
                key={method}
                type="button"
                onClick={() => onChange(method)}
                className={
                  "flex items-center justify-between rounded-xl border p-3 text-left transition-colors " +
                  (selected
                    ? "border-primary bg-primary/10"
                    : "border-border bg-card hover:bg-muted")
                }
              >
                <span className="text-sm font-semibold">{method}</span>
                {selected && <Check className="size-4 text-primary" />}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ComplementsStep({
  complements,
  complementIds,
  onToggleComplement,
  onNext,
}: {
  complements: Complement[];
  complementIds: string[];
  onToggleComplement: (id: string) => void;
  onNext: () => void;
}) {
  const sorted = useMemo(() => {
    return [...complements].sort((a, b) => {
      const oa = a.sort_order ?? 999;
      const ob = b.sort_order ?? 999;
      return oa !== ob ? oa - ob : a.name.localeCompare(b.name);
    });
  }, [complements]);

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <p className="text-base font-semibold">Complementos do serviço</p>
        <div className="grid grid-cols-1 gap-2">
          {sorted.length === 0 && (
            <p className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
              Nenhum complemento disponível.
            </p>
          )}
          {sorted.map((c) => {
            const checked = complementIds.includes(c.id);
            return (
              <label
                key={c.id}
                className={
                  "flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition-colors " +
                  (checked
                    ? "border-primary bg-primary/5"
                    : "border-border bg-card hover:bg-muted")
                }
              >
                <Checkbox
                  checked={checked}
                  onCheckedChange={() => onToggleComplement(c.id)}
                />
                <span className="text-sm font-semibold">{c.name}</span>
              </label>
            );
          })}
        </div>
      </div>
      <Button type="button" className="w-full h-12" onClick={onNext}>
        Continuar <ArrowRight className="ml-2 size-4" />
      </Button>
    </div>
  );
}

function NegotiationStep({
  isNegotiable,
  value,
  negotiatedValue,
  onChangeNegotiatedValue,
  onPick,
}: {
  isNegotiable: boolean | null;
  value: boolean | null;
  negotiatedValue: string;
  onChangeNegotiatedValue: (v: string) => void;
  onPick: (v: boolean) => void;
}) {
  if (isNegotiable === false) {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-border bg-muted/50 p-4 text-center">
          <p className="text-sm text-muted-foreground">
            Este tipo de serviço não exige negociação.
          </p>
        </div>
        <Button type="button" className="w-full h-12" onClick={() => onPick(false)}>
          Confirmar <Check className="ml-2 size-4" />
        </Button>
      </div>
    );
  }

  if (value === null) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          O pós-corte foi negociado com o cliente?
        </p>
        <div className="grid grid-cols-1 gap-3">
          <button
            type="button"
            onClick={() => onPick(true)}
            className="flex items-center justify-between rounded-2xl border-2 border-border bg-card p-5 text-left transition-colors hover:bg-muted"
          >
            <span className="flex items-center gap-3">
              <Handshake className="size-6 text-primary" />
              <span className="text-lg font-bold">Foi negociado</span>
            </span>
            <ChevronRight className="size-5 text-muted-foreground" />
          </button>
          <button
            type="button"
            onClick={() => onPick(false)}
            className="flex items-center justify-between rounded-2xl border-2 border-border bg-card p-5 text-left transition-colors hover:bg-muted"
          >
            <span className="flex items-center gap-3">
              <X className="size-6 text-muted-foreground" />
              <span className="text-lg font-bold">Não foi negociado</span>
            </span>
            <ChevronRight className="size-5 text-muted-foreground" />
          </button>
        </div>
      </div>
    );
  }

  if (value === true) {
    return (
      <div className="space-y-3">
        <div className="space-y-2">
          <Label htmlFor="negotiated-value" className="text-base font-semibold">
            Valor negociado
          </Label>
          <Input
            id="negotiated-value"
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            placeholder="R$ 0,00"
            value={negotiatedValue}
            onChange={(e) => onChangeNegotiatedValue(e.target.value)}
            className="h-12 text-lg"
          />
          <p className="text-xs text-muted-foreground">
            Confira o valor combinado antes de salvar.
          </p>
        </div>
      </div>
    );
  }

  return null;
}
