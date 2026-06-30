import { createRoot } from "react-dom/client";
import { useEffect, useState } from "react";
import { QueryClient } from "@tanstack/react-query";
import { RouterProvider, createMemoryHistory, createRouter } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { LoginOnly } from "./mobile/LoginOnly";

// Capacitor SPA bootstrap. Unlike TanStack Start's default client entry,
// this does NOT call hydrateRoot — there is no SSR markup inside the
// Capacitor WebView shell. We mount a fresh React tree into #root and
// drive the router with an in-memory history so WebView URL schemes never
// pull in TanStack Start's SSR/hydration runtime.
type MobileRouter = ReturnType<typeof createRouter>;

function LoadingScreen() {
  return (
    <main style={{
      minHeight: "100vh",
      display: "grid",
      placeItems: "center",
      background: "#1b1f27",
      color: "#f8fafc",
      fontFamily: "Arial, sans-serif",
    }}>
      Carregando...
    </main>
  );
}

function MobileBootstrap() {
  const [status, setStatus] = useState<"checking" | "login" | "app">("checking");
  const [router, setRouter] = useState<MobileRouter | null>(null);

  async function loadAuthenticatedApp() {
    setStatus("app");
    const [{ routeTree }] = await Promise.all([
      import("./mobile-route-tree"),
      import("./styles.css"),
    ]);

    const queryClient = new QueryClient();
    setRouter(createRouter({
      routeTree,
      context: { queryClient },
      history: createMemoryHistory({ initialEntries: ["/"] }),
      scrollRestoration: false,
      defaultPreloadStaleTime: 0,
    }));
  }

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      if (data.session) {
        void loadAuthenticatedApp();
      } else {
        setStatus("login");
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  if (status === "login") {
    return <LoginOnly onSignedIn={loadAuthenticatedApp} />;
  }

  if (router) {
    return <RouterProvider router={router} />;
  }

  return <LoadingScreen />;
}

const container = document.getElementById("root");
if (!container) {
  throw new Error("Capacitor entry: #root container not found in index.html");
}

document.documentElement.classList.add("dark");
document.documentElement.style.colorScheme = "dark";
document.documentElement.dataset.capacitor = "true";

createRoot(container).render(
  <MobileBootstrap />,
);