import { useMemo, useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import * as Dialog from "@radix-ui/react-dialog";
import { Link, useNavigate } from "@tanstack/react-router";
import { Home, BarChart3, Wallet, Settings, Menu, X, LogOut, Map, Search, AlertTriangle, ExternalLink, Trophy, RotateCcw, FileText, RefreshCw } from "lucide-react";
import { useAuthSession } from "@/hooks/use-auth";
import { useIsLeader } from "@/hooks/use-is-leader";
import { ExitConfirmDialog } from "@/components/layout/ExitConfirmDialog";
import { requestUpdateCheck } from "@/components/layout/UpdateBanner";
import { prepareAppSignOut, finalizePreparedSignOut } from "@/lib/auth";


const ARCGIS_URL =
  "https://arcgis.aegea.com.br/portal/apps/webappviewer/index.html?id=0cbbe90bebaf4d7a85d07c7af12b0de0";

const ARCGIS_RISK_URL =
  "https://arcgis.aegea.com.br/portal/apps/webappviewer/index.html?id=28bf0795832f47bf946e07822552c06d";

const FELT_MAP_URL =
  "https://felt.com/map/Consulta-e-Extensao-de-Rede-de-Agua-tDhFyP9AKS9CWk4u68rhICCB?loc=-22.95892,-42.97073,15.51z";

type CapacitorWindow = Window & {
  Capacitor?: {
    isNativePlatform?: () => boolean;

  };
};

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
      showReloadButton: true, // Habilitado para resolver problemas de carregamento
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
  { to: "/leader" as const, label: "Painel", icon: BarChart3, exact: true },
  { to: "/leader-ranking" as const, label: "Ranking & Perfis", icon: Trophy, exact: true },
  { to: "/leader-map" as const, label: "Mapa", icon: Map, exact: true },
  { to: "/leader-procedures" as const, label: "Procedimentos", icon: FileText, exact: false },
  { to: "/leader-config" as const, label: "Configuração", icon: Settings, exact: false },
];

export function SideMenu() {
  const { userId } = useAuthSession();
  const isLeader = useIsLeader(userId);
  const [open, setOpen] = useState(false);
  const [fixedHeight, setFixedHeight] = useState<string | null>(null);
  const [orientation, setOrientation] = useState(0);

  const captureHeight = () => {
    const height = document.documentElement.clientHeight;
    setFixedHeight(`${height}px`);
  };

  useEffect(() => {
    const handleResize = () => {
      const newOrientation = window.screen?.orientation?.angle ?? (window.orientation as number) ?? 0;
      if (newOrientation !== orientation) {
        setOrientation(newOrientation);
        if (open) {
          captureHeight();
        }
      }
    };

    window.addEventListener("resize", handleResize);
    window.addEventListener("orientationchange", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("orientationchange", handleResize);
    };
  }, [open, orientation]);

  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen);
    if (isOpen) {
      captureHeight();
    } else {
      setFixedHeight(null);
    }
  };

  const [exitOpen, setExitOpen] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  function requestSignOut() {
    setOpen(false);
    window.setTimeout(() => setExitOpen(true), 80);
  }

  async function confirmSignOut() {
    setExitOpen(false);
    setOpen(false);
    
    // 1. Limpa resíduos visuais do Radix
    if (typeof document !== "undefined") {
      document.body.style.pointerEvents = "";
      document.body.removeAttribute("data-scroll-locked");
    }

    // 2. Coordenar Logout e Reset Demo (Fase A: Preparação)
    // Isso deve ocorrer ANTES da navegação para que o reset demo receba a sessão
    // e o gpva.forceSignedOut seja marcado no storage local.
    const signOutContext = await prepareAppSignOut(userId ?? undefined);

    // 3. Navegação para /auth
    // Como forceSignedOut já está "1", o beforeLoad de /auth não redirecionará de volta para /.
    await navigate({ to: "/auth", replace: true });

    // 4. Finalização (Fase B: Supabase SignOut Remoto e Cleanup)
    await finalizePreparedSignOut(queryClient, signOutContext);
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
  function openFeltMap() {
    setOpen(false);
    openArcgisUrl(FELT_MAP_URL, "Mapa de Rede", setArcgisTitle, setArcgisEmbedUrl);
  }

  return (

    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Trigger
        aria-label="Abrir menu"
        className="-ml-1 inline-flex size-10 items-center justify-center rounded-lg text-foreground transition-colors hover:bg-muted"
      >
        <Menu className="size-6" />
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[9998] bg-background/40 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content
          style={{ height: fixedHeight || "100%", maxHeight: fixedHeight || "100%" } as React.CSSProperties}
          className="fixed inset-y-0 left-0 z-[9999] flex w-72 max-w-[80vw] flex-col overflow-hidden border-r border-border bg-card shadow-2xl transition ease-in-out duration-300 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]"
        >
          <Dialog.Title className="sr-only">Menu</Dialog.Title>
          <header className="flex shrink-0 items-center justify-between px-4 py-4">
            <span className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Menu
            </span>
            <Dialog.Close
              aria-label="Fechar menu"
              className="inline-flex size-9 items-center justify-center rounded-lg bg-destructive text-white hover:bg-destructive/90"
            >
              <X className="size-5" />
            </Dialog.Close>
          </header>
          <main className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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
            <div className="mt-4 rounded-xl bg-card p-3 shadow-md">
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
              className="mt-3 flex w-full items-center gap-3 rounded-xl bg-card p-3 text-left shadow-md transition-shadow hover:shadow-lg"
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
            <button
              type="button"
              onClick={openFeltMap}
              className="mt-3 flex w-full items-center gap-3 rounded-xl bg-card p-3 text-left shadow-md transition-shadow hover:shadow-lg"
            >
              <Map className="size-5 text-primary shrink-0" />
              <div className="min-w-0">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Mapa de Rede
                </div>
                <p className="text-[11px] leading-snug text-muted-foreground">
                  Consulta ao Mapa de Rede de Água
                </p>
              </div>
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                requestUpdateCheck();
              }}
              className="mt-3 flex w-full items-center gap-3 rounded-xl bg-card p-3 text-left shadow-md transition-shadow hover:shadow-lg"
            >
              <RefreshCw className="size-5 text-primary shrink-0" />
              <div className="min-w-0">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Verificar atualização
                </div>
                <p className="text-[11px] leading-snug text-muted-foreground">
                  Força uma nova checagem caso o app não tenha avisado sozinho.
                </p>
              </div>
            </button>

          </main>
          <footer className="shrink-0 border-t border-border bg-destructive">
            <button
              type="button"
              onClick={requestSignOut}
              className="flex w-full items-center gap-3 px-5 py-4 text-left text-sm font-semibold text-destructive-foreground transition-colors hover:bg-destructive/90"
            >
              <LogOut className="size-5" />
              <span>Sair</span>
            </button>
          </footer>
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
            <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 border-b border-border bg-card px-3 py-2 sm:px-4">
              <div className="flex shrink-0 items-center gap-2">
                <Dialog.Close
                  aria-label="Fechar"
                  className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-destructive text-white hover:bg-destructive/90"
                >
                  <X className="size-5" />
                </Dialog.Close>
              </div>
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
                    const current = arcgisEmbedUrl;
                    setArcgisEmbedUrl(null);
                    setTimeout(() => setArcgisEmbedUrl(current), 10);
                  }}
                  aria-label="Atualizar página"
                  className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-background text-foreground hover:bg-muted"
                >
                  <RotateCcw className="size-4" />
                </button>
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