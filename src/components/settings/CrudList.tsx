import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";

type Row = { id: string; name: string };

export function CrudList({
  table,
  teamId,
  label,
}: {
  table: "service_types" | "inviability_reasons" | "impacts";
  teamId: string;
  label: string;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [adding, setAdding] = useState(false);

  const q = useQuery({
    queryKey: [table, teamId, "all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from(table)
        .select("id,name")
        .eq("active", true)
        .order("name");
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  async function add() {
    if (!name.trim()) return;
    setAdding(true);
    try {
      const payload: Record<string, unknown> = { team_id: teamId, name: name.trim() };
      const { error } = await supabase.from(table).insert(payload);
      if (error) throw error;
      setName("");
      await qc.invalidateQueries({ queryKey: [table, teamId, "all"] });
      await qc.invalidateQueries({ queryKey: [table, teamId] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro");
    } finally {
      setAdding(false);
    }
  }

  async function remove(id: string) {
    try {
      const { error } = await supabase.from(table).update({ active: false }).eq("id", id);
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: [table, teamId, "all"] });
      await qc.invalidateQueries({ queryKey: [table, teamId] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro");
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="flex gap-2">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={`Novo ${label.toLowerCase()}`}
          className="h-11"
        />
        <Button onClick={add} disabled={adding} className="h-11">
          {adding ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
        </Button>
      </div>
      <div className="space-y-1">
        {q.data?.map((r) => (
          <div
            key={r.id}
            className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2"
          >
            <span className="text-sm">{r.name}</span>
            <button
              onClick={() => remove(r.id)}
              className="rounded p-1 text-muted-foreground hover:text-destructive"
              aria-label="Remover"
            >
              <Trash2 className="size-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}