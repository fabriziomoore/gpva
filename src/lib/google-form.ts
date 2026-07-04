// Envia respostas ao Google Forms "DESCRITIVO NEGOCIAÇÃO" em segundo plano.
// Usa fetch no-cors + application/x-www-form-urlencoded (não requer preflight).
// Campos extraídos do FB_PUBLIC_LOAD_DATA_ do formulário.

// Troque para true para enviar ao formulário de TESTE (sua cópia pessoal).
// Deixe em false para enviar ao formulário oficial da liderança.
const USE_TEST_FORM = true;

const FORM_ID_PROD = "1FAIpQLSeuWfzbudZ4ZLs0upHcE4mD4kI97fMVdd4GIvG1Y8FIEn5Jgw";
// ID do Google Forms de teste (cópia que recebe as respostas de teste).
const FORM_ID_TEST = "1FAIpQLScPmHLgySgoSmwaWod-c0S7QZyOZDDEjeqgATt-Eir_b1kCyg";

const FORM_ID = USE_TEST_FORM ? FORM_ID_TEST : FORM_ID_PROD;
const ENDPOINT = `https://docs.google.com/forms/d/e/${FORM_ID}/formResponse`;

// Cada cópia do Google Forms gera IDs de entry.* diferentes. Mantemos um mapa por form.
type EntryIds = {
  data: string;
  lider: string;
  setor: string;
  matricula: string;
  pagamento: string;
  valorAVista: string;
  valorTotalParcelado: string;
  qtdParcelas?: string;
};

const ENTRY_PROD: EntryIds = {
  data: "entry.1838130926",
  lider: "entry.529203145",
  setor: "entry.1711428450",
  matricula: "entry.909324107",
  pagamento: "entry.2138182077",
  valorAVista: "entry.1890321124",
  valorTotalParcelado: "entry.2131072094",
  qtdParcelas: "entry.1468389727",
};

const ENTRY_TEST: EntryIds = {
  data: "entry.1623872850",
  lider: "entry.468998940",
  setor: "entry.1405459175",
  matricula: "entry.673101343",
  pagamento: "entry.831927898",
  valorAVista: "entry.99377781",
  valorTotalParcelado: "entry.1571776838",
  // Formulário de teste não possui campo de quantidade de parcelas.
};

const ENTRIES: EntryIds = USE_TEST_FORM ? ENTRY_TEST : ENTRY_PROD;

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
  paymentMethod: PaymentOption;
  valorAVista?: number;
  valorTotalParcelado?: number;
  qtdParcelas?: number;
};

function buildParams(input: NegotiationSubmission): URLSearchParams {
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
  params.set(ENTRIES.pagamento, input.paymentMethod);
  // Ambos os campos de valor são obrigatórios no formulário; preencha o não usado com 0,00.
  params.set(ENTRIES.valorAVista, formatMoney(input.valorAVista ?? 0));
  params.set(ENTRIES.valorTotalParcelado, formatMoney(input.valorTotalParcelado ?? 0));
  if (input.qtdParcelas != null && ENTRIES.qtdParcelas) params.set(ENTRIES.qtdParcelas, String(input.qtdParcelas));
  return params;
}

/**
 * Envia a resposta abrindo uma nova aba com POST real ao Google Forms,
 * fazendo o navegador exibir a tela "Sua resposta foi registrada".
 * Retorna true se a aba foi aberta; false se foi bloqueada por popup blocker.
 */
export function submitNegotiationToGoogleForm(input: NegotiationSubmission): boolean {
  const params = buildParams(input);
  const win = window.open("about:blank", "_blank");
  if (!win) return false;

  const form = win.document.createElement("form");
  form.method = "POST";
  form.action = ENDPOINT;
  form.acceptCharset = "UTF-8";
  for (const [k, v] of params) {
    const i = win.document.createElement("input");
    i.type = "hidden";
    i.name = k;
    i.value = v;
    form.appendChild(i);
  }
  win.document.body.appendChild(form);
  form.submit();
  return true;
}

/**
 * Envia a resposta em segundo plano (no-cors) — sem abrir nova aba.
 * A resposta é opaque; consideramos sucesso quando o fetch não lança.
 */
export async function submitNegotiationSilent(input: NegotiationSubmission): Promise<boolean> {
  try {
    const params = buildParams(input);
    await fetch(ENDPOINT, {
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
