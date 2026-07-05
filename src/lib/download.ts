import { Capacitor } from "@capacitor/core";

export type SavedFile = {
  filename: string;
  // Web: object URL do blob (abrível com window.open em nova aba).
  // Native: URI file:// do arquivo salvo em Documents.
  openUrl: string | null;
  native: boolean;
};

export async function downloadOrShare(blob: Blob, filename: string): Promise<SavedFile> {
  if (Capacitor.isNativePlatform()) {
    const { Filesystem, Directory } = await import("@capacitor/filesystem");
    const base64 = await blobToBase64(blob);
    const written = await Filesystem.writeFile({
      path: filename,
      data: base64,
      directory: Directory.Documents,
      recursive: true,
    });
    return { filename, openUrl: written.uri ?? null, native: true };
  }

  const url = URL.createObjectURL(blob);
  const frameName = `download-frame-${Date.now()}`;
  const frame = document.createElement("iframe");
  frame.name = frameName;
  frame.style.display = "none";
  frame.setAttribute("aria-hidden", "true");
  document.body.appendChild(frame);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.type = blob.type || "application/pdf";
  a.target = frameName;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => {
    URL.revokeObjectURL(url);
    frame.remove();
  }, 30_000);
  return { filename, openUrl: url, native: false };
}

// Abre / mostra ao usuário o arquivo salvo.
// - Native: usa o share sheet do Android para "Abrir com" o PDF.
// - Web: abre em nova aba.
export async function openSavedFile(saved: SavedFile): Promise<void> {
  if (saved.native) {
    if (!saved.openUrl) return;
    const { Share } = await import("@capacitor/share");
    try {
      await Share.share({
        title: saved.filename,
        url: saved.openUrl,
        dialogTitle: "Abrir relatório",
      });
    } catch {
      /* usuário cancelou */
    }
    return;
  }
  if (saved.openUrl) window.open(saved.openUrl, "_blank", "noopener");
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(r.error);
    r.onloadend = () => {
      const s = String(r.result ?? "");
      const i = s.indexOf(",");
      resolve(i >= 0 ? s.slice(i + 1) : s);
    };
    r.readAsDataURL(blob);
  });
}

export function slugFilename(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    || "arquivo";
}