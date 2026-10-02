import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";

// Cartão de abastecimento de cada colaborador da equipe.
//
// A conta (e o celular) é da EQUIPE, mas a senha do cartão é individual e não
// pode ser vista pelo colega. Por isso a senha nunca é guardada legível: ela é
// criptografada (AES-GCM 256) no aparelho, com uma chave derivada
// (PBKDF2-SHA256) do código pessoal de 6 números que só o dono sabe. Sem o
// código, nem o app consegue mostrar a senha. A matrícula fica em texto.
//
// Cópia local (localStorage) + cópia na tabela `cartoes_abastecimento` (só o
// cofre já criptografado; RLS = só a própria conta da equipe), pra aparecer
// em outro celular se este descarregar/quebrar. O código pessoal e a senha em
// texto nunca saem do aparelho. Tentativas erradas/bloqueio são por aparelho.
//
// A chave local não bate com os padrões de auth limpos no logout
// (src/lib/auth.ts → AUTH_STORAGE_PATTERNS), então sobrevive ao "sessão
// encerrada por inatividade".

export type FuelVault = { salt: string; iv: string; ct: string; iter: number };
export type FuelCardData = {
  matricula: string;
  vault: FuelVault | null;
  /** Quando matrícula/cofre mudaram por último (ISO) — decide quem vence no sync. */
  updatedAt: string;
  /** Mudança local ainda não enviada pro sistema (sem internet na hora). */
  dirty: boolean;
  /** Tentativas erradas seguidas do código pessoal (neste aparelho). */
  fails: number;
  /** Bloqueado até este instante (ms) depois de muitas tentativas erradas. */
  lockUntil: number;
};
/** Um por colaborador: índice 0 = Colaborador 1, índice 1 = Colaborador 2. */
export type FuelCards = [FuelCardData, FuelCardData];

export const FUEL_CODE_LEN = 6;
export const FUEL_MAX_FAILS = 5;
export const FUEL_LOCK_MS = 5 * 60 * 1000;
// Recomendação OWASP (2023) pra PBKDF2-SHA256. Cofres antigos guardam o
// próprio número de rodadas e continuam abrindo.
const PBKDF2_ITER = 600_000;

const EVT = "gpva:fuel-cards-changed";
const TABLE = "cartoes_abastecimento";

function empty(): FuelCardData {
  return { matricula: "", vault: null, updatedAt: "", dirty: false, fails: 0, lockUntil: 0 };
}

function key(userId: string) {
  return `gpva:fuel-cards:${userId}`;
}

function isVault(v: unknown): v is FuelVault {
  const o = v as FuelVault | null;
  return !!o && typeof o.salt === "string" && typeof o.iv === "string" && typeof o.ct === "string";
}

function normVault(v: unknown): FuelVault | null {
  return isVault(v) ? { salt: v.salt, iv: v.iv, ct: v.ct, iter: Number(v.iter) || PBKDF2_ITER } : null;
}

export function readFuelCards(userId: string | null): FuelCards {
  if (!userId || typeof window === "undefined") return [empty(), empty()];
  try {
    const raw = window.localStorage.getItem(key(userId));
    const parsed = raw ? (JSON.parse(raw) as Partial<FuelCardData>[]) : [];
    return [0, 1].map((i) => {
      const p = parsed[i] ?? {};
      return {
        matricula: String(p.matricula ?? ""),
        // Qualquer formato antigo/sem cofre (ex.: senha em texto) é descartado.
        vault: normVault(p.vault),
        updatedAt: String(p.updatedAt ?? ""),
        dirty: p.dirty === true,
        fails: Number(p.fails) || 0,
        lockUntil: Number(p.lockUntil) || 0,
      };
    }) as FuelCards;
  } catch {
    return [empty(), empty()];
  }
}

function write(userId: string, cards: FuelCards) {
  try {
    window.localStorage.setItem(key(userId), JSON.stringify(cards));
    window.dispatchEvent(new CustomEvent(EVT, { detail: { userId } }));
  } catch {
    /* armazenamento indisponível — nada a fazer */
  }
}

function update(userId: string, i: 0 | 1, patch: Partial<FuelCardData>) {
  const cards = readFuelCards(userId);
  cards[i] = { ...cards[i], ...patch };
  write(userId, cards);
}

// ---------- criptografia ----------

const b64 = (buf: ArrayBuffer | Uint8Array) => {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  bytes.forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s);
};
const unb64 = (s: string): Uint8Array<ArrayBuffer> => {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

async function deriveKey(code: string, salt: Uint8Array<ArrayBuffer>, iter: number) {
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(code), "PBKDF2", false, [
    "deriveKey",
  ]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: iter, hash: "SHA-256" },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

async function encryptPin(pin: string, code: string): Promise<FuelVault> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const k = await deriveKey(code, salt, PBKDF2_ITER);
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, k, new TextEncoder().encode(pin.trim()));
  return { salt: b64(salt), iv: b64(iv), ct: b64(ct), iter: PBKDF2_ITER };
}

// ---------- sincronização com o sistema ----------

let syncing: Promise<void> | null = null;

/**
 * Envia as mudanças locais pendentes e baixa o que estiver mais novo no
 * sistema. Sem internet (ou tabela indisponível), não faz nada e tenta de
 * novo na próxima chamada. Chamadas simultâneas reaproveitam a mesma rodada.
 */
