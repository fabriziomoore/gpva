// Compara o nome de um tipo de serviço com "Pós corte" (ignorando acento e
// caixa). "Pós corte" é o único tipo negociável que não soma pra "Variável
// Estimada" (R$/negociação), mesmo quando o técnico responde "Sim" à
// pergunta de negociação e o registro fica com is_negotiation=true.
export function isPosCorteName(name: string | null | undefined): boolean {
  if (!name) return false;
  return (
    name
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase()
      .trim() === "pos corte"
  );
}

// Complemento "Substituição de HD" — dispara a etapa extra de devolução de
// medidores (Forms da empresa) na tela de registro de serviço.
export function isHdSubstituicaoName(name: string | null | undefined): boolean {
  if (!name) return false;
  return (
    name
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase()
      .trim() === "substituicao de hd"
  );
}
