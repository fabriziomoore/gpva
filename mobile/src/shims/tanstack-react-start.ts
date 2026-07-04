// Mobile shim for @tanstack/react-start. The Capacitor SPA has no server
// runtime, so server-function helpers are replaced with pass-throughs.
// Mobile-safe equivalents live alongside their consumers (e.g.
// src/lib/leader.functions.mobile.ts), which the mobile Vite config aliases
// over the web modules.

export function useServerFn<T extends (...args: any[]) => any>(fn: T): T {
  return fn;
}

export function createServerFn(): never {
  throw new Error("createServerFn is not available in the mobile build");
}

export function createMiddleware(): never {
  throw new Error("createMiddleware is not available in the mobile build");
}

export function createStart(): never {
  throw new Error("createStart is not available in the mobile build");
}