// Guarded service worker registration for GPVA.
// Never registers in dev / iframe / when `?sw=off` is present. Uses the
// plugin-generated /sw.js.

const SW_URL = "/sw.js";

function isRefusedContext(): { refused: true; reason: string } | { refused: false } {
  if (typeof window === "undefined") return { refused: true, reason: "ssr" };
  if (!import.meta.env.PROD) return { refused: true, reason: "dev" };
  try {
    if (window.self !== window.top) return { refused: true, reason: "iframe" };
  } catch {
    return { refused: true, reason: "iframe" };
  }
  const params = new URLSearchParams(window.location.search);
  if (params.get("sw") === "off") return { refused: true, reason: "kill-switch" };
  return { refused: false };
}

async function unregisterOwnWorkers(): Promise<void> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.allSettled(
      regs
        .filter((r) => {
          const url = r.active?.scriptURL ?? r.installing?.scriptURL ?? r.waiting?.scriptURL ?? "";
          return url.endsWith(SW_URL);
        })
        .map((r) => r.unregister()),
    );
  } catch {
    /* ignore */
  }
}

export function registerPWA(): void {
  const check = isRefusedContext();
  if (check.refused) {
    void unregisterOwnWorkers();
    return;
  }
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register(SW_URL, { scope: "/" })
      .catch((err) => console.warn("[pwa] register failed", err));
  });
}