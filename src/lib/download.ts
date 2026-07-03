import { Capacitor } from "@capacitor/core";

export async function downloadOrShare(blob: Blob, filename: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    const { Filesystem, Directory } = await import("@capacitor/filesystem");
    const { Share } = await import("@capacitor/share");
    const base64 = await blobToBase64(blob);
    await Filesystem.writeFile({
      path: filename,
      data: base64,
      directory: Directory.Documents,
      recursive: true,
    });
    const { uri } = await Filesystem.getUri({
      path: filename,
      directory: Directory.Documents,
    });
    try {
      await Share.share({ title: filename, url: uri, dialogTitle: "Salvar/compartilhar relatório" });
    } catch {
      // usuário cancelou o share — arquivo já está salvo em Documentos
    }
    return;
  }

  if (await saveWithFilePicker(blob, filename)) return;

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.type = blob.type || "application/pdf";
  // Se algum navegador/WebView ignorar `download`, abre fora da página atual
  // em vez de substituir o app pela URL blob.
  a.target = "_blank";
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  a.dispatchEvent(new MouseEvent("click", { bubbles: false, cancelable: true, view: window }));
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

type FileSaveWindow = Window & {
  showSaveFilePicker?: (options: {
    suggestedName?: string;
    types?: Array<{ description: string; accept: Record<string, string[]> }>;
  }) => Promise<{
    createWritable: () => Promise<{
      write: (data: Blob) => Promise<void>;
      close: () => Promise<void>;
    }>;
  }>;
};

async function saveWithFilePicker(blob: Blob, filename: string): Promise<boolean> {
  const picker = (window as FileSaveWindow).showSaveFilePicker;
  if (!window.isSecureContext || typeof picker !== "function") return false;

  try {
    const handle = await picker({
      suggestedName: filename,
      types: [{ description: "PDF", accept: { "application/pdf": [".pdf"] } }],
    });
    const writable = await handle.createWritable();
    await writable.write(blob);
    await writable.close();
    return true;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return true;
    return false;
  }
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