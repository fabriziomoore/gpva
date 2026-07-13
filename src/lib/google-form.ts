// Envia respostas ao Google Forms "DESCRITIVO NEGOCIAÇÃO" em segundo plano.
// A configuração (form ativo + IDs de entry.*) vem do banco via server fn
// `getGoogleFormSettings` e o admin pode trocar em Administração → Google Forms.

import { getGoogleFormSettings, type FormEntries } from "@/lib/google-form.functions";

type EntryIds = FormEntries;

type ActiveForm = { formId: string; endpoint: string; entries: EntryIds };

const CACHE_KEY = "gpva-google-form-active";

async function loadActiveForm(): Promise<ActiveForm> {
  const row = await getGoogleFormSettings();
  if (!row) throw new Error("Configuração do Google Forms ausente.");
  const formId = row.mode === "test" ? row.test_form_id : row.prod_form_id;
  const entries = (row.mode === "test" ? row.test_entries : row.prod_entries) as EntryIds;
  return {
    formId,
    endpoint: `https://docs.google.com/forms/d/e/${formId}/formResponse`,
    entries,
  };
}

// Sempre relê a configuração antes de enviar, para que a troca prod/test
// feita no admin passe a valer imediatamente em todos os dispositivos.
async function getActiveForm(): Promise<ActiveForm> {
  return await loadActiveForm();
}

/** Mantido por compatibilidade; hoje não há cache para invalidar. */
export function invalidateGoogleFormCache(): void {
  if (typeof window !== "undefined") {
    try { window.localStorage.removeItem(CACHE_KEY); } catch { /* ignore */ }
  }
}

export const LEADER_OPTIONS = [
  "RODRIGO OLIVEIRA","WELLINGTON COUTO","LEONARDO SANTOS","SERGIO LUIZ",
  "GABRIEL ARAÚJO","JEFFERSON GOES","DANIEL CUSTÓDIA","DIEGO BARROZO",
  "THIAGO LIMA","DIOGO RODRIGUES","HELTON MOTA","VITOR KLEN",
  "JEAN COUTO","CAIO AZEVEDO",
] as const;

export const SETOR_OPTIONS = [
  "FISCALIZAÇÃO","SETORIZADA","CORTE E RELIGA","COMERCIAL","EQUIPE MONO",
] as const;

export const PAYMENT_OPTIONS = [
  "PIX - Á VISTA","CARTÃO DE CRÉDITO","CARTÃO DE DÉBITO","BOLETO","PARCELAMENTO BOLETO",
] as const;
export type PaymentOption = typeof PAYMENT_OPTIONS[number];

function stripDiacritics(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim();
}

function matchOption<T extends readonly string[]>(value: string | null | undefined, opts: T): T[number] | null {
  if (!value) return null;
  const norm = stripDiacritics(value);
  for (const o of opts) if (stripDiacritics(o) === norm) return o;
  return null;
}

export function normalizeLeader(v: string | null | undefined) {
  return matchOption(v, LEADER_OPTIONS);
}
export function normalizeSetor(v: string | null | undefined) {
  return matchOption(v, SETOR_OPTIONS);
}

export type NegotiationSubmission = {
  date: Date;
  leader: string | null | undefined;
  setor: string | null | undefined;
  matricula: string;
  paymentMethods: PaymentOption[];
  valorAVista?: number;
  valorTotalParcelado?: number;
  qtdParcelas?: number;
};

function hasInstallmentMethod(methods: PaymentOption[]): boolean {
  return methods.some(
    (m) => m === "CARTÃO DE CRÉDITO" || m === "PARCELAMENTO BOLETO",
  );
}

