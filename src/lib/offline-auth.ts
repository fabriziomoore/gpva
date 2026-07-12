// Autenticação offline permanente para uso em campo.
//
// Todos os dados de autenticação (credencial hasheada, timestamp do último
// login online e "unlock" para o gate de rotas) ficam EXCLUSIVAMENTE em
// Capacitor Preferences — armazenamento persistente do dispositivo que
// sobrevive a fechar o app, forçar o encerramento, reiniciar o celular e
// dias sem conexão. Nada em localStorage.
//
// Regras:
// - Primeiro acesso: obrigatório online. Após sucesso, a credencial + o
//   timestamp são gravados automaticamente (sem checkbox "lembrar").
// - Acessos seguintes: se houver credencial válida e ainda dentro da janela
//   de 30 dias, permitir login offline por validação local (PBKDF2 SHA-256)
//   sem qualquer chamada ao Supabase.
// - Logout: preserva credencial e timestamp — apenas limpa o "unlock" para
//   forçar reentrada com senha. O usuário pode logar novamente offline.
// - Expiração: 30 dias sem autenticação online invalidam o modo offline.

export const OFFLINE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 dias
const ITER = 150_000;

const CREDENTIAL_KEY = "gpva.offline.credential.v2";
const UNLOCK_KEY = "gpva.offline.unlock.v1";
const LAST_USER_ID_KEY = "gpva.offline.lastUserId.v1";

export type CredentialRecord = {
  team: string;
  salt: string; // base64
  hash: string; // base64
  iterations: number;
  lastOnlineAuthAt: number; // ms epoch
};

export type OfflineUnlock = {
  team: string;
  unlockedAt: number;
};

export type OfflineLoginResult =
  | { ok: true }
  | { ok: false; reason: "no-credential" | "expired" | "mismatch" | "corrupted" };

// ---- Storage (Capacitor Preferences apenas) --------------------------------

import { Preferences } from "@capacitor/preferences";

async function prefsGet(key: string): Promise<string | null> {
  try {
    const { value } = await Preferences.get({ key });
    return value ?? null;
  } catch {
    return null;
  }
}

async function prefsSet(key: string, value: string): Promise<void> {
  try { await Preferences.set({ key, value }); } catch { /* ignore */ }
}

async function prefsRemove(key: string): Promise<void> {
  try { await Preferences.remove({ key }); } catch { /* ignore */ }
}

// ---- Crypto helpers --------------------------------------------------------

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

function normalizeTeam(team: string): string {
  return team.trim().toLowerCase();
}

// ---- Credential API --------------------------------------------------------

export async function getCredential(): Promise<CredentialRecord | null> {
  const raw = await prefsGet(CREDENTIAL_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as CredentialRecord;
    if (!parsed?.team || !parsed?.hash || !parsed?.salt) return null;
    return parsed;
  } catch {
    // Registro corrompido — remove para não travar próximos acessos.
    await prefsRemove(CREDENTIAL_KEY);
    return null;
  }
}

/**
 * Chamada automaticamente após um login online bem-sucedido. Substitui a
 * credencial anterior (equipe/senha podem ter mudado) e atualiza o
 * timestamp da janela de 30 dias.
 */
export async function saveCredentialFromOnlineLogin(team: string, password: string): Promise<void> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hashBuf = await derive(password, salt, ITER);
  const rec: CredentialRecord = {
    team: normalizeTeam(team),
    salt: b64(salt.buffer),
    hash: b64(hashBuf),
    iterations: ITER,
    lastOnlineAuthAt: Date.now(),
  };
  await prefsSet(CREDENTIAL_KEY, JSON.stringify(rec));
}

/**
 * Renova apenas o timestamp — útil quando revalidamos a sessão com o
 * Supabase e a autenticação online é confirmada sem novo submit de senha.
 */
export async function markOnlineAuthSuccess(): Promise<void> {
  const rec = await getCredential();
  if (!rec) return;
  rec.lastOnlineAuthAt = Date.now();
  await prefsSet(CREDENTIAL_KEY, JSON.stringify(rec));
}

