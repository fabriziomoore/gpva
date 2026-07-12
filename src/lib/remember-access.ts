// Shim de compatibilidade — a persistência real está em `offline-auth.ts`
// (Capacitor Preferences apenas, sem localStorage).

import {
  getCredential,
  saveCredentialFromOnlineLogin,
  clearCredential,
  tryOfflineLogin,
} from "@/lib/offline-auth";

export type RememberRecord = {
  team: string;
  salt: string;
  hash: string;
  iterations: number;
};

export async function saveRemembered(team: string, password: string): Promise<void> {
  await saveCredentialFromOnlineLogin(team, password);
}

export async function getRemembered(): Promise<RememberRecord | null> {
  const rec = await getCredential();
  if (!rec) return null;
  return { team: rec.team, salt: rec.salt, hash: rec.hash, iterations: rec.iterations };
}

export async function clearRemembered(): Promise<void> {
  await clearCredential();
}

export async function verifyRemembered(team: string, password: string): Promise<boolean> {
  const r = await tryOfflineLogin(team, password);
  return r.ok;
}