function buildParams(input: NegotiationSubmission, ENTRIES: EntryIds): URLSearchParams {
  const params = new URLSearchParams();
  const d = input.date;
  params.set(`${ENTRIES.data}_year`, String(d.getFullYear()));
  params.set(`${ENTRIES.data}_month`, String(d.getMonth() + 1));
  params.set(`${ENTRIES.data}_day`, String(d.getDate()));

  const leader = normalizeLeader(input.leader);
  if (leader) params.set(ENTRIES.lider, leader);
  const setor = normalizeSetor(input.setor);
  if (setor) params.set(ENTRIES.setor, setor);

  params.set(ENTRIES.matricula, input.matricula);
  // Campo do Forms é checkbox: envia um valor por método selecionado.
  for (const m of input.paymentMethods) params.append(ENTRIES.pagamento, m);
  // Ambos os campos de valor são obrigatórios no formulário; preencha o não usado com 0,00.
  params.set(ENTRIES.valorAVista, formatMoney(input.valorAVista ?? 0));
  params.set(ENTRIES.valorTotalParcelado, formatMoney(input.valorTotalParcelado ?? 0));
  if (ENTRIES.qtdParcelas) {
    const qtd = hasInstallmentMethod(input.paymentMethods) ? input.qtdParcelas ?? 0 : 0;
    params.set(ENTRIES.qtdParcelas, String(qtd));
  }
  return params;
}

/**
 * Abre o Google Forms pré-preenchido (viewform) numa nova aba para o
 * usuário revisar e clicar em "Enviar" manualmente. NÃO submete a resposta
 * automaticamente. Retorna true se a aba foi aberta; false se foi bloqueada
 * por popup blocker.
 */
export async function submitNegotiationToGoogleForm(input: NegotiationSubmission): Promise<boolean> {
  // Em navegadores, o window.open precisa ser feito SÍNCRONO no gesto do
  // clique — senão o popup abre em about:blank e a navegação posterior é
  // bloqueada. Abrimos aqui primeiro; depois carregamos a config e
  // submetemos o form nessa janela já aberta.
  let win: Window | null = null;
  const isNativeGuess =
    typeof window !== "undefined" &&
    // Capacitor injeta este flag antes do JS do app rodar
    (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } })
      .Capacitor?.isNativePlatform?.() === true;
  if (typeof window !== "undefined" && !isNativeGuess) {
    win = window.open("about:blank", "_blank");
    if (!win) return false;
  }

  let active: ActiveForm;
  try {
    active = await getActiveForm();
  } catch (err) {
    win?.close();
    throw err;
  }
  const params = buildParams(input, active.entries);
  const viewformUrl = `https://docs.google.com/forms/d/e/${active.formId}/viewform?usp=pp_url&${params.toString()}`;

  // No app nativo abrimos a viewform pré-preenchida dentro de um WebView
  // do próprio app (@capacitor/inappbrowser) com toolbar customizada. O
  // usuário confere os dados e toca em "Enviar" — a tela "Sua resposta
  // foi registrada" aparece dentro do mesmo WebView, sem sair do app.
  try {
    const { Capacitor } = await import("@capacitor/core");
    if (Capacitor.isNativePlatform()) {
      // Abre o Forms pré-preenchido num WebView nativo com toolbar
      // customizada (mesmo padrão da Consulta ArcGIS). O usuário revisa
      // os campos e toca em "Enviar" dentro do próprio WebView.
      const { InAppBrowser, ToolBarType, BackgroundColor } = await import(
        "@capgo/inappbrowser"
      );
      await InAppBrowser.openWebView({
        url: viewformUrl,
        title: "Descritivo Negociação",
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
    // Em nativo, se algo falhar, não caia no window.open (abre Chrome externo
    // em about:blank). Só web usa o fallback abaixo.
    if (isNativeGuess) return false;
  }

  if (!win) {
    win = window.open("about:blank", "_blank");
    if (!win) return false;
  }

  // Navega a aba já aberta para a viewform pré-preenchida. O envio só
  // acontece quando o usuário clicar em "Enviar" na página do Google.
  win.location.href = viewformUrl;
  return true;
}

/**
 * Envia a resposta em segundo plano (no-cors) — sem abrir nova aba.
 * A resposta é opaque; consideramos sucesso quando o fetch não lança.
 */
export async function submitNegotiationSilent(input: NegotiationSubmission): Promise<boolean> {
  try {
    const active = await getActiveForm();
    const params = buildParams(input, active.entries);
    await fetch(active.endpoint, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
      body: params.toString(),
    });
    return true;
  } catch {
    return false;
  }
}

export function formatMoneyBR(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatMoney(n: number): string {
  return n.toFixed(2).replace(".", ",");
}
