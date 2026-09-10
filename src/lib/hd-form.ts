// Formulário "DEVOLUÇÃO DE MEDIDORES" (Microsoft Forms) — é da empresa, sem
// acesso de edição, então não dá pra gerar um link com preenchimento
// automático (a Microsoft só permite isso quando o dono do formulário liga
// "Habilitar respostas pré-preenchidas" no editor). Em vez disso, copiamos
// os dados que já temos (equipe/líder) para a área de transferência e
// abrimos o formulário em branco para colar/selecionar o resto.

export const HD_FORM_URL =
  "https://forms.cloud.microsoft/pages/responsepage.aspx?id=TAWRiYfpl0Kjc_nPDgxH7IKRFzihJU1BsMdPlZRr6-9UNzBHOTlVVDBCSFJMQ0tEMDhTUEo4MVhXNy4u&route=shorturl";

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

/**
 * Abre o formulário em branco (sem preenchimento automático — ver nota
 * acima). No app nativo abre num WebView próprio com toolbar customizada,
 * igual ao Forms de negociação; na web abre em nova aba. Retorna true se
 * conseguiu abrir.
 *
 * Em navegadores, o window.open precisa ser feito SÍNCRONO no gesto do
 * clique — senão o popup abre em about:blank e a navegação posterior é
 * bloqueada (mesmo cuidado do Forms de negociação, ver google-form.ts).
 * Por isso abrimos a aba em branco aqui já na primeira linha, antes de
 * qualquer await.
 */
export async function openHdForm(): Promise<boolean> {
  const isNativeGuess =
    typeof window !== "undefined" &&
    (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } })
      .Capacitor?.isNativePlatform?.() === true;

  let win: Window | null = null;
  if (typeof window !== "undefined" && !isNativeGuess) {
    win = window.open("about:blank", "_blank");
    if (!win) return false;
  }

  try {
    const { Capacitor } = await import("@capacitor/core");
    if (Capacitor.isNativePlatform()) {
      win?.close();
      const { InAppBrowser, ToolBarType, BackgroundColor } = await import(
        "@capgo/inappbrowser"
      );
      await InAppBrowser.openWebView({
        url: HD_FORM_URL,
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
      return true;
    }
  } catch {
    if (isNativeGuess) return false;
  }

  if (!win) {
    win = window.open(HD_FORM_URL, "_blank");
    return !!win;
  }
  win.location.href = HD_FORM_URL;
  return true;
}
