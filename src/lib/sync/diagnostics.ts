// GPVA — Instrumentação de conectividade.
//
// Objetivo: comprovar no APK Android, via Logcat, exatamente em qual
// etapa o fluxo de conectividade falha. Todo log usa o prefixo
// `[GPVA-NET]` para facilitar filtro (`adb logcat | grep GPVA-NET`).
//
// Também expõe um store zustand com o estado bruto do NetworkService
// para o painel visual em tempo real (`NetworkDiagPanel`).

import { create } from "zustand";

export type DiagEvent = {
  ts: number;
  source: string;
  kind: string;
  detail?: unknown;
};

interface DiagState {
  // Contadores brutos
  initCalls: number;
  getStatusCalls: number;
  addListenerCalls: number;
  listenersRegistered: number;
  networkStatusChangeEvents: number;
  storeSetOnlineCalls: number;
  storeSetBackendReachableCalls: number;
  syncIndicatorRenders: number;
  syncBadgeRenders: number;

  // Último snapshot conhecido da API do Capacitor
  lastNativeConnected: boolean | null;
  lastNativeConnectionType: string | null;
  lastGetStatusAt: number | null;
  lastEventAt: number | null;
  lastEventKind: string | null;
  lastEventDetail: unknown;

  // Histórico curto (últimos 30 eventos)
  events: DiagEvent[];

  bump: (key: keyof DiagState) => void;
  push: (evt: DiagEvent) => void;
  setNative: (v: { connected: boolean | null; connectionType: string | null }) => void;
  markGetStatus: () => void;
}

export const useNetDiag = create<DiagState>((set) => ({
  initCalls: 0,
  getStatusCalls: 0,
  addListenerCalls: 0,
  listenersRegistered: 0,
  networkStatusChangeEvents: 0,
  storeSetOnlineCalls: 0,
  storeSetBackendReachableCalls: 0,
  syncIndicatorRenders: 0,
  syncBadgeRenders: 0,
  lastNativeConnected: null,
  lastNativeConnectionType: null,
  lastGetStatusAt: null,
  lastEventAt: null,
  lastEventKind: null,
  lastEventDetail: null,
  events: [],
  bump: (key) =>
    set((s) => {
      const current = s[key];
      if (typeof current !== "number") return {};
      return { [key]: current + 1 } as Partial<DiagState>;
    }),
  push: (evt) =>
    set((s) => ({
      lastEventAt: evt.ts,
      lastEventKind: `${evt.source}:${evt.kind}`,
      lastEventDetail: evt.detail ?? null,
      events: [evt, ...s.events].slice(0, 30),
    })),
  setNative: ({ connected, connectionType }) =>
    set({ lastNativeConnected: connected, lastNativeConnectionType: connectionType }),
  markGetStatus: () =>
    set((s) => ({ getStatusCalls: s.getStatusCalls + 1, lastGetStatusAt: Date.now() })),
}));

/**
 * Log estruturado com prefixo único para filtro no Logcat.
 * Uso: `adb logcat -v time | grep GPVA-NET`
 */
export function netLog(source: string, kind: string, detail?: unknown): void {
  const ts = Date.now();
  const iso = new Date(ts).toISOString();
  try {
    // console.log é encaminhado ao Logcat pelo Chromium (tag `chromium`).
    // Mantemos payload serializável para não estourar log.
    // eslint-disable-next-line no-console
    console.log(`[GPVA-NET] ${iso} ${source}:${kind}`, detail ?? "");
  } catch {
    /* ignore */
  }
  try {
    useNetDiag.getState().push({ ts, source, kind, detail });
  } catch {
    /* ignore */
  }
}