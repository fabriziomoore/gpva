import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient } from "@tanstack/react-query";
import { RouterProvider, createMemoryHistory, createRouter } from "@tanstack/react-router";
import { routeTree } from "./mobile-route-tree";
import "./styles.css";
import { applyTheme } from "./hooks/use-theme";

// Force dark theme on first launch inside the Capacitor WebView.
// The user can still toggle to light afterwards (persisted via useTheme),
// but the Android app always *starts* in dark mode.
try {
  const STORAGE_KEY = "gpva.theme";
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored !== "light" && stored !== "dark") {
    window.localStorage.setItem(STORAGE_KEY, "dark");
  }
  applyTheme((stored === "light" || stored === "dark" ? stored : "dark") as "light" | "dark");
} catch {
  applyTheme("dark");
}

// Capacitor SPA bootstrap. Unlike TanStack Start's default client entry,
// this does NOT call hydrateRoot — there is no SSR markup inside the
// Capacitor WebView shell. We mount a fresh React tree into #root and
// drive the router with an in-memory history so WebView URL schemes never
// pull in TanStack Start's SSR/hydration runtime.
const queryClient = new QueryClient();
const router = createRouter({
  routeTree,
  context: { queryClient },
  history: createMemoryHistory({ initialEntries: ["/"] }),
  scrollRestoration: true,
  defaultPreloadStaleTime: 0,
});

const container = document.getElementById("root");
if (!container) {
  throw new Error("Capacitor entry: #root container not found in index.html");
}

createRoot(container).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);