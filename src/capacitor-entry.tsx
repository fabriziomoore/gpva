import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider, createMemoryHistory } from "@tanstack/react-router";
import { getRouter } from "./router";

// Capacitor SPA bootstrap. Unlike TanStack Start's default client entry,
// this does NOT call hydrateRoot — there is no SSR markup inside the
// Capacitor WebView shell. We mount a fresh React tree into #root and
// drive the router with an in-memory history so file://-style oddities
// in the WebView never confuse history navigation.
const router = getRouter();
// Replace the default browser history with a memory history seeded at "/".
// `createRouter` already created a browser history; we swap it before mount.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(router as any).history = createMemoryHistory({ initialEntries: ["/"] });

const container = document.getElementById("root");
if (!container) {
  throw new Error("Capacitor entry: #root container not found in index.html");
}

createRoot(container).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);