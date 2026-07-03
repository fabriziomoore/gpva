import { Capacitor } from "@capacitor/core";

export async function downloadOrShare(blob: Blob, filename: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    const { Filesystem, Directory } = await import("@capacitor/filesystem");
    const base64 = await blobToBase64(blob);
    await Filesystem.writeFile({
      path: filename,
      data: base64,
      directory: Directory.Documents,
      recursive: true,
    });
    return;
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
  // Se o navegador ignorar o atributo download, a URL blob abre no iframe
  // oculto, não na tela principal do app.
  a.target = frameName;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => {
    URL.revokeObjectURL(url);
    frame.remove();
  }, 30_000);
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