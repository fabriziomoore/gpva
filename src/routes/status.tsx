import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, Lock, RefreshCw, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/status")({
  head: () => ({ meta: [{ title: "Status do Sistema" }] }),
  component: StatusPage,
});

const STORAGE_KEY = "gpva_status_passphrase";
const POLL_MS = 30_000;
const CALL_TIMEOUT_MS = 8_000;

interface HealthCheck {
  nome: string;
  ok: boolean;
  detalhe: string;
}

interface HealthPayload {
  score: number;
  aparelhos_ativos: number;
  limite_aparelhos: number;
  ultimo_deploy: { build: number; versao: string; em: string } | null;
  checks: HealthCheck[];
  checado_em: string;
}

// Diagnóstico só faz sentido separado do app principal: se um dia o
// próprio login/app tiver problema, essa tela não pode depender dele
// pra continuar funcionando. Por isso senha própria (guardada com hash
// no banco), sem passar pela conta admin, e não existe no build mobile
// (só é registrada no route-tree web).
function StatusPage() {
  const [passphrase, setPassphrase] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [health, setHealth] = useState<HealthPayload | null>(null);
  const [downSince, setDownSince] = useState<number | null>(null);
  const [lastLatencyMs, setLastLatencyMs] = useState<number | null>(null);
  const activePassphraseRef = useRef("");

  const fetchHealth = useCallback(async (pass: string) => {
    setChecking(true);
    const started = Date.now();
    try {
      const result = await Promise.race([
        supabase.rpc("get_system_health", { p_passphrase: pass }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("timeout")), CALL_TIMEOUT_MS),
        ),
      ]);
      const { data, error } = result as Awaited<ReturnType<typeof supabase.rpc>>;
      if (error) throw error;
      setLastLatencyMs(Date.now() - started);
      setHealth(data as unknown as HealthPayload);
      setDownSince(null);
      setAuthError(null);
      setUnlocked(true);
      activePassphraseRef.current = pass;
      localStorage.setItem(STORAGE_KEY, pass);
      return true;
    } catch (err) {
      const message = (err && typeof err === "object" && "message" in err ? String((err as { message: unknown }).message) : null) ?? "Erro desconhecido";
      if (message.includes("Senha inválida")) {
        setUnlocked(false);
        setAuthError("Senha incorreta.");
        localStorage.removeItem(STORAGE_KEY);
      } else if (unlocked) {
        // Já estava desbloqueado — isso não é senha errada, é o sistema
        // não respondendo (rede caiu, banco fora do ar, timeout etc).
        setDownSince((prev) => prev ?? Date.now());
      } else {
        setAuthError("Não foi possível verificar a senha agora. Tente de novo.");
      }
      return false;
    } finally {
      setChecking(false);
    }
  }, [unlocked]);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      setPassphrase(saved);
      fetchHealth(saved);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!unlocked) return;
    const id = setInterval(() => {
      if (activePassphraseRef.current) fetchHealth(activePassphraseRef.current);
    }, POLL_MS);
    return () => clearInterval(id);
  }, [unlocked, fetchHealth]);

  if (!unlocked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            fetchHealth(passphrase);
          }}
          className="w-full max-w-sm space-y-4 rounded-2xl border border-border bg-card p-6 shadow-lg"
        >
          <div className="flex items-center gap-2 text-foreground">
            <Lock className="size-5" />
            <h1 className="text-lg font-semibold">Status do Sistema</h1>
          </div>
          <Input
            type="password"
            placeholder="Senha"
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
            autoFocus
          />
          {authError && <p className="text-sm text-destructive">{authError}</p>}
          <Button type="submit" className="w-full" disabled={checking || !passphrase}>
            {checking ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
            Entrar
          </Button>
        </form>
      </div>
    );
  }

  const isDown = downSince !== null;
  const score = isDown ? 0 : health?.score ?? 0;
  const scoreColor = isDown || score < 70 ? "text-red-600" : score < 90 ? "text-amber-500" : "text-green-600";
  const ringColor = isDown || score < 70 ? "border-red-600" : score < 90 ? "border-amber-500" : "border-green-600";

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="mx-auto max-w-xl space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-foreground">Status do Sistema</h1>
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchHealth(activePassphraseRef.current)}
            disabled={checking}
          >
            {checking ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
          </Button>
        </div>

        {isDown && (
          <div className="flex items-center gap-3 rounded-xl border border-red-600/30 bg-red-600/10 p-4 text-red-600">
            <XCircle className="size-6 shrink-0" />
            <div>
              <p className="font-semibold">Sistema não está respondendo</p>
              <p className="text-xs opacity-80">
                Desde {new Date(downSince!).toLocaleTimeString("pt-BR")} — tentando de novo a cada 30s.
              </p>
            </div>
          </div>
        )}

        <div className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-card p-8">
          <div
            className={cn(
              "flex size-32 items-center justify-center rounded-full border-8",
              ringColor,
            )}
          >
            <span className={cn("text-4xl font-bold", scoreColor)}>{isDown ? "--" : `${score}%`}</span>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            {isDown ? "Crítico" : score >= 90 ? "Saudável" : score >= 70 ? "Atenção" : "Crítico"}
          </p>
        </div>

        {health && (
          <div className="space-y-2 rounded-2xl border border-border bg-card p-4">
            {health.checks.map((check) => (
              <div key={check.nome} className="flex items-start gap-3 border-b border-border/60 py-2 last:border-0">
                {check.ok ? (
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-green-600" />
                ) : (
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-500" />
                )}
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">{check.nome}</p>
                  <p className="text-xs text-muted-foreground">{check.detalhe}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {health?.ultimo_deploy && (
          <div className="rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground">
            Último deploy: build {health.ultimo_deploy.build} ({health.ultimo_deploy.versao}) em{" "}
            {new Date(health.ultimo_deploy.em).toLocaleString("pt-BR")}
          </div>
        )}

        <p className="text-center text-xs text-muted-foreground">
          {health && `Checado às ${new Date(health.checado_em).toLocaleTimeString("pt-BR")}`}
          {lastLatencyMs !== null && ` · resposta em ${lastLatencyMs}ms`}
          {" · atualiza sozinho a cada 30s"}
        </p>
      </div>
    </div>
  );
}
