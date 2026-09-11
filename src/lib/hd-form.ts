// Formulário "DEVOLUÇÃO DE MEDIDORES" (Microsoft Forms) — é da empresa, sem
// acesso de edição, então não dá pra gerar um link com preenchimento
// automático (a Microsoft só permite isso quando o dono do formulário liga
// "Habilitar respostas pré-preenchidas" no editor). Em vez disso, copiamos
// os dados que já temos (equipe/líder) para a área de transferência e
// abrimos o formulário em branco para colar/selecionar o resto.
//
// O link em si (produção vs. teste) vem do banco via `getHdFormUrl` — contas
// de teste nunca recebem o link de produção, ver hd-form.functions.ts.

export type HdSubmission = {
  equipe: string;
  lider: string | null | undefined;
};

export function buildHdCaption(input: HdSubmission): string {
  const lines: string[] = ["*DEVOLUÇÃO DE MEDIDORES*"];
  lines.push(`Equipe: ${input.equipe}`);
  lines.push(`Líder responsável: ${input.lider || "-"}`);
  return lines.join("\n");
}

export type HdFormOpenResult = "opened" | "not_configured" | "blocked";

/**
 * Abre o formulário em branco (sem preenchimento automático — ver nota
 * acima). No app nativo abre num WebView próprio com toolbar customizada,
 * igual ao Forms de negociação; na web abre em nova aba.
 *
 * Em navegadores, o window.open precisa ser feito SÍNCRONO no gesto do
 * clique — senão o popup abre em about:blank e a navegação posterior é
 * bloqueada (mesmo cuidado do Forms de negociação, ver google-form.ts). Por
 * isso abrimos a aba em branco já na primeira linha, ANTES de esperar
 * `urlPromise` (que faz uma chamada ao servidor para saber se é conta de
 * teste ou real) — só assim o navegador ainda reconhece isso como parte do
 * clique do usuário.
 */
export async function openHdForm(
  urlPromise: Promise<{ url: string | null; isTest: boolean } | null>,
): Promise<HdFormOpenResult> {
  const isNativeGuess =
    typeof window !== "undefined" &&
    (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } })
      .Capacitor?.isNativePlatform?.() === true;

  let win: Window | null = null;
  if (typeof window !== "undefined" && !isNativeGuess) {
    win = window.open("about:blank", "_blank");
    if (!win) return "blocked";
  }

  const info = await urlPromise;
  const url = info?.url;
  if (!url) {
    win?.close();
    return "not_configured";
  }

  try {
    const { Capacitor } = await import("@capacitor/core");
    if (Capacitor.isNativePlatform()) {
      win?.close();
      const { InAppBrowser, ToolBarType, BackgroundColor } = await import(
        "@capgo/inappbrowser"
      );
      await InAppBrowser.openWebView({
        url,
        title: "Forms Devolução de HD",
        toolbarType: ToolBarType.COMPACT,
        toolbarColor: "#1a2338",
        toolbarTextColor: "#ffffff",
        backgroundColor: BackgroundColor.WHITE,
        visibleTitle: true,
        showArrow: true,
        showReloadButton: false,
        activeNativeNavigationForWebview: true,
        isPresentAfterPageLoad: false,
        isAnimated: true,
      });
      return "opened";
    }
  } catch {
    if (isNativeGuess) return "blocked";
  }

  if (!win) {
    win = window.open(url, "_blank");
    return win ? "opened" : "blocked";
  }
  win.location.href = url;
  return "opened";
}
