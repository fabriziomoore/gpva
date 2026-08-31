// TODO: wire up a real error tracker (e.g. Sentry) here.
export function reportLovableError(error: unknown, context: Record<string, unknown> = {}) {
  if (typeof window === "undefined") return;
  console.error(error, {
    source: "react_error_boundary",
    route: window.location.pathname,
    ...context,
  });
}
