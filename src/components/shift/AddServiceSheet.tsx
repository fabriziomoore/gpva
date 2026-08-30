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
import { Loader2, ChevronLeft, ChevronRight, Check, X, Handshake, ArrowRight, Search } from "lucide-react";
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

type Step = "viability" | "negotiation" | "details";

export function AddServiceSheet({
  open,
  onOpenChange,
  teamId,
  shiftId,
  editService,
  editComplements,
}: AddServiceSheetProps) {
  const isEdit = !!editService;
  const [step, setStep] = useState<Step>("viability");
  const [viable, setViable] = useState<boolean | null>(null);
  const [isNegotiation, setIsNegotiation] = useState<boolean | null>(null);
  const [serviceTypeId, setServiceTypeId] = useState<string | null>(null);
  const [serviceTypeName, setServiceTypeName] = useState<string>("");
  const [negotiatedValue, setNegotiatedValue] = useState<string>("");
  const [reasonId, setReasonId] = useState<string | null>(null);
  const [reasonName, setReasonName] = useState<string>("");
  const [complementIds, setComplementIds] = useState<string[]>([]);
  const [catalogQuery, setCatalogQuery] = useState("");
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
      setViable(editService.viable);
      setIsNegotiation(editService.is_negotiation);
      setServiceTypeId(editService.service_type_id);
      setServiceTypeName(editService.service_type_name);
      setNegotiatedValue(
        editService.negotiated_value != null ? String(editService.negotiated_value) : "",
      );
      setReasonId(editService.reason_id ?? null);
      setReasonName(editService.reason_name ?? "");
      const ids = (editComplements ?? [])
        .map((c) => c.id)
        .filter((id): id is string => !!id);
      setComplementIds(ids);
      setStep("details");
    } else {
      setViable(null);
      setIsNegotiation(null);
      setServiceTypeId(null);
      setServiceTypeName("");
      setNegotiatedValue("");
      setReasonId(null);
      setReasonName("");
      setComplementIds([]);
      setCatalogQuery("");
      setStep("viability");
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
  }

  function toggleComplement(id: string) {
    setComplementIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  async function save() {
    if (viable == null) {
      toast.error("Selecione se o serviço é viável ou invável.");
      return;
    }
    if (!viable && !isNegotiation && !reasonId) {
      toast.error("Selecione um motivo para o serviço invável.");
      return;
    }
    if (viable && !isNegotiation && !serviceTypeId) {
      toast.error("Selecione o tipo de serviço.");
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
        service_type_id: viable && !isNegotiation ? serviceTypeId : null,
        service_type_name:
          viable && !isNegotiation
            ? serviceTypeName
            : isNegotiation
              ? "Negociação"
              : reasonName || "Inviável",
        reason_id: !viable && !isNegotiation ? reasonId : null,
        reason_name: !viable && !isNegotiation ? reasonName : null,
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
        if (viable && !isNegotiation && complementIds.length > 0) {
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

  const headerTitle =
    step === "negotiation"
      ? "O PÓS-CORTE FOI NEGOCIADO?"
      : step === "viability"
        ? "O SERVIÇO FOI VIÁVEL?"
        : "Detalhes do serviço";

  const headerTone =
    step === "negotiation" ? "bg-primary text-primary-foreground" : "bg-card text-foreground";

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
              (step === "negotiation" ? "tracking-wide" : "")
            }
          >
            {headerTitle}
          </SheetTitle>
          <SheetDescription className="sr-only">
            Fluxo de registro de serviço do expediente
          </SheetDescription>
          <Stepper step={step} />
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          {step === "viability" && (
            <ViabilityStep
              value={viable}
              onPick={(v) => {
                setViable(v);
                setStep("negotiation");
              }}
            />
          )}

          {step === "negotiation" && (
            <NegotiationStep
              value={isNegotiation}
              onPick={(v) => {
                setIsNegotiation(v);
                if (v) {
                  setStep("details");
                } else {
                  void save();
                }
              }}
            />
          )}

          {step === "details" && (
            <DetailsStep
              viable={viable}
              isNegotiation={isNegotiation}
              serviceTypes={filteredServiceTypes}
              complements={complements}
              reasons={reasons}
              catalogQuery={catalogQuery}
              onCatalogQueryChange={setCatalogQuery}
              serviceTypeId={serviceTypeId}
              onPickServiceType={pickServiceType}
              reasonId={reasonId}
              onPickReason={(r) => {
                setReasonId(r.id);
                setReasonName(r.name);
              }}
              complementIds={complementIds}
              onToggleComplement={toggleComplement}
              negotiatedValue={negotiatedValue}
              onChangeNegotiatedValue={setNegotiatedValue}
            />
          )}
        </div>

        <footer className="sticky bottom-0 flex items-center justify-between gap-2 border-t border-border bg-background px-4 py-3">
          <Button
            type="button"
            variant="outline"
            className="h-12 flex-1"
            onClick={() => {
              if (step === "details") setStep("negotiation");
              else if (step === "negotiation") setStep("viability");
              else close();
            }}
            disabled={saving}
          >
            <ChevronLeft className="mr-1 size-4" /> Voltar
          </Button>
          {step !== "viability" && (
            <Button
              type="button"
              className="h-12 flex-1"
              onClick={() => void save()}
              disabled={saving}
            >
              {saving ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
              {isEdit ? "Salvar alterações" : "Finalizar"}
              {!saving && <ArrowRight className="ml-1 size-4" />}
            </Button>
          )}
        </footer>
      </SheetContent>
    </Sheet>
  );
}

function Stepper({ step }: { step: Step }) {
  const steps: { id: Step; label: string }[] = [
    { id: "viability", label: "Viável?" },
    { id: "negotiation", label: "Negociado?" },
    { id: "details", label: "Detalhes" },
  ];
  const currentIdx = steps.findIndex((s) => s.id === step);
  return (
    <ol className="flex items-center gap-2 pt-1">
      {steps.map((s, i) => {
        const active = i === currentIdx;
        const done = i < currentIdx;
        return (
          <li key={s.id} className="flex flex-1 items-center gap-2">
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
              {s.label}
            </span>
            {i < steps.length - 1 && (
              <span className="h-px flex-1 bg-white/30" aria-hidden />
            )}
          </li>
        );
      })}
    </ol>
  );
}

function ViabilityStep({
  value,
  onPick,
}: {
  value: boolean | null;
  onPick: (v: boolean) => void;
}) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Primeiro, diga se o serviço pôde ser executado.
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

function NegotiationStep({
  value,
  onPick,
}: {
  value: boolean | null;
  onPick: (v: boolean) => void;
}) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        O pós-corte foi negociado com o cliente?
      </p>
      <div className="grid grid-cols-1 gap-3">
        <button
          type="button"
          onClick={() => onPick(true)}
          className={
            "flex items-center justify-between rounded-2xl border-2 p-5 text-left transition-colors " +
            (value === true
              ? "border-primary bg-primary/10"
              : "border-border bg-card hover:bg-muted")
          }
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
          className={
            "flex items-center justify-between rounded-2xl border-2 p-5 text-left transition-colors " +
            (value === false
              ? "border-muted-foreground bg-muted"
              : "border-border bg-card hover:bg-muted")
          }
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

function DetailsStep({
  viable,
  isNegotiation,
  serviceTypes,
  complements,
  reasons,
  catalogQuery,
  onCatalogQueryChange,
  serviceTypeId,
  onPickServiceType,
  reasonId,
  onPickReason,
  complementIds,
  onToggleComplement,
  negotiatedValue,
  onChangeNegotiatedValue,
}: {
  viable: boolean | null;
  isNegotiation: boolean | null;
  serviceTypes: ServiceType[];
  complements: Complement[];
  reasons: Reason[];
  catalogQuery: string;
  onCatalogQueryChange: (q: string) => void;
  serviceTypeId: string | null;
  onPickServiceType: (s: ServiceType) => void;
  reasonId: string | null;
  onPickReason: (r: Reason) => void;
  complementIds: string[];
  onToggleComplement: (id: string) => void;
  negotiatedValue: string;
  onChangeNegotiatedValue: (v: string) => void;
}) {
  if (isNegotiation === true) {
    return (
      <div className="space-y-4">
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

  if (viable === false) {
    return (
      <div className="space-y-3">
        <p className="text-sm font-semibold text-foreground">Motivo do invável</p>
        <div className="grid grid-cols-1 gap-2">
          {reasons.length === 0 && (
            <p className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
              Nenhum motivo cadastrado.
            </p>
          )}
          {reasons.map((r) => {
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

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="service-search" className="text-base font-semibold">
          Tipo de serviço
        </Label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="service-search"
            placeholder="Buscar serviço..."
            value={catalogQuery}
            onChange={(e) => onCatalogQueryChange(e.target.value)}
            className="h-12 pl-9"
          />
        </div>
        <div className="grid max-h-56 grid-cols-1 gap-1 overflow-y-auto pr-1">
          {filteredServiceTypes.length === 0 && (
            <p className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
              Nenhum serviço encontrado.
            </p>
          )}
          {filteredServiceTypes.map((s) => {
            const selected = s.id === serviceTypeId;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => onPickServiceType(s)}
                className={
                  "flex items-center justify-between rounded-lg border p-2.5 text-left transition-colors " +
                  (selected
                    ? "border-primary bg-primary/10"
                    : "border-border bg-card hover:bg-muted")
                }
              >
                <span className="text-sm font-semibold">{s.name}</span>
                {selected && <Check className="size-4 text-primary" />}
              </button>
            );
          })}
        </div>
      </div>

      {complements.length > 0 && (
        <div className="space-y-2">
          <p className="text-base font-semibold">Complementos</p>
          <div className="grid grid-cols-1 gap-2">
            {complements.map((c) => {
              const checked = complementIds.includes(c.id);
              return (
                <label
                  key={c.id}
                  className={
                    "flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition-colors " +
                    (checked ? "border-primary bg-primary/5" : "border-border bg-card hover:bg-muted")
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
      )}

      {serviceTypeId && (
        <Badge variant="secondary" className="w-fit">
          Selecionado: {serviceTypes.find((s) => s.id === serviceTypeId)?.name}
        </Badge>
      )}
    </div>
  );
}
