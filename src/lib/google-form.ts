// Envia respostas ao Google Forms "DESCRITIVO NEGOCIAÇÃO" em segundo plano.
// Usa fetch no-cors + application/x-www-form-urlencoded (não requer preflight).
// Campos extraídos do FB_PUBLIC_LOAD_DATA_ do formulário.

// Troque para true para enviar ao formulário de TESTE (sua cópia pessoal).
// Deixe em false para enviar ao formulário oficial da liderança.
const USE_TEST_FORM = false;

const FORM_ID_PROD = "1FAIpQLSeuWfzbudZ4ZLs0upHcE4mD4kI97fMVdd4GIvG1Y8FIEn5Jgw";
// COLE AQUI o ID do seu Google Forms de teste (o pedaço entre /d/e/ e /viewform).
const FORM_ID_TEST = "COLE_O_ID_DO_FORMULARIO_DE_TESTE_AQUI";

const FORM_ID = USE_TEST_FORM ? FORM_ID_TEST : FORM_ID_PROD;
const ENDPOINT = `https://docs.google.com/forms/d/e/${FORM_ID}/formResponse`;

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
  params.set("entry.1838130926_year", String(d.getFullYear()));
  params.set("entry.1838130926_month", String(d.getMonth() + 1));
  params.set("entry.1838130926_day", String(d.getDate()));

  const leader = normalizeLeader(input.leader);
  if (leader) params.set("entry.529203145", leader);
  const setor = normalizeSetor(input.setor);
  if (setor) params.set("entry.1711428450", setor);

  params.set("entry.909324107", input.matricula);
  params.set("entry.2138182077", input.paymentMethod);
  if (input.valorAVista != null) params.set("entry.1890321124", formatMoney(input.valorAVista));
  if (input.valorTotalParcelado != null) params.set("entry.2131072094", formatMoney(input.valorTotalParcelado));
  if (input.qtdParcelas != null) params.set("entry.1468389727", String(input.qtdParcelas));
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

function formatMoney(n: number): string {
  return n.toFixed(2).replace(".", ",");
}
