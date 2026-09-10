// Formulário "DEVOLUÇÃO DE MEDIDORES" (Microsoft Forms) — é da empresa, sem
// acesso de edição, então não dá pra gerar um link com preenchimento
// automático (a Microsoft só permite isso quando o dono do formulário liga
// "Habilitar respostas pré-preenchidas" no editor). Em vez disso, coletamos
// os mesmos dados aqui no app, copiamos um resumo formatado para a área de
// transferência e abrimos o formulário em branco para colar/selecionar.

export const HD_FORM_URL =
  "https://forms.cloud.microsoft/pages/responsepage.aspx?id=TAWRiYfpl0Kjc_nPDgxH7IKRFzihJU1BsMdPlZRr6-9UNzBHOTlVVDBCSFJMQ0tEMDhTUEo4MVhXNy4u&route=shorturl";

export const HD_DIAMETRO_OPTIONS = [
  '1/2"', '3/4"', '1"', '1 1/2"', '2"', '3"', '4"', '5"', '6"',
] as const;
export type HdDiametro = (typeof HD_DIAMETRO_OPTIONS)[number];

export type HdSubmission = {
  equipe: string;
  lider: string | null | undefined;
  ordemServico: string;
  hidrometroRetirado: string;
  leitura: string;
  diametro: HdDiametro;
};

export function buildHdCaption(input: HdSubmission): string {
  const lines: string[] = ["*DEVOLUÇÃO DE MEDIDORES*"];
  lines.push(`Equipe: ${input.equipe}`);
  lines.push(`Líder responsável: ${input.lider || "-"}`);
  lines.push(`Nº da ordem de serviço: ${input.ordemServico}`);
  lines.push(`Número do hidrômetro retirado: ${input.hidrometroRetirado}`);
  lines.push(`Leitura: ${input.leitura}`);
  lines.push(`Diâmetro do medidor: ${input.diametro}`);
  return lines.join("\n");
}

/**
 * Abre o formulário em branco (sem preenchimento automático — ver nota
 * acima). No app nativo abre num WebView próprio, igual ao Forms de
 * negociação; na web abre em nova aba. Retorna true se conseguiu abrir.
 */
export async function openHdForm(ordemServico?: string): Promise<boolean> {
  const isNativeGuess =
    typeof window !== "undefined" &&
    (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } })
      .Capacitor?.isNativePlatform?.() === true;

  try {
    const { Capacitor } = await import("@capacitor/core");
    if (Capacitor.isNativePlatform()) {
      const { InAppBrowser, ToolBarType, BackgroundColor } = await import(
        "@capgo/inappbrowser"
      );
      const title = ordemServico
        ? `Forms Devolução de HD  •  OS ${ordemServico}`
        : "Forms Devolução de HD";
      await InAppBrowser.openWebView({
        url: HD_FORM_URL,
        title,
        toolbarType: ToolBarType.COMPACT,
        toolbarColor: "#1a2338",
        toolbarTextColor: "#ffffff",
        backgroundColor: BackgroundColor.WHITE,
        visibleTitle: true,
        showArrow: false,
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

  const win = window.open(HD_FORM_URL, "_blank");
  return !!win;
}
