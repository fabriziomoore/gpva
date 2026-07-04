// Gera uma imagem PNG com o descritivo da negociação e compartilha via Web Share API.
// Fallback: se o navegador não aceitar compartilhar arquivos (ex.: desktop), baixa a imagem
// e abre o WhatsApp Web com um texto pronto para o usuário anexar o PNG baixado.

import { formatMoneyBR, type NegotiationSubmission } from "./google-form";

function fmtDate(d: Date): string {
  return d.toLocaleDateString("pt-BR");
}

function drawWrapped(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
): number {
  const words = text.split(" ");
  let line = "";
  let cy = y;
  for (const w of words) {
    const test = line ? line + " " + w : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, cy);
      line = w;
      cy += lineHeight;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, cy);
  return cy;
}

export async function buildNegotiationImage(input: NegotiationSubmission): Promise<Blob> {
  const W = 1080;
  const canvas = document.createElement("canvas");
  const ctx = document.createElement("canvas").getContext("2d")!;
  // Medimos primeiro para calcular altura dinâmica.
  const rows: Array<[string, string]> = [
    ["DATA", fmtDate(input.date)],
    ["LÍDER", input.leader ?? "—"],
    ["SETOR", input.setor ?? "—"],
    ["MATRÍCULA", input.matricula],
    ["FORMA DE PAGAMENTO", input.paymentMethod],
  ];
  if (input.valorAVista != null) rows.push(["VALOR À VISTA", formatMoneyBR(input.valorAVista)]);
  if (input.valorTotalParcelado != null) rows.push(["VALOR TOTAL PARCELADO", formatMoneyBR(input.valorTotalParcelado)]);
  if (input.qtdParcelas != null) rows.push(["QTD PARCELAS", String(input.qtdParcelas)]);

  const HEADER = 220;
  const CARD_PAD = 56;
  const CARD_X = 40;
  const CARD_W = W - 80;
  const CONTENT_W = CARD_W - CARD_PAD * 2;
  const ROW_GAP = 28;

  // Pré-medir alturas de cada valor (quebra de linha)
  ctx.font = "500 34px system-ui, -apple-system, Segoe UI, Roboto";
  const rowHeights = rows.map(([, value]) => {
    const lines = wrapLines(ctx, value, CONTENT_W);
    return 30 + lines.length * 42 + ROW_GAP; // label + linhas + gap
  });

  const CONFIRM_H = 180;
  const cardH = CARD_PAD + CONFIRM_H + rowHeights.reduce((a, b) => a + b, 0) + CARD_PAD;
  const H = HEADER + cardH + 120;

  canvas.width = W;
  canvas.height = H;
  const c = canvas.getContext("2d")!;

  // Fundo (cinza claro tipo Google Forms)
  c.fillStyle = "#f0ebf8";
  c.fillRect(0, 0, W, H);

  // Cabeçalho roxo tipo Google Forms
  c.fillStyle = "#673ab7";
  roundRectPath(c, CARD_X, 40, CARD_W, HEADER - 40, [16, 16, 0, 0]);
  c.fill();

  c.fillStyle = "#ffffff";
  c.font = "500 42px system-ui, -apple-system, Segoe UI, Roboto";
  c.fillText("DESCRITIVO NEGOCIAÇÃO", CARD_X + CARD_PAD, 130);
  c.font = "400 24px system-ui, -apple-system, Segoe UI, Roboto";
  c.fillStyle = "rgba(255,255,255,0.85)";
  c.fillText("Formulário", CARD_X + CARD_PAD, 175);

  // Cartão branco de confirmação
  c.fillStyle = "#ffffff";
  roundRectPath(c, CARD_X, HEADER, CARD_W, cardH, [0, 0, 16, 16]);
  c.fill();

  // "Sua resposta foi registrada."
  c.fillStyle = "#202124";
  c.font = "500 40px system-ui, -apple-system, Segoe UI, Roboto";
  c.fillText("Sua resposta foi registrada.", CARD_X + CARD_PAD, HEADER + CARD_PAD + 30);

  // Divisor
  c.fillStyle = "#e0e0e0";
  c.fillRect(CARD_X + CARD_PAD, HEADER + CARD_PAD + 80, CONTENT_W, 2);

  // Linhas com dados enviados
  let y = HEADER + CARD_PAD + CONFIRM_H;
  for (const [label, value] of rows) {
    c.fillStyle = "#5f6368";
    c.font = "500 22px system-ui, -apple-system, Segoe UI, Roboto";
    c.fillText(label, CARD_X + CARD_PAD, y);
    c.fillStyle = "#202124";
    c.font = "500 34px system-ui, -apple-system, Segoe UI, Roboto";
    const lines = wrapLines(c, value, CONTENT_W);
    let ly = y + 42;
    for (const line of lines) {
      c.fillText(line, CARD_X + CARD_PAD, ly);
      ly += 42;
    }
    y = ly + ROW_GAP - 12;
  }

  // Rodapé
  c.fillStyle = "#5f6368";
  c.font = "400 22px system-ui, -apple-system, Segoe UI, Roboto";
  c.fillText("Enviado pelo app GPVA", CARD_X + CARD_PAD, HEADER + cardH + 60);

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Falha ao gerar imagem"))), "image/png");
  });
}

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const test = line ? line + " " + w : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  radii: [number, number, number, number],
) {
  const [tl, tr, br, bl] = radii;
  ctx.beginPath();
  ctx.moveTo(x + tl, y);
  ctx.lineTo(x + w - tr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + tr);
  ctx.lineTo(x + w, y + h - br);
  ctx.quadraticCurveTo(x + w, y + h, x + w - br, y + h);
  ctx.lineTo(x + bl, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - bl);
  ctx.lineTo(x, y + tl);
  ctx.quadraticCurveTo(x, y, x + tl, y);
  ctx.closePath();
}

/**
 * Compartilha a imagem via Web Share API (WhatsApp aparece como opção no Android/iOS).
 * Se não houver suporte a arquivos, baixa o PNG e abre o WhatsApp Web com um texto.
 * Retorna true se algo foi disparado, false se cancelado/erro.
 */
export async function shareNegotiation(input: NegotiationSubmission): Promise<boolean> {
  const blob = await buildNegotiationImage(input);
  const file = new File([blob], `negociacao-${input.matricula}.png`, { type: "image/png" });

  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.canShare && nav.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: "Descritivo negociação" });
      return true;
    } catch {
      return false;
    }
  }

  // Fallback: baixa a imagem e abre o WhatsApp Web
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);

  const text = encodeURIComponent(
    `Descritivo negociação — matrícula ${input.matricula}. Anexe a imagem baixada.`,
  );
  window.open(`https://wa.me/?text=${text}`, "_blank");
  return true;
}
