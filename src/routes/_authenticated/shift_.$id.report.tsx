import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getLocalDB } from "@/lib/db/local-db";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Copy, Share2, Loader2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/shift_/$id/report")({
  head: () => ({ meta: [{ title: "Relatório" }] }),
  component: ReportPage,
});

function ReportPage() {
  const { id } = Route.useParams();

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
        .select("id,report_text,started_at")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const text = q.data?.report_text ?? "";

  return (
    <AppShell title="Relatório">
      {q.isLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-4 pb-24">
          <pre className="whitespace-pre-wrap rounded-2xl bg-card shadow-md p-4 font-mono text-sm leading-relaxed">
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
            variant="outline"
            className="h-14 flex-1 text-base font-semibold"
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