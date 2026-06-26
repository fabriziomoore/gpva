import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { buildReport } from "@/lib/report";

type Impact = { id: string; name: string };

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
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setSelected(new Set());
  }, [open]);

  const impacts = useQuery({
    queryKey: ["impacts", teamId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("impacts")
        .select("id,name")
        .eq("active", true)
        .order("name");
      if (error) throw error;
      return data as Impact[];
    },
  });

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
      if (chosen.length > 0) {
        const { error: e1 } = await supabase.from("shift_impacts").insert(
          chosen.map((i) => ({
            shift_id: shiftId,
            impact_id: i.id,
            impact_name: i.name,
            team_id: teamId,
          })),
        );
        if (e1) throw e1;
      }

      // Fetch all data to build the report
      const [{ data: shift }, { data: team }, { data: services }] = await Promise.all([
        supabase.from("shifts").select("started_at").eq("id", shiftId).single(),
        supabase
          .from("teams")
          .select("team_name,supervisor,leader")
          .eq("id", teamId)
          .single(),
        supabase
          .from("services")
          .select(
            "service_type_name,is_negotiation,viable,reason_name,registration_number,negotiated_value,created_at",
          )
          .eq("shift_id", shiftId)
          .order("created_at"),
      ]);

      const report = buildReport({
        started_at: shift!.started_at,
        team_name: team!.team_name,
        supervisor: team!.supervisor ?? "",
        leader: team!.leader ?? "",
        services: (services ?? []) as never,
        impacts: chosen.map((c) => ({ impact_name: c.name })),
      });

      const { error: e2 } = await supabase
        .from("shifts")
        .update({ status: "closed", ended_at: new Date().toISOString(), report_text: report })
        .eq("id", shiftId);
      if (e2) throw e2;

      await qc.invalidateQueries({ queryKey: ["open-shift"] });
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
          <SheetTitle className="text-left">Impactos do dia</SheetTitle>
        </SheetHeader>
        <div className="space-y-4 p-4">
          <p className="text-sm text-muted-foreground">Selecione todos os que se aplicam.</p>
          <div className="grid grid-cols-2 gap-2">
            {impacts.data?.map((i) => {
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
          <Button onClick={finish} disabled={saving} className="h-14 w-full text-base font-semibold">
            {saving ? <Loader2 className="size-5 animate-spin" /> : "Finalizar e gerar relatório"}
          </Button>
          <button
            onClick={finish}
            disabled={saving}
            className="block w-full py-2 text-center text-xs text-muted-foreground underline"
          >
            Pular impactos
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}