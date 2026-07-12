import { useEffect, useState } from "react";
import { useNetDiag } from "@/lib/sync/diagnostics";
import { useSyncStore } from "@/lib/sync/store";
import { getNetworkStatus, refreshNetworkStatus } from "@/lib/sync/network";

/**
 * Painel temporário de diagnóstico de conectividade. Fica escondido atrás
 * de um pequeno botão flutuante no canto inferior esquerdo. Serve para
 * inspecionar, no APK real, todos os contadores e o histórico de eventos
 * do NetworkService sem depender do Logcat.
 *
 * Remover após concluída a validação.
 */
export function NetworkDiagPanel() {
  const [open, setOpen] = useState(false);
  const [, force] = useState(0);
  const diag = useNetDiag();
  const online = useSyncStore((s) => s.online);
  const backendReachable = useSyncStore((s) => s.backendReachable);

  // Tick a cada 500ms para atualizar "há X segundos"
  useEffect(() => {
    const t = setInterval(() => force((n) => n + 1), 500);
    return () => clearInterval(t);
  }, []);

  const ns = getNetworkStatus();
  const syncIndicatorState = !online
    ? "OFFLINE"
    : !backendReachable
      ? "SERVIDOR INDISPONÍVEL"
      : "ONLINE";
  const syncBadgeVisible = !online || !backendReachable;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Diagnóstico de rede"
        style={{
          position: "fixed",
          left: 8,
          bottom: "calc(env(safe-area-inset-bottom, 0px) + 8px)",
          zIndex: 99999,
          height: 32,
          width: 32,
          borderRadius: 999,
          border: "1px solid rgba(255,255,255,0.2)",
          background: online && backendReachable ? "#16a34a" : online ? "#f59e0b" : "#dc2626",
          color: "#fff",
          fontSize: 12,
          fontWeight: 700,
          lineHeight: "32px",
          textAlign: "center",
          padding: 0,
        }}
      >
        {online ? (backendReachable ? "✓" : "!") : "✕"}
      </button>

      {open && (
        <div
          style={{
            position: "fixed",
            left: 8,
            right: 8,
            bottom: "calc(env(safe-area-inset-bottom, 0px) + 48px)",
            zIndex: 99999,
            maxHeight: "70vh",
            overflow: "auto",
            background: "rgba(15,17,22,0.98)",
            color: "#e5e7eb",
            border: "1px solid rgba(255,255,255,0.15)",
            borderRadius: 12,
            padding: 12,
            fontFamily:
              "ui-monospace,SFMono-Regular,Menlo,Consolas,monospace",
            fontSize: 11,
            lineHeight: 1.4,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
            <strong>DIAGNÓSTICO DE CONECTIVIDADE</strong>
            <button
              type="button"
              onClick={() => void refreshNetworkStatus()}
              style={{
                background: "#1d4ed8",
                color: "#fff",
                border: 0,
                borderRadius: 6,
                padding: "2px 8px",
                fontSize: 11,
              }}
            >
              refresh
            </button>
          </div>

          <Section title="Resumo">
            <Row
              k="Plugin carregado"
              v={diag.pluginLoaded == null ? "…" : diag.pluginLoaded ? "✅ SIM" : "❌ NÃO"}
            />
            <Row
              k="Ambiente nativo"
              v={diag.isNative == null ? "…" : diag.isNative ? "SIM (Capacitor)" : "NÃO (Web)"}
            />
            <Row
              k="Network.getStatus()"
              v={`connected: ${diag.lastNativeConnected ?? "—"} · type: ${
                diag.lastNativeConnectionType ?? "—"
              }`}
            />
            <Row
              k="Último evento"
              v={
                diag.lastEventKind
                  ? `${diag.lastNativeConnected ? "ONLINE" : "OFFLINE"} (${diag.lastEventKind})`
                  : "—"
              }
            />
            <Row k="Horário" v={fmtTime(diag.lastEventAt)} />
            <Row k="Listener registrado" v={String(diag.listenersRegistered)} />
            <Row k="Store.online" v={String(online)} />
            <Row k="Store.backendReachable" v={String(backendReachable)} />
            <Row k="SyncIndicator" v={syncIndicatorState} />
            <Row k="SyncBadge" v={syncBadgeVisible ? "VISÍVEL" : "OCULTO"} />
            <Row
              k="Último ping"
              v={
                diag.lastPingAt == null
                  ? "—"
                  : `${diag.lastPingOk ? "OK" : "FALHOU"} · ${diag.lastPingDurationMs ?? "?"} ms`
              }
            />
            <Row k="Ping em" v={fmtTime(diag.lastPingAt)} />
          </Section>

          <Section title="Estado bruto (Capacitor)">
            <Row k="Network.getStatus.connected" v={String(diag.lastNativeConnected)} />
            <Row k="Network.getStatus.connectionType" v={String(diag.lastNativeConnectionType)} />
            <Row k="Último getStatus()" v={fmt(diag.lastGetStatusAt)} />
          </Section>

          <Section title="Store">
            <Row k="online" v={String(online)} />
            <Row k="backendReachable" v={String(backendReachable)} />
            <Row k="ns.deviceOnline" v={String(ns.deviceOnline)} />
            <Row k="ns.backendReachable" v={String(ns.backendReachable)} />
          </Section>

          <Section title="Contadores">
            <Row k="initNetwork() chamadas" v={String(diag.initCalls)} />
            <Row k="getStatus() chamadas" v={String(diag.getStatusCalls)} />
            <Row k="addListener() chamadas" v={String(diag.addListenerCalls)} />
            <Row k="listeners registrados" v={String(diag.listenersRegistered)} />
            <Row k="eventos networkStatusChange" v={String(diag.networkStatusChangeEvents)} />
            <Row k="pings executados" v={String(diag.pingCount)} />
            <Row k="store.setOnline calls" v={String(diag.storeSetOnlineCalls)} />
            <Row k="store.setBackendReachable calls" v={String(diag.storeSetBackendReachableCalls)} />
            <Row k="SyncIndicator renders" v={String(diag.syncIndicatorRenders)} />
            <Row k="SyncBadge renders" v={String(diag.syncBadgeRenders)} />
          </Section>

          <Section title="Último evento">
            <Row k="kind" v={diag.lastEventKind ?? "—"} />
            <Row k="quando" v={fmt(diag.lastEventAt)} />
            <Row
              k="detalhe"
              v={
                diag.lastEventDetail == null
                  ? "—"
                  : safeJson(diag.lastEventDetail)
              }
            />
          </Section>

          <Section title={`Histórico (${diag.events.length})`}>
            <div style={{ maxHeight: 180, overflow: "auto" }}>
              {diag.events.map((e, i) => (
                <div
                  key={i}
                  style={{
                    borderBottom: "1px solid rgba(255,255,255,0.08)",
                    padding: "3px 0",
                  }}
                >
                  <div style={{ color: "#93c5fd" }}>
                    {new Date(e.ts).toISOString().split("T")[1]?.replace("Z", "")} · {e.source}:{e.kind}
                  </div>
                  {e.detail != null && (
                    <div style={{ color: "#9ca3af", wordBreak: "break-all" }}>
                      {safeJson(e.detail)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Section>
        </div>
      )}
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ color: "#a3e635", marginBottom: 4, fontWeight: 700 }}>{title}</div>
      {children}
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
      <span style={{ color: "#9ca3af" }}>{k}</span>
      <span style={{ color: "#f9fafb", textAlign: "right", wordBreak: "break-all" }}>{v}</span>
    </div>
  );
}

function fmt(ts: number | null): string {
  if (!ts) return "—";
  const diff = Math.round((Date.now() - ts) / 1000);
  return `${new Date(ts).toLocaleTimeString("pt-BR")} (há ${diff}s)`;
}

function fmtTime(ts: number | null): string {
  if (!ts) return "—";
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  const ms = String(d.getMilliseconds()).padStart(3, "0");
  return `${hh}:${mm}:${ss}.${ms}`;
}

function safeJson(v: unknown): string {
  try {
    return typeof v === "string" ? v : JSON.stringify(v);
  } catch {
    return String(v);
  }
}