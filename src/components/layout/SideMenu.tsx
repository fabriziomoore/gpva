import { useMemo, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Link, useNavigate } from "@tanstack/react-router";
import { Home, BarChart3, Wallet, Settings, Menu, X, LogOut, Map, Search, AlertTriangle, ExternalLink, Trophy } from "lucide-react";
import { useAuthSession } from "@/hooks/use-auth";
import { useIsLeader } from "@/hooks/use-is-leader";
import { supabase } from "@/integrations/supabase/client";
import { ExitConfirmDialog } from "@/components/layout/ExitConfirmDialog";
import { clearSessionBackup } from "@/lib/sync/session-backup";

const ARCGIS_URL =
  "https://arcgis.aegea.com.br/portal/apps/webappviewer/index.html?id=0cbbe90bebaf4d7a85d07c7af12b0de0";

const ARCGIS_RISK_URL =
  "https://arcgis.aegea.com.br/portal/apps/webappviewer/index.html?id=28bf0795832f47bf946e07822552c06d";

type CapacitorWindow = Window & {
  Capacitor?: {
    isNativePlatform?: () => boolean;
  };
};

const AUTH_STORAGE_PATTERNS = ["sb-", "supabase.auth", "gpva.loginAt", "gpva.sessionId"];

function isNativeRuntime(): boolean {
  if (typeof window === "undefined") return false;
  return (window as CapacitorWindow).Capacitor?.isNativePlatform?.() === true;
}

async function openUrlExternally(url: string): Promise<void> {
  if (isNativeRuntime()) {
    try {
      const { Browser } = await import("@capacitor/browser");
      await Browser.open({ url, presentationStyle: "fullscreen" });
      return;
    } catch {
      window.location.assign(url);
      return;
    }
  }

  const openedWindow = window.open(url, "_blank", "noopener,noreferrer");
  if (!openedWindow) window.location.assign(url);
}

function openArcgisUrl(url: string, title: string, setTitle: (title: string) => void, setEmbedUrl: (url: string) => void) {
  if (isNativeRuntime()) {
    void openArcgisInNativeWebView(url, title);
    return;
  }
  setTitle(title);
  setEmbedUrl(url);
}

async function openArcgisInNativeWebView(url: string, title: string): Promise<void> {
  try {
    const { InAppBrowser, ToolBarType, BackgroundColor } = await import("@capgo/inappbrowser");
    await InAppBrowser.openWebView({
      url,
      title,
      toolbarType: ToolBarType.COMPACT,
      toolbarColor: "#1a2338",
      toolbarTextColor: "#ffffff",
      backgroundColor: BackgroundColor.WHITE,
      visibleTitle: true,
      showArrow: false,
      showReloadButton: false,
      activeNativeNavigationForWebview: true,
      isPresentAfterPageLoad: false,
      isAnimated: true,
    });
  } catch {
    window.location.assign(url);
  }
}

const teamItems = [
  { to: "/" as const, label: "Início", icon: Home, exact: true },
  { to: "/productivity" as const, label: "Produtividade", icon: BarChart3, exact: false },
  { to: "/variable" as const, label: "Variável", icon: Wallet, exact: false },
  { to: "/settings" as const, label: "Configurações", icon: Settings, exact: false },
];

