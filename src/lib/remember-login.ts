// Preferência de UI: lembrar o campo "Loguin" na tela de entrada, controlada
// por um checkbox explícito. Independente da credencial hasheada usada pelo
// login offline (essa continua sendo gravada automaticamente, sem opt-in —
// ver offline-auth.ts) — aqui só guardamos texto não sensível (o login), nunca
// a senha.
import { Preferences } from "@capacitor/preferences";

const ENABLED_KEY = "gpva.rememberLogin.enabled.v1";
const LOGIN_KEY = "gpva.rememberLogin.value.v1";

async function prefsGet(key: string): Promise<string | null> {
  try {
    const { value } = await Preferences.get({ key });
    return value ?? null;
  } catch {
    return null;
  }
}

async function prefsSet(key: string, value: string): Promise<void> {
  try {
    await Preferences.set({ key, value });
  } catch {
    /* ignore */
  }
}

async function prefsRemove(key: string): Promise<void> {
  try {
    await Preferences.remove({ key });
  } catch {
    /* ignore */
  }
}

export async function getRememberLoginPref(): Promise<{ enabled: boolean; login: string }> {
  const [enabledRaw, login] = await Promise.all([prefsGet(ENABLED_KEY), prefsGet(LOGIN_KEY)]);
  return { enabled: enabledRaw === "1", login: login ?? "" };
}

/** Chamar após um login bem-sucedido, com o estado atual do checkbox. */
export async function setRememberLogin(enabled: boolean, login: string): Promise<void> {
  if (enabled) {
    await Promise.all([prefsSet(ENABLED_KEY, "1"), prefsSet(LOGIN_KEY, login.trim())]);
  } else {
    await Promise.all([prefsRemove(ENABLED_KEY), prefsRemove(LOGIN_KEY)]);
  }
}
