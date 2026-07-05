import { useMemo, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Link, useNavigate } from "@tanstack/react-router";
import { Home, BarChart3, Wallet, Settings, Menu, X, LogOut, Map, Search } from "lucide-react";
import { useAuthSession } from "@/hooks/use-auth";
import { useIsLeader } from "@/hooks/use-is-leader";
import { supabase } from "@/integrations/supabase/client";
import { ExitConfirmDialog } from "@/components/layout/ExitConfirmDialog";
import { toast } from "sonner";

const ARCGIS_URL =
  "https://arcgis.aegea.com.br/portal/apps/webappviewer/index.html?id=0cbbe90bebaf4d7a85d07c7af12b0de0";

const teamItems = [
  { to: "/" as const, label: "Início", icon: Home, exact: true },
  { to: "/productivity" as const, label: "Produtividade", icon: BarChart3, exact: false },
  { to: "/variable" as const, label: "Variável", icon: Wallet, exact: false },
  { to: "/settings" as const, label: "Configurações", icon: Settings, exact: false },
];

const leaderItems = [
  { to: "/leader" as const, label: "Painel do Líder", icon: BarChart3, exact: true },
  { to: "/leader-config" as const, label: "Configuração", icon: Settings, exact: false },
];

export function SideMenu() {
  const { userId } = useAuthSession();
  const isLeader = useIsLeader(userId);
  const [open, setOpen] = useState(false);
  const [exitOpen, setExitOpen] = useState(false);
  const navigate = useNavigate();
  async function confirmSignOut() {
    setExitOpen(false);
    setOpen(false);
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  }
  const items = useMemo(
    () => (isLeader.data === true ? leaderItems : teamItems),
    [isLeader.data],
  );
  const [arcgisQuery, setArcgisQuery] = useState("");
  const [arcgisEmbedUrl, setArcgisEmbedUrl] = useState<string | null>(null);

  function openArcgis() {
    const term = arcgisQuery.trim();
    const url = term
      ? `${ARCGIS_URL}&find=${encodeURIComponent(term)}`
      : ARCGIS_URL;
    setArcgisEmbedUrl(url);
    setOpen(false);
  }
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger
        aria-label="Abrir menu"
        className="-ml-1 inline-flex size-10 items-center justify-center rounded-lg text-foreground transition-colors hover:bg-muted"
      >
        <Menu className="size-6" />
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[9998] bg-background/40 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content
          className="fixed inset-y-0 left-0 z-[9999] flex h-full w-72 max-w-[80vw] flex-col border-r border-border bg-card/40 backdrop-blur-2xl backdrop-saturate-150 shadow-2xl transition ease-in-out data-[state=closed]:duration-300 data-[state=open]:duration-500 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]"
        >
          <Dialog.Title className="sr-only">Menu</Dialog.Title>
          <div className="flex items-center justify-between px-4 py-4">
            <span className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Menu
            </span>
            <Dialog.Close
              aria-label="Fechar menu"
              className="inline-flex size-9 items-center justify-center rounded-lg bg-destructive text-white hover:bg-destructive/90"
            >
              <X className="size-5" />
            </Dialog.Close>
          </div>
          <nav className="flex-1 overflow-y-auto px-2">
            <ul className="space-y-1">
              {items.map(({ to, label, icon: Icon, exact }) => (
                <li key={to}>
                  <Link
                    to={to}
                    activeOptions={{ exact }}
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground data-[status=active]:bg-primary/10 data-[status=active]:text-primary"
                  >
                    <Icon className="size-5" />
                    <span>{label}</span>
                  </Link>
                </li>
              ))}
            </ul>
            <div className="mt-4 rounded-xl border border-border bg-muted/40 p-3">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <Map className="size-4" />
                <span>Consulta ArcGIS Aegea</span>
              </div>
              <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
                Digite matrícula ou número do HD para realizar a busca no mapa.
              </p>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void openArcgis();
                }}
                className="mt-2 flex items-center gap-2"
              >
                <input
                  type="text"
                  value={arcgisQuery}
                  onChange={(e) => setArcgisQuery(e.target.value)}
                  placeholder="Buscar..."
                  className="min-w-0 flex-1 rounded-lg border border-border bg-background px-2 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40"
                />
                <button
                  type="submit"
                  aria-label="Abrir mapa"
                  className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  <Search className="size-4" />
                </button>
              </form>
            </div>
          </nav>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              setExitOpen(true);
            }}
            className="flex w-full items-center gap-3 border-t border-border bg-destructive px-5 py-4 text-left text-sm font-semibold text-destructive-foreground transition-colors hover:bg-destructive/90"
          >
            <LogOut className="size-5" />
            <span>Sair</span>
          </button>
        </Dialog.Content>
      </Dialog.Portal>
      <ExitConfirmDialog open={exitOpen} onOpenChange={setExitOpen} onConfirm={confirmSignOut} />
      <Dialog.Root
        open={arcgisEmbedUrl !== null}
        onOpenChange={(v) => !v && setArcgisEmbedUrl(null)}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[9998] bg-background/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
          <Dialog.Content className="fixed inset-0 z-[9999] flex h-full w-full flex-col bg-background pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
            <Dialog.Title className="sr-only">Consulta ArcGIS Aegea</Dialog.Title>
            <div className="flex items-center justify-between gap-2 border-b border-border bg-card px-4 py-2">
              <div className="flex items-center gap-2 min-w-0">
                <Map className="size-4 text-primary shrink-0" />
                <span className="truncate text-sm font-semibold">Consulta ArcGIS</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (arcgisEmbedUrl) window.open(arcgisEmbedUrl, "_blank", "noopener,noreferrer");
                  }}
                  className="rounded-lg border border-border bg-background px-2 py-1 text-xs font-medium text-foreground hover:bg-muted"
                >
                  Abrir no navegador
                </button>
                <Dialog.Close
                  aria-label="Fechar"
                  className="inline-flex size-9 items-center justify-center rounded-lg bg-destructive text-white hover:bg-destructive/90"
                >
                  <X className="size-5" />
                </Dialog.Close>
              </div>
            </div>
            {arcgisEmbedUrl && (
              <iframe
                key={arcgisEmbedUrl}
                src={arcgisEmbedUrl}
                title="ArcGIS Aegea"
                className="flex-1 w-full border-0"
                allow="geolocation; fullscreen"
              />
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </Dialog.Root>
  );
}