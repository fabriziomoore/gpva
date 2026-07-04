import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Outlet, createRootRouteWithContext } from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { startSync } from "@/lib/sync/init";
import { startSessionGuard } from "@/lib/session-guard";
import { Toaster } from "@/components/ui/sonner";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 text-center">
      <div>
        <h1 className="text-5xl font-bold text-foreground">404</h1>
        <p className="mt-2 text-sm text-muted-foreground">Tela não encontrada.</p>
      </div>
    </div>
  );
}

function ErrorComponent({ error }: { error: Error }) {
  console.error(error);
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6 text-center">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Algo deu errado</h1>
        <p className="mt-2 text-xs text-muted-foreground">{error?.message}</p>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootComponent(): ReactNode {
  const { queryClient } = Route.useRouteContext();

  useEffect(() => {
    void startSync();
    startSessionGuard();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <Outlet />
      <Toaster />
    </QueryClientProvider>
  );
}