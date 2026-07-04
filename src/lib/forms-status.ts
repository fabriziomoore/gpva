// Persiste (por serviço) se a resposta ao Google Forms foi enviada com sucesso
// ou falhou. Usado para mostrar um rótulo colorido ao lado do serviço no histórico.

import { useSyncExternalStore } from "react";

export type FormsStatus = "sent" | "failed";

const KEY = "gpva-forms-status";
const listeners = new Set<() => void>();

function read(): Record<string, FormsStatus> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Record<string, FormsStatus>) : {};
  } catch {
    return {};
  }
}

function write(v: Record<string, FormsStatus>): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(v));
  } catch {
    /* ignore */
  }
}

export function setFormsStatus(serviceId: string, status: FormsStatus): void {
  const all = read();
  all[serviceId] = status;
  write(all);
  for (const l of listeners) l();
}

export function getFormsStatus(serviceId: string): FormsStatus | null {
  return read()[serviceId] ?? null;
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function useFormsStatus(serviceId: string): FormsStatus | null {
  return useSyncExternalStore(
    subscribe,
    () => read()[serviceId] ?? null,
    () => null,
  );
}