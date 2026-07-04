// Mobile shim for @tanstack/react-start. The Capacitor SPA has no server
// runtime, so server-function helpers are replaced with pass-throughs.
// Mobile-safe equivalents live alongside their consumers (e.g.
// src/lib/leader.functions.mobile.ts), which the mobile Vite config aliases
// over the web modules.

export function useServerFn<T extends (...args: any[]) => any>(fn: T): T {
  return fn;
}

// Chainable builder that mirrors createServerFn().inputValidator().handler()
// without executing anything at module load. Errors are deferred until the
// resulting server function is actually invoked at runtime — which should
// never happen on mobile because those code paths are aliased to *.mobile.ts
// equivalents. This keeps modules that define server functions importable
// without crashing the app bundle on boot.
export function createServerFn(_opts?: unknown): any {
  const invoke = () => {
    throw new Error("Server functions are not available in the mobile build");
  };
  const builder: any = {
    inputValidator: () => builder,
    middleware: () => builder,
    handler: () => invoke,
  };
  return builder;
}

export function createMiddleware(_opts?: unknown): any {
  const builder: any = {
    server: () => builder,
    client: () => builder,
    middleware: () => builder,
    validator: () => builder,
  };
  return builder;
}

export function createStart(_factory?: unknown): any {
  return { startInstance: {} };
}