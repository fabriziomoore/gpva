// Persiste (por expediente, neste dispositivo) se a equipe já confirmou o
// almoço. Enquanto o expediente está aberto, o "Tempo M. O.S" só desconta a
// 1h de almoço depois da confirmação; ao finalizar, o relatório sempre
// desconta (se o almoço não foi identificado durante o dia, aplica mesmo assim).
//
// `dismissed` guarda as O.S. em que a pergunta já foi respondida com "Não",
// pra não repetir a pergunta sobre o mesmo intervalo.

import { useSyncExternalStore } from "react";

export type LunchStatus = { taken: boolean; dismissed: string[] };

const KEY = "gpva-lunch-status";
const EMPTY: LunchStatus = { taken: false, dismissed: [] };
const listeners = new Set<() => void>();

function read(): Record<string, LunchStatus> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Record<string, LunchStatus>) : {};
  } catch {
    return {};
  }
}

function write(v: Record<string, LunchStatus>): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(v));
  } catch {
    /* ignore */
  }
  // Invalida o cache do snapshot e avisa os componentes inscritos.
  cacheRaw = null;
  for (const l of listeners) l();
}

export function setLunchTaken(shiftId: string): void {
  const all = read();
  all[shiftId] = { ...(all[shiftId] ?? EMPTY), taken: true };
  write(all);
}

export function dismissLunchPrompt(shiftId: string, serviceId: string): void {
  const all = read();
  const cur = all[shiftId] ?? EMPTY;
  all[shiftId] = { ...cur, dismissed: [...cur.dismissed, serviceId] };
  write(all);
}

// useSyncExternalStore exige snapshot estável entre renders — reaproveita o
// mesmo objeto enquanto o conteúdo salvo não muda.
let cacheRaw: string | null = null;
let cacheValue: Record<string, LunchStatus> = {};

function snapshot(): Record<string, LunchStatus> {
  let raw = "";
  if (typeof window !== "undefined") {
    try {
      raw = window.localStorage.getItem(KEY) ?? "";
    } catch {
      raw = "";
    }
  }
  if (raw !== cacheRaw) {
    cacheRaw = raw;
    cacheValue = read();
  }
  return cacheValue;
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function useLunchStatus(shiftId: string | null | undefined): LunchStatus {
  const all = useSyncExternalStore(subscribe, snapshot, () => cacheValue);
  return (shiftId && all[shiftId]) || EMPTY;
}