export function syncFuelCards(userId: string | null): Promise<void> {
  if (!userId || typeof window === "undefined") return Promise.resolve();
  if (typeof navigator !== "undefined" && navigator.onLine === false) return Promise.resolve();
  if (syncing) return syncing;
  syncing = (async () => {
    try {
      // 1) Envia o que mudou aqui e ainda não subiu.
      const local = readFuelCards(userId);
      const pending = ([0, 1] as const).filter((i) => local[i].dirty);
      if (pending.length) {
        const { error } = await supabase.from(TABLE).upsert(
          pending.map((i) => ({
            team_id: userId,
            slot: i + 1,
            matricula: local[i].matricula,
            vault: (local[i].vault as unknown as Json) ?? null,
            updated_at: local[i].updatedAt || new Date().toISOString(),
          })),
          { onConflict: "team_id,slot" },
        );
        if (!error) {
          const cur = readFuelCards(userId);
          // Só limpa o "pendente" se nada mudou de novo durante o envio.
          for (const i of pending) {
            if (cur[i].updatedAt === local[i].updatedAt) cur[i].dirty = false;
          }
          write(userId, cur);
        }
      }

      // 2) Baixa o que estiver mais novo no sistema.
      const { data, error } = await supabase
        .from(TABLE)
        .select("slot,matricula,vault,updated_at")
        .eq("team_id", userId);
      if (error || !data) return;
      const cur = readFuelCards(userId);
      let changed = false;
      for (const row of data) {
        if (row.slot !== 1 && row.slot !== 2) continue;
        const i: 0 | 1 = row.slot === 2 ? 1 : 0;
        const c = cur[i];
        const remoteNewer = !c.updatedAt || new Date(row.updated_at).getTime() > new Date(c.updatedAt).getTime();
        if (!c.dirty && remoteNewer) {
          const vault = normVault(row.vault);
          // Cofre trocado em outro aparelho: zera tentativas daqui.
          const vaultChanged = (vault?.ct ?? null) !== (c.vault?.ct ?? null);
          cur[i] = {
            ...c,
            matricula: row.matricula ?? "",
            vault,
            updatedAt: row.updated_at,
            ...(vaultChanged ? { fails: 0, lockUntil: 0 } : {}),
          };
          changed = true;
        }
      }
      if (changed) write(userId, cur);
    } catch {
      /* sem rede / falha momentânea — fica pra próxima */
    } finally {
      syncing = null;
    }
  })();
  return syncing;
}

// ---------- ações ----------

/**
 * Salva matrícula e, se informada, a nova senha (criptografada com o código
 * pessoal de 6 números). Grava no aparelho na hora e tenta enviar pro sistema.
 * Retorna se já ficou salvo no sistema (false = só no aparelho por enquanto).
 */
export async function saveFuelCard(
  userId: string,
  i: 0 | 1,
  input: { matricula: string; pin?: string; code?: string },
): Promise<{ synced: boolean }> {
  const patch: Partial<FuelCardData> = {
    matricula: input.matricula.trim(),
    updatedAt: new Date().toISOString(),
    dirty: true,
  };
  if (input.pin?.trim()) {
    if (!input.code || input.code.length !== FUEL_CODE_LEN) throw new Error("Código pessoal inválido.");
    patch.vault = await encryptPin(input.pin, input.code);
    patch.fails = 0;
    patch.lockUntil = 0;
  }
  update(userId, i, patch);
  await syncFuelCards(userId);
  return { synced: !readFuelCards(userId)[i].dirty };
}

export async function clearFuelPin(userId: string, i: 0 | 1): Promise<{ synced: boolean }> {
  update(userId, i, { vault: null, fails: 0, lockUntil: 0, updatedAt: new Date().toISOString(), dirty: true });
  await syncFuelCards(userId);
  return { synced: !readFuelCards(userId)[i].dirty };
}

export type UnlockResult =
  | { ok: true; pin: string }
  | { ok: false; reason: "wrong"; left: number }
  | { ok: false; reason: "locked"; until: number }
  | { ok: false; reason: "empty" };

/** Abre o cofre com o código pessoal. Código errado conta tentativa. */
export async function unlockFuelPin(userId: string, i: 0 | 1, code: string): Promise<UnlockResult> {
  const card = readFuelCards(userId)[i];
  if (!card.vault) return { ok: false, reason: "empty" };
  if (card.lockUntil > Date.now()) return { ok: false, reason: "locked", until: card.lockUntil };
  try {
    const k = await deriveKey(code, unb64(card.vault.salt), card.vault.iter);
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(card.vault.iv) }, k, unb64(card.vault.ct));
    update(userId, i, { fails: 0, lockUntil: 0 });
    return { ok: true, pin: new TextDecoder().decode(plain) };
  } catch {
    // AES-GCM recusa a chave errada (tag de autenticação não confere).
    const fails = card.fails + 1;
    if (fails >= FUEL_MAX_FAILS) {
      const until = Date.now() + FUEL_LOCK_MS;
      update(userId, i, { fails: 0, lockUntil: until });
      return { ok: false, reason: "locked", until };
    }
    update(userId, i, { fails });
    return { ok: false, reason: "wrong", left: FUEL_MAX_FAILS - fails };
  }
}

/**
 * Lê os cartões, acompanha mudanças (Configurações, tentativas, bloqueio) e
 * sincroniza com o sistema ao montar e quando a internet volta.
 */
export function useFuelCards(userId: string | null): FuelCards {
  const [cards, setCards] = useState<FuelCards>(() => readFuelCards(userId));
  useEffect(() => {
    setCards(readFuelCards(userId));
    const onChange = () => setCards(readFuelCards(userId));
    const onOnline = () => void syncFuelCards(userId);
    window.addEventListener(EVT, onChange);
    window.addEventListener("storage", onChange);
    window.addEventListener("online", onOnline);
    void syncFuelCards(userId);
    return () => {
      window.removeEventListener(EVT, onChange);
      window.removeEventListener("storage", onChange);
      window.removeEventListener("online", onOnline);
    };
  }, [userId]);
  return cards;
}
