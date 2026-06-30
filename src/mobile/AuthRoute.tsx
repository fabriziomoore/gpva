import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { signInTeam } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import gpvaLogo from "@/assets/gpva-logo-wide.png";

export const Route = createFileRoute("/auth/mobile")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (data.session) throw redirect({ to: "/" });
  },
  component: MobileAuthPage,
});

function MobileAuthPage() {
  const navigate = useNavigate();
  const teamRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const team = teamRef.current?.value.trim() ?? "";
    const password = passwordRef.current?.value ?? "";

    if (!team || password.length < 6) {
      setMessage("Preencha equipe e senha.");
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      await signInTeam(team, password);
      navigate({ to: "/" });
    } catch {
      setMessage("Equipe ou senha incorretas.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={styles.page}>
      <div style={styles.logoBand}>
        <img
          src={gpvaLogo}
          alt="GPVA — Gestão de Produtividade e Variável Autônoma"
          style={styles.logo}
        />
      </div>

      <form onSubmit={onSubmit} style={styles.form}>
        <label htmlFor="mobile-team" style={styles.label}>Equipe</label>
        <input
          id="mobile-team"
          ref={teamRef}
          type="text"
          enterKeyHint="next"
          spellCheck={false}
          style={styles.input}
        />

        <label htmlFor="mobile-password" style={styles.label}>Senha</label>
        <input
          id="mobile-password"
          ref={passwordRef}
          type="password"
          enterKeyHint="done"
          style={styles.input}
        />

        {message ? <p style={styles.message}>{message}</p> : null}

        <button type="submit" disabled={loading} style={styles.button}>
          {loading ? "Entrando..." : "Entrar"}
        </button>
      </form>

      <p style={styles.footer}>CRIADO E DESENVOLVIDO POR FABRÍZIO MOORE</p>
    </main>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    width: "100%",
    margin: 0,
    padding: "40px 16px 28px",
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    background: "#1b1f27",
    color: "#f8fafc",
    fontFamily: "Arial, sans-serif",
  },
  logoBand: {
    width: "calc(100% + 32px)",
    margin: "0 -16px 32px",
    background: "#000",
  },
  logo: {
    display: "block",
    width: "100%",
    height: "auto",
  },
  form: {
    width: "100%",
    maxWidth: 360,
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  label: {
    fontSize: 14,
    fontWeight: 700,
    marginTop: 4,
  },
  input: {
    width: "100%",
    height: 48,
    boxSizing: "border-box",
    borderRadius: 6,
    border: "1px solid #4b5563",
    background: "#111827",
    color: "#f8fafc",
    padding: "0 12px",
    fontSize: 16,
    outline: "none",
    WebkitUserSelect: "text",
    userSelect: "text",
    touchAction: "manipulation",
  },
  button: {
    width: "100%",
    height: 48,
    marginTop: 8,
    border: 0,
    borderRadius: 6,
    background: "#d6a43a",
    color: "#171717",
    fontSize: 16,
    fontWeight: 800,
  },
  message: {
    margin: "4px 0 0",
    color: "#fca5a5",
    fontSize: 13,
  },
  footer: {
    width: "100%",
    margin: "28px 0 0",
    color: "rgba(248, 250, 252, 0.55)",
    fontSize: 10,
    letterSpacing: "0.14em",
    textAlign: "center",
  },
} satisfies Record<string, React.CSSProperties>;