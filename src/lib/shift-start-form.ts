// Formulário "Registro Diário do Condutor" (Google Forms) — aberto ao
// iniciar um novo expediente, pré-preenchido com líder/equipe/data (e a
// placa do veículo, quando cadastrada em Configurações). Link fixo, sem
// distinção prod/test como o Forms de Negociação — contas de teste não
// abrem esse formulário (ver chamada em index.tsx).

const FORM_ID = "1FAIpQLSdt62RK3eH10k7T8Uk9D0KgL2N0lSNWLj0dGya4-iwoFTGuiQ";

const ENTRIES = {
  data: "entry.1510574985",
  lider: "entry.473844939",
  equipe: "entry.641738426",
  condutor: "entry.692123863",
  placa: "entry.1242811779",
  km: "entry.1866284048",
};

// Opções exatas do campo LÍDER no Forms (múltipla escolha — precisa bater
// caractere a caractere para o pré-preenchimento marcar a opção certa).
// "DIOGO  PECANHA" tem mesmo 2 espaços no formulário original.
const LEADER_OPTIONS = [
  "ALYSON NASCIMENTO",
  "CAIO AZEVEDO",
  "CARLOS AMARAL",
  "DANIEL MARTINS",
  "DIOGO  PECANHA",
  "GABRIEL ARAUJO",
  "HELTON MOTA",
  "JEAN CARLOS",
  "JEFFERSON GOIS",
  "RODRIGO OLIVEIRA",
  "SERGIO LUIZ",
  "VITOR KLEN",
  "WELINGTON COUTO",
] as const;

function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .toUpperCase()
    .trim();
}

function matchLeader(v: string | null | undefined): string | null {
  if (!v) return null;
  const norm = normalize(v);
  for (const o of LEADER_OPTIONS) if (normalize(o) === norm) return o;
  return null;
}

export type ShiftStartFormInput = {
  leader: string | null | undefined;
  teamName: string | null | undefined;
  plate?: string | null;
  condutor?: string | null;
  km?: string | null;
};

function buildUrl(input: ShiftStartFormInput): string {
  const params = new URLSearchParams();
  const d = new Date();
  params.set(`${ENTRIES.data}_year`, String(d.getFullYear()));
  params.set(`${ENTRIES.data}_month`, String(d.getMonth() + 1));
  params.set(`${ENTRIES.data}_day`, String(d.getDate()));

  const leader = matchLeader(input.leader);
  if (leader) params.set(ENTRIES.lider, leader);
  if (input.teamName) params.set(ENTRIES.equipe, input.teamName);
  if (input.condutor) params.set(ENTRIES.condutor, input.condutor);
  if (input.plate) params.set(ENTRIES.placa, input.plate);
  if (input.km) params.set(ENTRIES.km, input.km);

  return `https://docs.google.com/forms/d/e/${FORM_ID}/viewform?usp=pp_url&${params.toString()}`;
}

/**
 * Abre o Forms pré-preenchido ao iniciar um novo expediente. Mesmo padrão
 * de WebView do Forms de Negociação/Devolução de HD: no app nativo abre num
 * WebView próprio com toolbar customizada; na web, em nova aba.
 *
 * Precisa ser chamada de forma síncrona dentro do gesto de clique do
 * usuário (antes de qualquer `await` no handler que a chama) — o
 * `window.open` na web só funciona sem popup blocker nesse contexto.
 */
export function openShiftStartForm(input: ShiftStartFormInput): void {
  const isNativeGuess =
    typeof window !== "undefined" &&
    (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } })
      .Capacitor?.isNativePlatform?.() === true;

  let win: Window | null = null;
  if (typeof window !== "undefined" && !isNativeGuess) {
    win = window.open("about:blank", "_blank");
    if (!win) return;
  }

  const url = buildUrl(input);

  void (async () => {
    try {
      const { Capacitor } = await import("@capacitor/core");
      if (Capacitor.isNativePlatform()) {
        win?.close();
        const { InAppBrowser, ToolBarType, BackgroundColor } = await import(
          "@capgo/inappbrowser"
        );
        await InAppBrowser.openWebView({
          url,
          title: "Registro Diário do Condutor",
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
        return;
      }
    } catch {
      if (isNativeGuess) return;
    }
    if (win) win.location.href = url;
  })();
}
