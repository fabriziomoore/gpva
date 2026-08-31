import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { startSync } from "../lib/sync/init";
import { startSessionGuard } from "../lib/session-guard";
import { requestBootPermissions } from "../lib/boot-permissions";
import { THEME_BOOT_SCRIPT } from "../hooks/use-theme";
import { ConfirmDialogHost } from "@/components/ui/confirm-dialog";
import { SyncBadge } from "@/components/sync-badge";
import { NetworkDiagPanel } from "@/components/NetworkDiagPanel";
import { Toaster } from "@/components/ui/sonner";
import { registerPWA } from "../lib/pwa/register";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Página não encontrada</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          A página solicitada não existe ou foi movida.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Voltar ao início
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error("[ACP] Unhandled route error", error);
  const router = useRouter();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Não foi possível carregar esta página
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Ocorreu um erro inesperado. Tente novamente ou volte ao início.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Tentar novamente
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Voltar ao início
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { title: "ACP" },
      { name: "description", content: "ACP — Assistente de Campo e Produtividade." },
      { name: "author", content: "ACP" },
      { property: "og:title", content: "ACP" },
      { property: "og:description", content: "ACP — Assistente de Campo e Produtividade." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "theme-color", content: "#1a1d24" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "apple-mobile-web-app-title", content: "ACP" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "twitter:title", content: "ACP" },
      { name: "twitter:description", content: "ACP — Assistente de Campo e Produtividade." },
      { property: "og:image", content: "/icon-512.png" },
      { name: "twitter:image", content: "/icon-512.png" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
      { rel: "icon", type: "image/png", sizes: "192x192", href: "/icon-192.png" },
      { rel: "icon", type: "image/png", sizes: "512x512", href: "/icon-512.png" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head suppressHydrationWarning>
        <script suppressHydrationWarning dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
        <HeadContent />
      </head>
      <body suppressHydrationWarning>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  useEffect(() => {
    console.log("[BOOT] 1. App iniciado — RootComponent mounted");
    void (async () => {
      try {
        console.log("[BOOT] 2. requestBootPermissions:start (Capacitor)");
        await requestBootPermissions();
        console.log("[BOOT] 2. requestBootPermissions:done");
      } catch (e) { console.warn("[BOOT] 2. requestBootPermissions:error", e); }

      try {
        console.log("[BOOT] 3. startSync:start (NetworkService + Sync + OfflineAuth)");
        await startSync();
        console.log("[BOOT] 3. startSync:done");
      } catch (e) { console.warn("[BOOT] 3. startSync:error", e); }

      try {
        console.log("[BOOT] 4. startSessionGuard:start (Supabase session)");
        startSessionGuard();
        console.log("[BOOT] 4. startSessionGuard:done");
      } catch (e) { console.warn("[BOOT] 4. startSessionGuard:error", e); }

      try {
        console.log("[BOOT] 5. registerPWA:start");
        registerPWA();
        console.log("[BOOT] 5. registerPWA:done");
      } catch (e) { console.warn("[BOOT] 5. registerPWA:error", e); }

      console.log("[BOOT] 6. Bootstrap sequence complete — router should be free");
    })();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <Outlet />
      <ConfirmDialogHost />
      <Toaster />
      <SyncBadge />
      <NetworkDiagPanel />
    </QueryClientProvider>
  );
}
