import "./styles.css";
import { createRoot } from "react-dom/client";
import { QueryClient } from "@tanstack/react-query";
import { RouterProvider, createMemoryHistory, createRouter } from "@tanstack/react-router";
import { routeTree } from "./mobile-route-tree";

// Capacitor SPA bootstrap. Unlike TanStack Start's default client entry,
// this does NOT call hydrateRoot — there is no SSR markup inside the
// Capacitor WebView shell. We mount a fresh React tree into #root and
// drive the router with an in-memory history so WebView URL schemes never
// pull in TanStack Start's SSR/hydration runtime.

const container = document.getElementById("root");
if (!container) {
  throw new Error("Capacitor entry: #root container not found in index.html");
}

document.documentElement.classList.add("dark");
document.documentElement.style.colorScheme = "dark";
document.documentElement.dataset.capacitor = "true";

const queryClient = new QueryClient();
const router = createRouter({
  routeTree,
  context: { queryClient },
  history: createMemoryHistory({ initialEntries: ["/"] }),
  scrollRestoration: false,
  defaultPreloadStaleTime: 0,
});

createRoot(container).render(<RouterProvider router={router} />);