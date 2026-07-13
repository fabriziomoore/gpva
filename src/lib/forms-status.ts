// Persiste (por serviço) se a resposta ao Google Forms foi enviada com sucesso
// ou falhou. Usado para mostrar um rótulo colorido ao lado do serviço no histórico.
// Quando falha, também guardamos o payload da negociação para permitir reabrir
// o Forms pré-preenchido ao tocar no rótulo "Forms não enviado".

import { useSyncExternalStore } from "react";
import type { NegotiationSubmission } from "@/lib/google-form";

export type FormsStatus = "sent" | "failed";

const KEY = "gpva-forms-status";
const PAYLOAD_KEY = "gpva-forms-failed-payload";
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

// Payload é serializado com a data como ISO string.
type StoredPayload = Omit<NegotiationSubmission, "date"> & { date: string };

function readPayloads(): Record<string, StoredPayload> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(PAYLOAD_KEY);
    return raw ? (JSON.parse(raw) as Record<string, StoredPayload>) : {};
  } catch {
    return {};
  }
}

function writePayloads(v: Record<string, StoredPayload>): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PAYLOAD_KEY, JSON.stringify(v));
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

export function saveFailedPayload(
  serviceId: string,
  payload: NegotiationSubmission,
): void {
  const all = readPayloads();
  all[serviceId] = { ...payload, date: payload.date.toISOString() };
  writePayloads(all);
}

export function getFailedPayload(serviceId: string): NegotiationSubmission | null {
  const stored = readPayloads()[serviceId];
  if (!stored) return null;
  return { ...stored, date: new Date(stored.date) };
}

export function clearFormsStatus(serviceId: string): void {
  const all = read();
  if (serviceId in all) {
    delete all[serviceId];
    write(all);
  }
  const payloads = readPayloads();
  if (serviceId in payloads) {
    delete payloads[serviceId];
    writePayloads(payloads);
  }
  for (const l of listeners) l();
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