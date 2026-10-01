import { formatBRL } from "@/lib/format";

/**
 * Linha de rodapé de um card de negociação: modo de pagamento à esquerda,
 * valor negociado à direita (mesmo padrão dos cards do Expediente). Usada
 * na Consulta e no Perfil da equipe, pra os dois ficarem idênticos.
 *
 * O detalhe quebra linha em vez de cortar com "…" (pagamento misto não cabe
 * numa linha), mas só entre as partes — nunca no meio de um valor.
 */
export function NegotiationPaymentLine({
  payment_methods,
  valor_a_vista,
  valor_parcelado,
  qtd_parcelas,
  negotiated_value,
}: {
  payment_methods: string[] | null;
  valor_a_vista: number | null;
  valor_parcelado: number | null;
  qtd_parcelas: number | null;
  negotiated_value: number | null;
}) {
  const parts = payment_methods?.length
    ? [
        payment_methods.join(" + "),
        // "à vista" só é informação nova quando o pagamento é misto (tem
        // parcelado também) — sozinho, repete o próprio valor do card.
        valor_a_vista && valor_parcelado ? `à vista ${formatBRL(valor_a_vista)}` : null,
        valor_parcelado
          ? `parcelado ${formatBRL(valor_parcelado)}${qtd_parcelas ? ` em ${qtd_parcelas}x` : ""}`
          : null,
      ].filter((p): p is string => !!p)
    : [];

  return (
    <div className="mt-1 flex items-end justify-between gap-2">
      <span className="min-w-0 flex-1 break-words text-[11px] text-muted-foreground">
        {parts.flatMap((part, i) => [
          i > 0 ? " " : null,
          <span key={i} className="whitespace-nowrap">
            {part}
            {i < parts.length - 1 ? "\u00A0·" : ""}
          </span>,
        ])}
      </span>
      <span className="shrink-0 text-sm font-bold text-success">{formatBRL(Number(negotiated_value) || 0)}</span>
    </div>
  );
}
