import type { CheckResult } from "./types";

// Roda no browser (nunca no SSR). Faz verificações do runtime cliente.
export async function runClientChecks(): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  // Conectividade
  results.push({
    id: "cli.online", category: "cliente", title: "Conexão de rede",
    severity: navigator.onLine ? "info" : "warning",
    message: navigator.onLine ? "online" : "offline",
  });

  // APIs esperadas. `share` só existe em navegadores mobile/PWA — ausente no desktop
  // não é problema real, então rebaixamos para info.
  const optionalApis = new Set(["share"]);
  const apis: [string, boolean][] = [
    ["clipboard", !!navigator.clipboard?.writeText],
    ["share", !!(navigator as Navigator & { share?: unknown }).share],
    ["canvas", !!document.createElement("canvas").getContext],
    ["localStorage", (() => { try { return !!window.localStorage; } catch { return false; } })()],
  ];
  for (const [name, ok] of apis) {
    const severity = ok ? "info" : optionalApis.has(name) ? "info" : "warning";
    results.push({
      id: `cli.api.${name}`, category: "cliente", title: `API do navegador: ${name}`,
      severity,
      message: ok ? "disponível" : optionalApis.has(name) ? "indisponível (apenas mobile/PWA)" : "indisponível",
    });
  }

  // LocalStorage do app
  try {
    const raw = window.localStorage.getItem("gpva-forms-status");
    const size = raw ? new Blob([raw]).size : 0;
    let entries = 0;
    try { entries = raw ? Object.keys(JSON.parse(raw)).length : 0; } catch { /* ignore */ }
    results.push({
      id: "cli.storage.forms_status", category: "cliente",
      title: "Cache local de status do Forms",
      severity: size > 500_000 ? "warning" : "info",
      message: `${entries} registros — ${(size / 1024).toFixed(1)} KB`,
      evidence: { entries, size_bytes: size },
      suggestion: size > 500_000 ? "Limpar entradas antigas do gpva-forms-status." : undefined,
    });
  } catch (e) {
    results.push({ id: "cli.storage.forms_status", category: "cliente", title: "Cache local", severity: "warning", message: (e as Error).message });
  }

  // Performance de bootstrap (Navigation Timing)
  try {
    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    if (nav) {
      const ttfb = Math.round(nav.responseStart);
      const dcl = Math.round(nav.domContentLoadedEventEnd);
      const load = Math.round(nav.loadEventEnd);
      results.push({
        id: "cli.perf.navigation", category: "performance",
        title: "Tempo de bootstrap da página",
        severity: load > 5000 ? "warning" : "info",
        message: `TTFB ${ttfb}ms · DCL ${dcl}ms · Load ${load}ms`,
        evidence: { ttfb_ms: ttfb, dcl_ms: dcl, load_ms: load },
        suggestion: load > 5000 ? "Load acima de 5s. Investigar bundle e chunks." : undefined,
      });
    }
    const fcp = performance.getEntriesByName("first-contentful-paint")[0];
    if (fcp) {
      const ms = Math.round(fcp.startTime);
      results.push({
        id: "cli.perf.fcp", category: "performance",
        title: "First Contentful Paint",
        severity: ms > 2500 ? "warning" : "info",
        message: `${ms}ms`, evidence: { fcp_ms: ms },
      });
    }
  } catch (e) {
    results.push({ id: "cli.perf", category: "performance", title: "Performance timings", severity: "warning", message: (e as Error).message });
  }

  // Memória (Chrome-only)
  const perfMem = (performance as Performance & { memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number } }).memory;
  if (perfMem) {
    const usedMb = Math.round(perfMem.usedJSHeapSize / 1024 / 1024);
    const limitMb = Math.round(perfMem.jsHeapSizeLimit / 1024 / 1024);
    const pct = Math.round((perfMem.usedJSHeapSize / perfMem.jsHeapSizeLimit) * 100);
    results.push({
      id: "cli.perf.memory", category: "performance",
      title: "Uso de memória JS",
      severity: pct > 70 ? "warning" : "info",
      message: `${usedMb}MB / ${limitMb}MB (${pct}%)`,
      evidence: { used_mb: usedMb, limit_mb: limitMb, pct },
    });
  }

  // Fila offline (IndexedDB / Dexie)
  try {
    const { getLocalDB } = await import("@/lib/db/local-db");
    const db = getLocalDB();
    const [outbox, svcPending, shiftsPending, svcErr, shiftsErr] = await Promise.all([
      db.outbox.count(),
      db.services.where("sync_state").anyOf(["pending", "error"]).count(),
      db.shifts.where("sync_state").anyOf(["pending", "error"]).count(),
      db.services.where("sync_state").equals("error").count(),
      db.shifts.where("sync_state").equals("error").count(),
    ]);
    const pending = outbox + svcPending + shiftsPending;
    results.push({
      id: "cli.sync.pending", category: "cliente",
      title: "Fila offline de sincronização",
      severity: pending === 0 ? "info" : pending < 20 ? "warning" : "error",
      message: pending === 0
        ? "Vazia"
        : `${pending} pendentes (outbox ${outbox}, serviços ${svcPending}, expedientes ${shiftsPending})`,
      evidence: { outbox, services_pending: svcPending, shifts_pending: shiftsPending },
      suggestion: pending > 0 ? "Conectar à internet e reabrir o app para forçar sync." : undefined,
    });
    if (svcErr + shiftsErr > 0) {
      results.push({
        id: "cli.sync.errors", category: "cliente",
        title: "Registros com erro de sync",
        severity: "error",
        message: `${svcErr + shiftsErr} registros com sync_state=error`,
        evidence: { services: svcErr, shifts: shiftsErr },
      });
    }
    // Outbox antiga (>24h)
    const outboxRows = await db.outbox.limit(500).toArray();
    const now = Date.now();
    const stuck = outboxRows.filter((r) => now - new Date(r.created_at).getTime() > 24 * 60 * 60 * 1000).length;
    if (stuck > 0) {
      results.push({
        id: "cli.sync.stuck", category: "cliente",
        title: "Outbox travada",
        severity: "warning",
        message: `${stuck} itens há mais de 24h na fila`,
        evidence: { count: stuck },
      });
    }
  } catch (e) {
    results.push({ id: "cli.sync", category: "cliente", title: "Fila offline", severity: "warning", message: (e as Error).message });
  }

  return results;
}