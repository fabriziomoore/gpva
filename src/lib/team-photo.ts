import { useEffect, useState } from "react";

const EVT = "gpva:team-photo-changed";

function key(userId: string) {
  return `gpva:team-photo:${userId}`;
}

export function getTeamPhoto(userId: string | null): string | null {
  if (!userId || typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key(userId));
  } catch {
    return null;
  }
}

export function setTeamPhoto(userId: string, dataUrl: string | null) {
  if (typeof window === "undefined") return;
  try {
    if (dataUrl) window.localStorage.setItem(key(userId), dataUrl);
    else window.localStorage.removeItem(key(userId));
    window.dispatchEvent(new CustomEvent(EVT, { detail: { userId } }));
  } catch {
    /* ignore */
  }
}

export function useTeamPhoto(userId: string | null): string | null {
  const [photo, setPhoto] = useState<string | null>(() => getTeamPhoto(userId));
  useEffect(() => {
    setPhoto(getTeamPhoto(userId));
    const handler = () => setPhoto(getTeamPhoto(userId));
    window.addEventListener(EVT, handler);
    window.addEventListener("storage", handler);
    return () => {
      window.removeEventListener(EVT, handler);
      window.removeEventListener("storage", handler);
    };
  }, [userId]);
  return photo;
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