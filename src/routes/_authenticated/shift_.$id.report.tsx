import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Copy, Share2, Printer, Loader2 } from "lucide-react";
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
      const { data, error } = await supabase
        .from("shifts")
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
        <div className="space-y-4">
          <pre className="whitespace-pre-wrap rounded-2xl border border-border bg-card p-4 font-mono text-sm leading-relaxed">
            {text}
          </pre>

          <div className="grid grid-cols-1 gap-2">
            <Button
              className="h-14 text-base font-semibold"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(text);
                  toast.success("Relatório copiado");
                } catch {
                  toast.error("Não foi possível copiar");
                }
              }}
            >
              <Copy className="mr-2 size-5" /> Copiar Relatório
            </Button>
            <Button
              variant="outline"
              className="h-14 text-base font-semibold"
              onClick={() => {
                const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
                window.open(url, "_blank");
              }}
            >
              <Share2 className="mr-2 size-5" /> Enviar no WhatsApp
            </Button>
            <Button
              variant="outline"
              className="h-14 text-base font-semibold"
              onClick={() => exportPdf(text)}
            >
              <Printer className="mr-2 size-5" /> Exportar PDF
            </Button>
          </div>
        </div>
      )}
    </AppShell>
  );
}

function exportPdf(text: string) {
  const w = window.open("", "_blank");
  if (!w) {
    toast.error("Permita popups para gerar o PDF");
    return;
  }
  w.document.write(`
    <html><head><title>Relatório GPVA</title>
    <style>
      body{font-family:ui-monospace,Menlo,Consolas,monospace;padding:24px;white-space:pre-wrap;line-height:1.5;font-size:13px;color:#111;}
    </style></head><body>${text.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[c]!)}</body></html>
  `);
  w.document.close();
  setTimeout(() => w.print(), 300);
}