// "Lembrar acesso" — armazena equipe + hash PBKDF2 da senha localmente para
// permitir login offline. Funciona em Web (localStorage) e Capacitor
// (localStorage do WebView + espelho em Preferences para sobreviver à
// limpeza de cache).

const KEY = "gpva.remember.v1";
const ITER = 150_000;

export type RememberRecord = {
  team: string;
  salt: string; // base64
  hash: string; // base64
  iterations: number;
};

function b64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

function fromB64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<ArrayBuffer> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits"],
  );
  return crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: salt as BufferSource, hash: "SHA-256", iterations },
    key,
    256,
  );
}

function isNative(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } };
  return !!w.Capacitor?.isNativePlatform?.();
}

async function prefs() {
  try {
    const { Preferences } = await import("@capacitor/preferences");
    return Preferences;
  } catch {
    return null;
  }
}

export async function saveRemembered(team: string, password: string): Promise<void> {
  if (typeof window === "undefined") return;
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hashBuf = await derive(password, salt, ITER);
  const rec: RememberRecord = {
    team: team.trim(),
    salt: b64(salt.buffer),
    hash: b64(hashBuf),
    iterations: ITER,
  };
  const json = JSON.stringify(rec);
  try { localStorage.setItem(KEY, json); } catch { /* ignore */ }
  if (isNative()) {
    const p = await prefs();
    if (p) await p.set({ key: KEY, value: json });
  }
}

export async function getRemembered(): Promise<RememberRecord | null> {
  if (typeof window === "undefined") return null;
  let raw: string | null = null;
  try { raw = localStorage.getItem(KEY); } catch { /* ignore */ }
  if (!raw && isNative()) {
    const p = await prefs();
    if (p) {
      const { value } = await p.get({ key: KEY });
      raw = value ?? null;
      if (raw) try { localStorage.setItem(KEY, raw); } catch { /* ignore */ }
    }
  }
  if (!raw) return null;
  try { return JSON.parse(raw) as RememberRecord; } catch { return null; }
}

export async function clearRemembered(): Promise<void> {
  if (typeof window === "undefined") return;
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
  if (isNative()) {
    const p = await prefs();
    if (p) await p.remove({ key: KEY });
  }
}

export async function verifyRemembered(team: string, password: string): Promise<boolean> {
  const rec = await getRemembered();
  if (!rec) return false;
  if (rec.team.toLowerCase() !== team.trim().toLowerCase()) return false;
  const salt = fromB64(rec.salt);
  const hashBuf = await derive(password, salt, rec.iterations);
  const a = new Uint8Array(hashBuf);
  const b = fromB64(rec.hash);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}