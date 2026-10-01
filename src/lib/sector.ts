// Setor de Corte e Religa, identificado pelo nome (sem acento/caixa) —
// usado nas regras específicas desse setor (pergunta do almoço, projeção de
// serviços até as 16h no card de tempo do Expediente).
export function isCorteSector(nome: string | null | undefined): boolean {
  if (!nome) return false;
  return nome
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .includes("corte");
}