const leaderItems = [
  { to: "/leader" as const, label: "Painel do Líder", icon: BarChart3, exact: true },
  { to: "/leader-ranking" as const, label: "Ranking & Perfis", icon: Trophy, exact: true },
  { to: "/leader-map" as const, label: "Mapa", icon: Map, exact: true },
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
    // Limpa qualquer trava residual deixada pelos overlays do Radix
    // (Dialog + AlertDialog fechando em cascata podem deixar
    // pointer-events:none no body em alguns navegadores mobile).
    if (typeof document !== "undefined") {
      document.body.style.pointerEvents = "";
      document.body.removeAttribute("data-scroll-locked");
    }
    // Encerra a sessão com timeout curto: sem rede o signOut remoto pode
    // pendurar, mas precisamos garantir que a sessão local seja apagada
    // ANTES de navegar. Caso contrário /auth vê a sessão viva e devolve
    // o usuário para o app (bug do mapa do líder que ficava travado).
    try {
      await Promise.race([
        supabase.auth.signOut({ scope: "local" }),
        new Promise((resolve) => setTimeout(resolve, 1500)),
      ]);
    } catch {
      /* ignore */
    }
    // Garante limpeza mesmo se o SDK falhou silenciosamente offline.
    if (typeof window !== "undefined") {
      try {
        const keys: string[] = [];
        for (let i = 0; i < window.localStorage.length; i++) {
          const k = window.localStorage.key(i);
          if (
            k &&
            AUTH_STORAGE_PATTERNS.some((pattern) =>
              pattern.endsWith("-") ? k.startsWith(pattern) : k.includes(pattern),
            )
          ) {
            keys.push(k);
          }
        }
        keys.forEach((k) => window.localStorage.removeItem(k));
        window.sessionStorage.removeItem("gpva-admin-pw");
        window.sessionStorage.setItem("gpva.forceSignedOut", "1");
      } catch {
        /* ignore */
      }
    }
    await clearSessionBackup().catch(() => undefined);

    // No Android/Capacitor a rota é memory-history; trocar window.location para
    // /auth pode deixar o Leaflet montado como única tela. Navegar pelo router
    // desmonta o mapa e troca a tela de forma confiável.
    if (isNativeRuntime()) {
      navigate({ to: "/auth", replace: true });
    } else if (typeof window !== "undefined") {
      window.location.assign("/auth");
    } else {
      navigate({ to: "/auth", replace: true });
    }
  }
  const items = useMemo(
    () => (isLeader.data === true ? leaderItems : teamItems),
    [isLeader.data],
  );
  const [arcgisQuery, setArcgisQuery] = useState("");
  const [arcgisEmbedUrl, setArcgisEmbedUrl] = useState<string | null>(null);
  const [arcgisTitle, setArcgisTitle] = useState<string>("Consulta ArcGIS");

  function openArcgis() {
    const term = arcgisQuery.trim();
    const url = term
      ? `${ARCGIS_URL}&find=${encodeURIComponent(term)}`
      : ARCGIS_URL;
    setOpen(false);
    openArcgisUrl(url, "Consulta ArcGIS", setArcgisTitle, setArcgisEmbedUrl);
  }
  function openArcgisRisk() {
    setOpen(false);
    setArcgisTitle("Consulta ArcGIS Área de Risco");
    const fallback = () => {
      openArcgisUrl(
        ARCGIS_RISK_URL,
        "Consulta ArcGIS Área de Risco",
        setArcgisTitle,
        setArcgisEmbedUrl,
      );
    };
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      fallback();
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { longitude, latitude } = pos.coords;
        // WebAppViewer aceita "extent=xmin,ymin,xmax,ymax" em lat/lon (wkid 4326).
        // Uma janela de ~300m em torno do usuário (0.0025° ≈ 275m).
        const d = 0.015;
        const xmin = longitude - d;
        const xmax = longitude + d;
        const ymin = latitude - d;
        const ymax = latitude + d;
        const marker = `${longitude},${latitude},4326,,,;;;;;Você está aqui`;
        const url =
          `${ARCGIS_RISK_URL}` +
          `&extent=${xmin},${ymin},${xmax},${ymax},4326` +
          `&marker=${encodeURIComponent(marker)}`;
        openArcgisUrl(
          url,
          "Consulta ArcGIS Área de Risco",
          setArcgisTitle,
          setArcgisEmbedUrl,
        );
      },
      () => fallback(),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 },
    );
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
            <button
              type="button"
              onClick={openArcgisRisk}
              className="mt-3 flex w-full items-center gap-3 rounded-xl border border-border bg-muted/40 p-3 text-left transition-colors hover:bg-muted"
            >
              <AlertTriangle className="size-5 text-primary shrink-0" />
              <div className="min-w-0">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Área de Risco
                </div>
                <p className="text-[11px] leading-snug text-muted-foreground">
                  Abrir mapa de áreas de risco no app.
                </p>
              </div>
            </button>
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
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border-b border-border bg-card px-3 py-2 sm:px-4">
              <div className="flex min-w-0 items-center gap-2">
                <button
                  type="button"
                  aria-label="Abrir menu"
                  onClick={() => setOpen(true)}
                  className="-ml-1 inline-flex size-9 shrink-0 items-center justify-center rounded-lg text-foreground transition-colors hover:bg-muted"
                >
                  <Menu className="size-5" />
                </button>
                <Map className="size-4 shrink-0 text-primary" />
                <span className="min-w-0 truncate text-sm font-semibold">{arcgisTitle}</span>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (arcgisEmbedUrl) void openUrlExternally(arcgisEmbedUrl);
                  }}
                  aria-label="Abrir no navegador"
                  className="hidden rounded-lg border border-border bg-background px-2 py-1 text-xs font-medium text-foreground hover:bg-muted sm:inline-flex"
                >
                  Abrir no navegador
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (arcgisEmbedUrl) void openUrlExternally(arcgisEmbedUrl);
                  }}
                  aria-label="Abrir no navegador"
                  className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-background text-foreground hover:bg-muted sm:hidden"
                >
                  <ExternalLink className="size-4" />
                </button>
                <Dialog.Close
                  aria-label="Fechar"
                  className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-destructive text-white hover:bg-destructive/90"
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