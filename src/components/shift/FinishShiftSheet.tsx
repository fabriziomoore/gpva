import { useEffect, useState } from "react";
import { getLocalDB } from "@/lib/db/local-db";
import { repoCloseShift, repoSaveCatalogOrder } from "@/lib/db/repos";
import { useImpactsCached, getCachedTeam, useOrdered, fetchAndCacheCatalogOrder } from "@/lib/db/catalogs";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Loader2, Plus, X, ArrowUpDown, Check } from "lucide-react";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { buildReport } from "@/lib/report";
import { ReorderableGrid } from "./ReorderableGrid";


export function FinishShiftSheet({
  open,
  onOpenChange,
  teamId,
  shiftId,
  onClosed,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  teamId: string;
  shiftId: string;
  onClosed: (shiftId: string) => void;
}) {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [customs, setCustoms] = useState<string[]>([]);
  const [customInput, setCustomInput] = useState("");
  const [showCustom, setShowCustom] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reorderMode, setReorderMode] = useState(false);

  useEffect(() => {
    if (open) {
      setSelected(new Set());
      setCustoms([]);
      setCustomInput("");
      setShowCustom(false);
      setReorderMode(false);
      void fetchAndCacheCatalogOrder(teamId);
    }
  }, [open, teamId]);

  const impacts = useImpactsCached();
  const orderedImpacts = useOrdered(impacts.data, "impactos");

  function toggle(id: string) {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  async function finish() {
    setSaving(true);
    try {
      const chosen = impacts.data?.filter((i) => selected.has(i.id)) ?? [];
      const db = getLocalDB();
      const localShift = await db.shifts.get(shiftId);
      const localServices = await db.services.where("shift_id").equals(shiftId).toArray();
      localServices.sort((a, b) => (a.created_at > b.created_at ? 1 : -1));
      const localLinks = await db.complement_links.where("shift_id").equals(shiftId).toArray();

      // Team info is needed for the report header. Try network first, fall back
      // to the local cache so closing a shift works fully offline.
      let team: { team_name: string; supervisor: string; leader: string } | null = null;
      try {
        const { data } = await supabase
          .from("equipes")
          .select("team_name,supervisor,leader")
          .eq("id", teamId)
          .maybeSingle();
        team = (data as typeof team) ?? null;
      } catch {
        team = null;
      }
      if (!team) {
        const cached = await getCachedTeam(teamId);
        if (cached)
          team = {
            team_name: cached.team_name,
            supervisor: cached.supervisor,
            leader: cached.leader,
          };
      }

      const report = buildReport({
        started_at: localShift?.started_at ?? new Date().toISOString(),
        team_name: team?.team_name ?? "",
        supervisor: team?.supervisor ?? "",
        leader: team?.leader ?? "",
        services: localServices as never,
        impacts: [
          ...chosen.map((c) => ({ impact_name: c.name })),
          ...customs.map((name) => ({ impact_name: name })),
        ],
        complements: localLinks.map((l) => ({ complement_name: l.complement_name })),
      });

      await repoCloseShift({
        shift_id: shiftId,
        report_text: report,
        impacts: [
          ...chosen.map((c) => ({ id: c.id, name: c.name, team_id: teamId, shift_id: shiftId })),
          ...customs.map((name) => ({ id: null, name, team_id: teamId, shift_id: shiftId })),
        ],
      });

      await qc.invalidateQueries({ queryKey: ["last-closed-shift"] });
      onOpenChange(false);
      onClosed(shiftId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao finalizar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[85vh] overflow-y-auto rounded-t-3xl p-0">
        <SheetHeader className="border-b border-border p-4">
          <div className="flex items-center justify-between gap-2">
            <SheetTitle className="text-left">Impactos do dia</SheetTitle>
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
          </div>
        </SheetHeader>
        <div className="space-y-4 p-4">
          {!reorderMode && (
            <p className="text-sm text-muted-foreground">Selecione todos os que se aplicam.</p>
          )}
          {reorderMode ? (
            <ReorderableGrid
              items={orderedImpacts.map((i) => ({ id: i.id, name: i.name }))}
              onReorder={(ids) =>
                repoSaveCatalogOrder({ team_id: teamId, catalog: "impactos", item_ids: ids })
              }
            />
          ) : (
          <div className="grid grid-cols-2 gap-2">
            {orderedImpacts.map((i) => {
              const on = selected.has(i.id);
              return (
                <button
                  key={i.id}
                  onClick={() => toggle(i.id)}
                  className={
                    "rounded-xl border-2 px-3 py-4 text-sm font-medium transition-colors " +
                    (on
                      ? "border-primary bg-primary/15 text-primary"
                      : "border-border bg-card text-foreground hover:border-primary/50")
                  }
                >
                  {i.name}
                </button>
              );
            })}
          </div>
          )}

          {!reorderMode && customs.length > 0 && (
            <div className="space-y-1">
              {customs.map((c, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-sm"
                >
                  <span>{c}</span>
                  <button
                    onClick={() => setCustoms((prev) => prev.filter((_, i) => i !== idx))}
                    className="text-muted-foreground hover:text-destructive"
                    aria-label="Remover"
                  >
                    <X className="size-4" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {!reorderMode && (showCustom ? (
            <div className="flex gap-2">
              <Input
                value={customInput}
                onChange={(e) => setCustomInput(e.target.value)}
                placeholder="Descreva o impacto"
                className="h-11"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter" && customInput.trim()) {
                    setCustoms((p) => [...p, customInput.trim()]);
                    setCustomInput("");
                  }
                }}
              />
              <Button
                type="button"
                onClick={() => {
                  if (!customInput.trim()) return;
                  setCustoms((p) => [...p, customInput.trim()]);
                  setCustomInput("");
                }}
                className="h-11"
              >
                <Plus className="size-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="h-11"
                onClick={() => {
                  setShowCustom(false);
                  setCustomInput("");
                }}
              >
                Fechar
              </Button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowCustom(true)}
              className="w-full rounded-xl border-2 border-dashed border-border px-3 py-3 text-sm font-medium text-muted-foreground hover:border-primary hover:text-primary"
            >
              + Outros
            </button>
          ))}

          {!reorderMode && (
          <Button onClick={finish} disabled={saving} className="h-14 w-full text-base font-semibold">
            {saving ? <Loader2 className="size-5 animate-spin" /> : "Finalizar e gerar relatório"}
          </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}