export async function clearCredential(): Promise<void> {
  await prefsRemove(CREDENTIAL_KEY);
}

// ---- Offline unlock (gate de rotas) ---------------------------------------

export async function getOfflineUnlock(): Promise<OfflineUnlock | null> {
  const raw = await prefsGet(UNLOCK_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw) as OfflineUnlock; } catch { return null; }
}

export async function setOfflineUnlock(team: string): Promise<void> {
  const rec: OfflineUnlock = { team: normalizeTeam(team), unlockedAt: Date.now() };
  await prefsSet(UNLOCK_KEY, JSON.stringify(rec));
}

export async function clearOfflineUnlock(): Promise<void> {
  await prefsRemove(UNLOCK_KEY);
}

// ---- Último userId autenticado (persistente entre signOut) -----------------

/**
 * Guarda o UUID do usuário autenticado com sucesso online. Sobrevive a
 * signOut/limpeza de localStorage porque fica em Capacitor Preferences.
 * Usado como fallback do userId no modo offline após logout online.
 */
export async function saveLastUserId(userId: string): Promise<void> {
  if (!userId) return;
  await prefsSet(LAST_USER_ID_KEY, userId);
}

export async function getLastUserId(): Promise<string | null> {
  const v = await prefsGet(LAST_USER_ID_KEY);
  return v && v.length > 0 ? v : null;
}

export async function clearLastUserId(): Promise<void> {
  await prefsRemove(LAST_USER_ID_KEY);
}

// ---- Login offline ---------------------------------------------------------

function isExpired(rec: CredentialRecord): boolean {
  return Date.now() - rec.lastOnlineAuthAt > OFFLINE_MAX_AGE_MS;
}

/**
 * Valida a credencial digitada contra o hash local. Nunca chama Supabase.
 * Ao autorizar, grava o unlock em Preferences para que o gate de rotas
 * (_authenticated) permita a navegação.
 */
export async function tryOfflineLogin(team: string, password: string): Promise<OfflineLoginResult> {
  let rec: CredentialRecord | null;
  try {
    rec = await getCredential();
  } catch {
    return { ok: false, reason: "corrupted" };
  }
  if (!rec) return { ok: false, reason: "no-credential" };
  if (isExpired(rec)) return { ok: false, reason: "expired" };
  if (rec.team !== normalizeTeam(team)) return { ok: false, reason: "mismatch" };

  let salt: Uint8Array;
  let expected: Uint8Array;
  try {
    salt = fromB64(rec.salt);
    expected = fromB64(rec.hash);
  } catch {
    await clearCredential();
    return { ok: false, reason: "corrupted" };
  }

  const hashBuf = await derive(password, salt, rec.iterations);
  const actual = new Uint8Array(hashBuf);
  if (actual.length !== expected.length) return { ok: false, reason: "mismatch" };
  let diff = 0;
  for (let i = 0; i < actual.length; i++) diff |= actual[i] ^ expected[i];
  if (diff !== 0) return { ok: false, reason: "mismatch" };

  await setOfflineUnlock(team);
  return { ok: true };
}

/**
 * Consulta síncrona-ish do gate: existe um unlock ativo, com credencial
 * ainda dentro da janela de 30 dias? Não chama Supabase.
 */
export async function hasValidOfflineUnlock(): Promise<boolean> {
  const [unlock, cred] = await Promise.all([getOfflineUnlock(), getCredential()]);
  if (!unlock || !cred) return false;
  if (unlock.team !== cred.team) return false;
  if (isExpired(cred)) return false;
  return true;
}

export type OfflineLoginReason = "no-credential" | "expired" | "mismatch" | "corrupted";

export function offlineErrorMessage(reason: OfflineLoginReason): string {
  switch (reason) {
    case "no-credential":
      return "É necessário realizar o primeiro acesso com conexão à Internet.";
    case "expired":
      return "Sessão offline expirada. Conecte-se à Internet e faça login novamente.";
    case "mismatch":
      return "Usuário ou senha incorretos.";
    case "corrupted":
      return "Credencial local inválida. Faça login com Internet novamente.";
    default:
      return "Não foi possível autenticar offline.";
  }
}