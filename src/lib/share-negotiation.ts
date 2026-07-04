// Gera uma imagem PNG com o descritivo da negociação e compartilha via Web Share API.
// Fallback: se o navegador não aceitar compartilhar arquivos (ex.: desktop), baixa a imagem
// e abre o WhatsApp Web com um texto pronto para o usuário anexar o PNG baixado.

import { formatMoneyBR, type NegotiationSubmission } from "./google-form";

function buildCaption(input: NegotiationSubmission): string {
  const lines: string[] = ["*DESCRITIVO NEGOCIAÇÃO*"];
  lines.push(`Matrícula: ${input.matricula}`);
  lines.push(`Forma de pagamento: ${input.paymentMethod}`);
  if (input.valorAVista != null) lines.push(`Valor à vista: ${formatMoneyBR(input.valorAVista)}`);
  if (input.valorTotalParcelado != null) {
    lines.push(`Valor total parcelado: ${formatMoneyBR(input.valorTotalParcelado)}`);
  }
  if (input.qtdParcelas != null) lines.push(`Qtd parcelas: ${input.qtdParcelas}`);
  return lines.join("\n");
}

// Reproduz fielmente a tela de confirmação do Google Forms (mobile).
// Proporção e cores tiradas do print real.
export async function buildNegotiationImage(_input: NegotiationSubmission): Promise<Blob> {
  const W = 720;
  const H = 1600;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const c = canvas.getContext("2d")!;

  // Fundo lavanda do Google Forms
  c.fillStyle = "#f0ebf8";
  c.fillRect(0, 0, W, H);

  // Cartão branco
  const CARD_X = 24;
  const CARD_Y = 24;
  const CARD_W = W - CARD_X * 2;
  const CARD_H = 470;
  const RADIUS = 12;

  // Sombra sutil
  c.save();
  c.shadowColor = "rgba(60, 64, 67, 0.15)";
  c.shadowBlur = 6;
  c.shadowOffsetY = 1;
  c.fillStyle = "#ffffff";
  roundRect(c, CARD_X, CARD_Y, CARD_W, CARD_H, RADIUS);
  c.fill();
  c.restore();

  // Barra roxa superior do cartão
  c.fillStyle = "#673ab7";
  roundRect(c, CARD_X, CARD_Y, CARD_W, 14, RADIUS, "top");
  c.fill();

  // "NEGOCIAÇÃO"
  c.fillStyle = "#202124";
  c.font = '400 46px "Roboto", "Segoe UI", system-ui, sans-serif';
  c.fillText("NEGOCIAÇÃO", CARD_X + 40, CARD_Y + 110);

  // "Sua resposta foi registrada."
  c.fillStyle = "#202124";
  c.font = '400 24px "Roboto", "Segoe UI", system-ui, sans-serif';
  c.fillText("Sua resposta foi registrada.", CARD_X + 40, CARD_Y + 175);

  // "Enviar outra resposta" (link roxo sublinhado)
  const link = "Enviar outra resposta";
  c.fillStyle = "#5c2f9e";
  c.font = '400 22px "Roboto", "Segoe UI", system-ui, sans-serif';
  const linkX = CARD_X + 40;
  const linkY = CARD_Y + 260;
  c.fillText(link, linkX, linkY);
  const linkW = c.measureText(link).width;
  c.fillRect(linkX, linkY + 5, linkW, 1);

  // Rodapé cinza abaixo do cartão
  const footerY = CARD_Y + CARD_H + 60;
  c.fillStyle = "#5f6368";
  c.font = '400 20px "Roboto", "Segoe UI", system-ui, sans-serif';
  centerText(c, "Este conteúdo não foi criado nem aprovado pelo Google. -", W / 2, footerY);
  centerText(c, "Termos de Serviço - Política de Privacidade", W / 2, footerY + 32);
  centerText(c, "Este formulário parece suspeito? Denunciar", W / 2, footerY + 90);

  // "Google Formulários"
  const gy = footerY + 180;
  c.font = '400 40px "Roboto", "Segoe UI", system-ui, sans-serif';
  const label1 = "Google";
  const label2 = " Formulários";
  c.fillStyle = "#5f6368";
  const w1 = c.measureText(label1).width;
  const w2 = c.measureText(label2).width;
  const gx = (W - (w1 + w2)) / 2;
  // "Google" colorido
  const colors = ["#4285f4", "#ea4335", "#fbbc04", "#4285f4", "#34a853", "#ea4335"];
  let x = gx;
  for (let i = 0; i < label1.length; i++) {
    c.fillStyle = colors[i];
    c.fillText(label1[i], x, gy);
    x += c.measureText(label1[i]).width;
  }
  c.fillStyle = "#5f6368";
  c.fillText(label2, x, gy);

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Falha ao gerar imagem"))), "image/png");
  });
}

function centerText(ctx: CanvasRenderingContext2D, text: string, cx: number, y: number) {
  const w = ctx.measureText(text).width;
  ctx.fillText(text, cx - w / 2, y);
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  side: "all" | "top" = "all",
) {
  const tl = r;
  const tr = r;
  const br = side === "top" ? 0 : r;
  const bl = side === "top" ? 0 : r;
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
  const caption = buildCaption(input);

  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.canShare && nav.canShare({ files: [file] })) {
    try {
      await navigator.share({
        files: [file],
        title: "Descritivo negociação",
        text: caption,
      });
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

  window.open(`https://wa.me/?text=${encodeURIComponent(caption)}`, "_blank");
  return true;
}
