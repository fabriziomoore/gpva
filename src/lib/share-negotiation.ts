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
  const H = 1350;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  // Fundo
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, "#0b1220");
  grad.addColorStop(1, "#111827");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Cartão
  const cx = 60;
  const cy = 60;
  const cw = W - 120;
  const ch = H - 120;
  ctx.fillStyle = "#ffffff";
  const r = 32;
  ctx.beginPath();
  ctx.moveTo(cx + r, cy);
  ctx.arcTo(cx + cw, cy, cx + cw, cy + ch, r);
  ctx.arcTo(cx + cw, cy + ch, cx, cy + ch, r);
  ctx.arcTo(cx, cy + ch, cx, cy, r);
  ctx.arcTo(cx, cy, cx + cw, cy, r);
  ctx.closePath();
  ctx.fill();

  // Título
  ctx.fillStyle = "#0f172a";
  ctx.font = "bold 56px system-ui, -apple-system, Segoe UI, Roboto";
  ctx.fillText("DESCRITIVO NEGOCIAÇÃO", cx + 48, cy + 110);

  // Linha
  ctx.fillStyle = "#e5e7eb";
  ctx.fillRect(cx + 48, cy + 140, cw - 96, 3);

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

  let y = cy + 220;
  for (const [label, value] of rows) {
    ctx.fillStyle = "#6b7280";
    ctx.font = "500 28px system-ui, -apple-system, Segoe UI, Roboto";
    ctx.fillText(label, cx + 48, y);
    ctx.fillStyle = "#0f172a";
    ctx.font = "bold 44px system-ui, -apple-system, Segoe UI, Roboto";
    y = drawWrapped(ctx, value, cx + 48, y + 50, cw - 96, 52) + 40;
  }

  // Rodapé
  ctx.fillStyle = "#94a3b8";
  ctx.font = "500 24px system-ui, -apple-system, Segoe UI, Roboto";
  ctx.fillText("Enviado pelo app GPVA", cx + 48, cy + ch - 40);

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Falha ao gerar imagem"))), "image/png");
  });
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
