import { createFileRoute, useNavigate, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { signInTeam } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  tryOfflineLogin,
  hasValidOfflineUnlock,
  getCredential,
  offlineErrorMessage,
  type OfflineLoginReason,
} from "@/lib/offline-auth";
import { readStoredAuthSession, hydrateLocalStorageFromBackup } from "@/lib/sync/session-backup";
import { toast } from "sonner";
import { Loader2, Eye, EyeOff } from "lucide-react";
import gpvaLogo from "@/assets/gpva-logo-wide.webp";

const LOGIN_TIMEOUT_MS = 8_000;

class OfflineLoginFallbackError extends Error {
  constructor() {
    super("network timeout");
    this.name = "OfflineLoginFallbackError";
  }
}

function isBrowserOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

function withLoginTimeout<T>(promise: Promise<T>): Promise<T> {
  if (typeof window === "undefined") return promise;
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      window.setTimeout(() => reject(new OfflineLoginFallbackError()), LOGIN_TIMEOUT_MS);
    }),
  ]);
}

export const Route = createFileRoute("/auth")({
  ssr: false,
  beforeLoad: async () => {
    if (typeof window !== "undefined" && window.sessionStorage.getItem("gpva.forceSignedOut") === "1") {
      return;
    }
    const localSession = readStoredAuthSession();
    if (localSession) throw redirect({ to: "/" });
    // Se já existe um unlock offline ativo, entra direto (sem passar por login).
    if (await hasValidOfflineUnlock()) throw redirect({ to: "/" });
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;
    const result = await Promise.race([
      supabase.auth.getSession(),
      new Promise<null>((resolve) => window.setTimeout(() => resolve(null), 1_200)),
    ]);
    if (result?.data.session) throw redirect({ to: "/" });
  },
  head: () => ({ meta: [{ title: "Entrar — GPVA" }] }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [team, setTeam] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState<boolean>(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const update = () => setIsOffline(navigator.onLine === false);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  // Pré-preenche o login com a equipe salva anteriormente (se houver
  // credencial local de um primeiro acesso online prévio).
  useEffect(() => {
    void getCredential().then((rec) => {
      if (rec?.team) setTeam(rec.team);
    });
  }, []);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session) {
        navigate({ to: "/" });
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [navigate]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    if (!team.trim() || password.length < 6) {
      setErrorMsg("Preencha equipe e senha (mín. 6 caracteres).");
      return;
    }
    setLoading(true);
    try {
      // Offline conhecido: pula direto para a validação local, sem
      // qualquer chamada ao Supabase.
      if (isBrowserOffline()) {
        await handleOfflineLogin();
        return;
      }
      await withLoginTimeout(signInTeam(team, password));
      sessionStorage.removeItem("gpva.forceSignedOut");
      // A credencial local já foi persistida dentro de signInTeam().
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro ao autenticar";
      const isNetwork =
        isBrowserOffline() ||
        err instanceof OfflineLoginFallbackError ||
        msg.toLowerCase().includes("failed to fetch") ||
        msg.toLowerCase().includes("network") ||
        msg.toLowerCase().includes("timeout") ||
        msg.toLowerCase().includes("load failed");
      if (isNetwork) {
        await handleOfflineLogin();
      } else if (msg.toLowerCase().includes("invalid login")) {
        setErrorMsg("Usuário ou senha incorretos.");
      } else {
        const { translateAuthError } = await import("@/lib/auth-errors");
        setErrorMsg(translateAuthError(err, "Erro ao autenticar"));
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleOfflineLogin(): Promise<void> {
    const result = await tryOfflineLogin(team, password);
    if (result.ok) {
      try { sessionStorage.removeItem("gpva.forceSignedOut"); } catch { /* ignore */ }
      // Hidrata a sessão espelhada em Preferences DIRETO no localStorage.
      // NÃO chamamos supabase.auth.setSession() aqui — offline, ele tentaria
      // refresh de token, falharia, e emitiria SIGNED_OUT, apagando o
      // sb-…-auth-token e deixando useAuthSession com userId=null (spinner
      // eterno na Home). A revalidação online acontece depois, em background.
      try { await hydrateLocalStorageFromBackup(); } catch { /* ignore */ }
      toast.success("Acesso offline autorizado");
      navigate({ to: "/" });
      return;
    }
    const reason: OfflineLoginReason = result.reason;
    const message = offlineErrorMessage(reason);
    setErrorMsg(message);
    if (reason !== "mismatch") toast.error(message);
  }

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-background py-10">
      <div className="mb-8 w-full max-w-sm px-4">
        <div className="overflow-hidden rounded-2xl bg-[oklch(0.16_0.018_250)]">
          <img src={gpvaLogo} alt="GPVA — Gestão de Produtividade e Variável Autônoma" className="block w-full h-auto" />
        </div>
      </div>
      <div className="w-full max-w-sm px-4">

        <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="team">Loguin</Label>
              <Input
                id="team"
                value={team}
                onChange={(e) => setTeam(e.target.value)}
                placeholder=""
                autoCapitalize="characters"
                autoComplete="username"
                className="h-12 text-base"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pw">Senha</Label>
              <div className="relative">
                <Input
                  id="pw"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  className="h-12 pr-12 text-base"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                  className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
                </button>
              </div>
            </div>
            {errorMsg && (
              <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {errorMsg}
              </p>
            )}
            <Button
              type="submit"
              disabled={loading}
              className={
                isOffline
                  ? "flex h-14 w-full flex-col items-center justify-center gap-0.5 bg-destructive text-base font-semibold text-white hover:bg-destructive/90"
                  : "h-12 w-full text-base font-semibold"
              }
            >
              {loading ? (
                <Loader2 className="size-5 animate-spin" />
              ) : isOffline ? (
                <>
                  <span className="leading-none">Entrar</span>
                  <span className="text-[10px] font-medium leading-none tracking-[0.18em] text-white/90">
                    (MODO OFFLINE)
                  </span>
                </>
              ) : (
                "Entrar"
              )}
            </Button>
        </form>

      </div>
      <p className="absolute inset-x-0 bottom-[calc(env(safe-area-inset-bottom,0px)+0.75rem)] whitespace-nowrap overflow-hidden text-ellipsis px-4 text-center text-[10px] uppercase tracking-[0.18em] text-foreground dark:text-muted-foreground/60">
        Criado e desenvolvido por Fabrízio Moore
      </p>
    </div>
  );
}