import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ChevronRight, FileText, Loader2, Search, X } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { ShiftMeta } from "@/components/layout/ShiftMeta";
import { Input } from "@/components/ui/input";
import { Dialog, DialogClose, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { usePublishedProcedures, type PublishedProcedure } from "@/hooks/use-procedures";
import { ProcedurePlayer, type ProcedurePlayerHandle } from "@/components/procedures/ProcedurePlayer";

export const Route = createFileRoute("/_authenticated/procedures")({
  head: () => ({ meta: [{ title: "Procedimentos" }] }),
  component: ProceduresPage,
});

function ProceduresPage() {
  const { data: procedures, isLoading } = usePublishedProcedures();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<PublishedProcedure | null>(null);
  const [canGoBack, setCanGoBack] = useState(false);
  const playerRef = useRef<ProcedurePlayerHandle>(null);

  useEffect(() => {
    setCanGoBack(false);
  }, [selected?.id]);

  const filtered = useMemo(() => {
    const list = procedures ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (p) =>
        p.titulo.toLowerCase().includes(q) ||
        p.categoria.toLowerCase().includes(q) ||
        (p.setor ?? "").toLowerCase().includes(q),
    );
  }, [procedures, search]);

  return (
    <AppShell title="Procedimentos" right={<ShiftMeta />}>
      <div className="space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por título, categoria ou setor..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-11 pl-9"
          />
        </div>

        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-8 text-center">
            <FileText className="mx-auto mb-3 size-10 text-muted-foreground opacity-40" />
            <p className="text-sm font-medium text-foreground">
              {search ? "Nenhum procedimento encontrado" : "Nenhum procedimento publicado ainda"}
            </p>
            {!search && (
              <p className="mt-1 text-xs text-muted-foreground">
                Fale com seu líder pra saber quando os procedimentos vão estar disponíveis.
              </p>
            )}
          </div>
        ) : (
          <ul className="space-y-2">
            {filtered.map((proc) => (
              <li key={proc.id}>
                <button
                  type="button"
                  onClick={() => setSelected(proc)}
                  className="group flex w-full items-center gap-3 rounded-xl bg-card p-3 text-left shadow-md transition-shadow hover:shadow-lg"
                >
                  <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                    <FileText className="size-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold uppercase text-foreground">{proc.titulo}</p>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                        {proc.categoria}
                      </span>
                      {proc.setor && (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                          {proc.setor}
                        </span>
                      )}
                    </div>
                  </div>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent
          className="max-h-[85vh] overflow-y-auto"
          hideDefaultClose
          onPointerDownOutside={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <div className="flex items-center gap-2">
              <div className="inline-flex h-9 min-w-0 flex-1 items-center gap-2 rounded-lg bg-primary pl-2 pr-3 text-primary-foreground">
                {canGoBack && (
                  <button
                    type="button"
                    onClick={() => playerRef.current?.back()}
                    aria-label="Voltar"
                    className="shrink-0 rounded-md p-1 text-primary-foreground/90 transition-colors hover:text-primary-foreground"
                  >
                    <ArrowLeft className="size-5" />
                  </button>
                )}
                <DialogTitle className="truncate uppercase text-primary-foreground">{selected?.titulo}</DialogTitle>
              </div>
              <DialogClose
                aria-label="Fechar"
                className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-red-500/90 text-white transition-colors hover:bg-red-600 focus:outline-none focus-visible:outline-none"
              >
                <X className="size-5" strokeWidth={3} />
              </DialogClose>
            </div>
          </DialogHeader>
          {selected && (
            <ProcedurePlayer
              ref={playerRef}
              key={selected.id}
              tree={selected.arvore_decisao}
              onPathChange={setCanGoBack}
            />
          )}
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
