import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTeam } from "@/hooks/use-team";
import { repoUpdateTeam } from "@/lib/db/repos";
import { supabase } from "@/integrations/supabase/client";
import { cacheTeam, getCachedTeam } from "@/lib/db/catalogs";

const PHOTO_PUSH_TIMEOUT_MS = 8_000;

const EVT = "gpva:team-photo-changed";

function cacheKey(userId: string) {
  return `gpva:team-photo:${userId}`;
}

function readCache(userId: string | null): string | null {
  if (!userId || typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(cacheKey(userId));
  } catch {
    return null;
  }
}

function writeCache(userId: string, value: string | null) {
  if (typeof window === "undefined") return;
  try {
    if (value) window.localStorage.setItem(cacheKey(userId), value);
    else window.localStorage.removeItem(cacheKey(userId));
    window.dispatchEvent(new CustomEvent(EVT, { detail: { userId } }));
  } catch {
    /* ignore */
  }
}

/**
 * Grava a foto no `equipes.photo_url` (nuvem) — pra que ela já esteja lá
 * quando essa mesma conta logar em outro aparelho. Tenta escrever direto no
 * Supabase primeiro (confirma de verdade que chegou na nuvem antes de
 * avisar sucesso); só cai pro enfileiramento offline-first (outbox, tenta
 * de novo quando a rede voltar) se a escrita direta falhar — assim o
 * chamador sabe honestamente se a foto já está sincronizada ou só local.
 */
export async function saveTeamPhoto(userId: string, dataUrl: string | null): Promise<{ synced: boolean }> {
  writeCache(userId, dataUrl);
  try {
    const { error } = await Promise.race([
      supabase.from("equipes").update({ photo_url: dataUrl }).eq("id", userId),
      new Promise<{ error: Error }>((resolve) =>
        setTimeout(() => resolve({ error: new Error("timeout") }), PHOTO_PUSH_TIMEOUT_MS),
      ),
    ]);
    if (error) throw error;
    const cached = await getCachedTeam(userId);
    if (cached) await cacheTeam({ ...cached, photo_url: dataUrl });
    return { synced: true };
  } catch {
    // Sem rede ou falha momentânea — enfileira para sincronizar depois via
    // o motor de sync offline-first (retry automático).
    await repoUpdateTeam(userId, { photo_url: dataUrl });
    return { synced: false };
  }
}

export function useTeamPhoto(userId: string | null): string | null {
  const { data: team } = useTeam(userId);
  const qc = useQueryClient();
  const remote = team?.photo_url ?? null;

  useEffect(() => {
    if (!userId) return;
    if (remote !== null) writeCache(userId, remote);
  }, [userId, remote]);

  useEffect(() => {
    if (!userId) return;
    const handler = () => qc.invalidateQueries({ queryKey: ["team", userId] });
    window.addEventListener(EVT, handler);
    window.addEventListener("storage", handler);
    return () => {
      window.removeEventListener(EVT, handler);
      window.removeEventListener("storage", handler);
    };
  }, [userId, qc]);

  return remote ?? readCache(userId);
}

export async function fileToCompressedDataUrl(file: File, maxSize = 512, quality = 0.85): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas indisponível");
  ctx.drawImage(bitmap, 0, 0, w, h);
  return canvas.toDataURL("image/jpeg", quality);
}