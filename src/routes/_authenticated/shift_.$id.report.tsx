import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLiveQuery } from "dexie-react-hooks";
import { supabase } from "@/integrations/supabase/client";
import { getLocalDB } from "@/lib/db/local-db";
import { repoReopenShift } from "@/lib/db/repos";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { confirmAction } from "@/components/ui/confirm-dialog";
import { Copy, Share2, Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/shift_/$id/report")({
  head: () => ({ meta: [{ title: "Relatório" }] }),
  component: ReportPage,
});

function ReportPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [reopening, setReopening] = useState(false);

  const q = useQuery({
    queryKey: ["shift-report", id],
    queryFn: async () => {
      // Prefer local copy so the report opens instantly and offline.
      try {
        const local = await getLocalDB().shifts.get(id);
        if (local?.report_text) return local;
      } catch {
        /* SSR / no DB */
      }
      const { data, error } = await supabase
        .from("expedientes")
        .select("id,report_text,started_at,status,team_id")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const text = q.data?.report_text ?? "";
  const teamId = q.data?.team_id ?? null;

  // Só deixa reabrir se não houver outro expediente aberto no momento —
  // reabrir com um já em andamento criaria dois expedientes "open" ao
  // mesmo tempo, o que quebraria as telas que assumem só um.
  const otherOpenShift = useLiveQuery(async () => {
    if (!teamId) return null;
    const db = getLocalDB();
    const row = await db.shifts
      .where("[team_id+status+started_at]")
      .between([teamId, "open", ""], [teamId, "open", "￿"])
      .last();
    return row && row.id !== id ? row : null;
  }, [teamId, id]);

  const canReopen = q.data?.status === "closed" && !otherOpenShift;

  async function reopenShift() {
    if (!canReopen) return;
    const ok = await confirmAction({
      title: "Reabrir expediente?",
      confirmText: "Reabrir",
      cancelText: "Cancelar",
    });
    if (!ok) return;
    setReopening(true);
    try {
      await repoReopenShift(id);
      await queryClient.invalidateQueries();
      navigate({ to: "/shift" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao reabrir");
    } finally {
      setReopening(false);
    }
  }

  return (
    <AppShell
      title="Relatório"
      right={
        canReopen ? (
          <button
            type="button"
            onClick={reopenShift}
            disabled={reopening}
            className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-primary px-2.5 text-xs font-semibold text-primary-foreground disabled:opacity-60"
          >
            {reopening ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <>
                <RotateCcw className="size-3.5" /> Reabrir
              </>
            )}
          </button>
        ) : undefined
      }
    >
      {q.isLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="size-6 animate-spin text-canvas-foreground/60" />
        </div>
      ) : (
        <div className="space-y-4 pb-24">
          <pre className="whitespace-pre-wrap rounded-card bg-card shadow-md p-4 font-mono text-sm leading-relaxed">
            {text}
          </pre>
        </div>
      )}

      {!q.isLoading && (
        // Fixo no rodapé (mesmo padrão dos botões do Expediente) — só o
        // relatório rola quando é grande, os botões continuam alcançáveis
        // sem precisar rolar a tela toda.
        <div
          className="fixed inset-x-0 z-30 mx-auto flex max-w-md justify-between gap-2 px-4 transition-[bottom] duration-150"
          style={{ bottom: "var(--sync-floating-bottom, calc(env(safe-area-inset-bottom, 0px) + 1rem))" }}
        >
          <Button
            className="h-14 flex-1 text-base font-semibold"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(text);
                toast.success("Relatório copiado");
              } catch {
                toast.error("Não foi possível copiar");
              }
            }}
          >
            <Copy className="mr-2 size-5" /> Copiar
          </Button>
          <Button
            className="h-14 flex-1 border-0 bg-[#25D366] text-base font-semibold text-white hover:bg-[#25D366]/90"
            onClick={() => {
              const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
              window.open(url, "_blank");
            }}
          >
            <Share2 className="mr-2 size-5" /> Enviar no WhatsApp
          </Button>
        </div>
      )}
    </AppShell>
  );
}