import { useState } from "react";
import { signInTeam } from "@/lib/auth";
import gpvaLogo from "@/assets/gpva-logo-wide.png";

type LoginOnlyProps = {
  onSignedIn: () => void;
};

export function LoginOnly({ onSignedIn }: LoginOnlyProps) {
  const [team, setTeam] = useState("");
  const [password, setPassword] = useState("");
  const [activeField, setActiveField] = useState<"team" | "password">("team");
  const [upperCase, setUpperCase] = useState(true);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  function updateActiveValue(next: string | ((current: string) => string)) {
    if (activeField === "team") {
      setTeam((current) => typeof next === "function" ? next(current).slice(0, 40) : next.slice(0, 40));
      return;
    }

    setPassword((current) => typeof next === "function" ? next(current).slice(0, 64) : next.slice(0, 64));
  }

  function addKey(key: string) {
    setMessage("");
    updateActiveValue((current) => `${current}${key}`);
  }

  function backspace() {
    setMessage("");
    updateActiveValue((current) => current.slice(0, -1));
  }

  function clearActive() {
    setMessage("");
    updateActiveValue("");
  }

  async function submitLogin() {
    const normalizedTeam = team.trim();

    if (!normalizedTeam || password.length < 6) {
      setMessage("Preencha equipe e senha.");
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      await signInTeam(normalizedTeam, password);
      onSignedIn();
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

      <section style={styles.form}>
        <label style={styles.label}>Equipe</label>
        <button
          type="button"
          onClick={() => setActiveField("team")}
          style={{ ...styles.fakeInput, ...(activeField === "team" ? styles.fakeInputActive : undefined) }}
        >
          {team || <span style={styles.placeholder}>Toque aqui e use o teclado abaixo</span>}
        </button>

        <label style={styles.label}>Senha</label>
        <button
          type="button"
          onClick={() => setActiveField("password")}
          style={{ ...styles.fakeInput, ...(activeField === "password" ? styles.fakeInputActive : undefined) }}
        >
          {password ? "•".repeat(password.length) : <span style={styles.placeholder}>Senha da equipe</span>}
        </button>

        {message ? <p style={styles.message}>{message}</p> : null}

        <button type="button" onClick={submitLogin} disabled={loading} style={styles.button}>
          {loading ? "Entrando..." : "Entrar"}
        </button>
      </section>

      <VirtualKeyboard
        upperCase={upperCase}
        activeField={activeField}
        disabled={loading}
        onKey={addKey}
        onBackspace={backspace}
        onClear={clearActive}
        onToggleCase={() => setUpperCase((current) => !current)}
        onSpace={() => addKey(" ")}
        onConfirm={() => {
          if (activeField === "team") {
            setActiveField("password");
          } else {
            void submitLogin();
          }
        }}
      />

      <p style={styles.footer}>CRIADO E DESENVOLVIDO POR FABRÍZIO MOORE</p>
    </main>
  );
}

type VirtualKeyboardProps = {
  upperCase: boolean;
  activeField: "team" | "password";
  disabled: boolean;
  onKey: (key: string) => void;
  onBackspace: () => void;
  onClear: () => void;
  onToggleCase: () => void;
  onSpace: () => void;
  onConfirm: () => void;
};

const numberRow = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"];
const letterRows = [
  ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"],
  ["A", "S", "D", "F", "G", "H", "J", "K", "L"],
  ["Z", "X", "C", "V", "B", "N", "M"],
];

function VirtualKeyboard({
  upperCase,
  activeField,
  disabled,
  onKey,
  onBackspace,
  onClear,
  onToggleCase,
  onSpace,
  onConfirm,
}: VirtualKeyboardProps) {
  return (
    <section style={styles.keyboard} aria-label="Teclado seguro GPVA">
      <div style={styles.keyboardHint}>Teclado interno para evitar travamento do Android</div>

      <div style={styles.keyRow}>
        {numberRow.map((key) => (
          <KeyboardButton key={key} disabled={disabled} onPress={() => onKey(key)}>{key}</KeyboardButton>
        ))}
      </div>

      {letterRows.map((row, index) => (
        <div key={index} style={styles.keyRow}>
          {row.map((key) => {
            const value = upperCase ? key : key.toLowerCase();
            return (
              <KeyboardButton key={key} disabled={disabled} onPress={() => onKey(value)}>
                {value}
              </KeyboardButton>
            );
          })}
        </div>
      ))}

      <div style={styles.actionRow}>
        <KeyboardButton wide disabled={disabled} onPress={onToggleCase}>{upperCase ? "ABC" : "abc"}</KeyboardButton>
        <KeyboardButton wide disabled={disabled} onPress={onSpace}>Espaço</KeyboardButton>
        <KeyboardButton wide disabled={disabled} onPress={onBackspace}>⌫</KeyboardButton>
      </div>

      <div style={styles.actionRow}>
        <KeyboardButton wide disabled={disabled} onPress={onClear}>Limpar</KeyboardButton>
        <KeyboardButton wide disabled={disabled} onPress={onConfirm}>{activeField === "team" ? "Senha" : "OK"}</KeyboardButton>
      </div>
    </section>
  );
}

type KeyboardButtonProps = {
  children: React.ReactNode;
  disabled?: boolean;
  wide?: boolean;
  onPress: () => void;
};

function KeyboardButton({ children, disabled, wide, onPress }: KeyboardButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      onPointerDown={(event) => event.preventDefault()}
      onClick={onPress}
      style={{ ...styles.key, ...(wide ? styles.wideKey : undefined) }}
    >
      {children}
    </button>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    width: "100%",
    margin: 0,
    padding: "24px 12px 20px",
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "flex-start",
    background: "#1b1f27",
    color: "#f8fafc",
    fontFamily: "Arial, sans-serif",
  },
  logoBand: {
    width: "calc(100% + 24px)",
    margin: "0 -12px 20px",
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
  fakeInput: {
    width: "100%",
    minHeight: 48,
    boxSizing: "border-box",
    borderRadius: 6,
    border: "1px solid #4b5563",
    background: "#111827",
    color: "#f8fafc",
    padding: "0 12px",
    fontSize: 16,
    outline: "none",
    textAlign: "left",
    overflowWrap: "anywhere",
    WebkitUserSelect: "none",
    userSelect: "none",
    touchAction: "manipulation",
  },
  fakeInputActive: {
    border: "2px solid #d6a43a",
    boxShadow: "0 0 0 3px rgba(214, 164, 58, 0.18)",
  },
  placeholder: {
    color: "rgba(248, 250, 252, 0.45)",
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
  keyboard: {
    width: "100%",
    maxWidth: 390,
    marginTop: 18,
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  keyboardHint: {
    marginBottom: 2,
    textAlign: "center",
    color: "rgba(248, 250, 252, 0.55)",
    fontSize: 11,
  },
  keyRow: {
    display: "flex",
    justifyContent: "center",
    gap: 4,
  },
  actionRow: {
    display: "flex",
    gap: 6,
  },
  key: {
    flex: "1 1 0",
    minWidth: 0,
    height: 38,
    border: "1px solid #4b5563",
    borderRadius: 6,
    background: "#2b3240",
    color: "#f8fafc",
    fontSize: 14,
    fontWeight: 800,
    touchAction: "manipulation",
    WebkitTapHighlightColor: "transparent",
  },
  wideKey: {
    height: 40,
    background: "#374151",
  },
  footer: {
    width: "100%",
    margin: "20px 0 0",
    color: "rgba(248, 250, 252, 0.55)",
    fontSize: 10,
    letterSpacing: "0.14em",
    textAlign: "center",
  },
} satisfies Record<string, React.CSSProperties>;