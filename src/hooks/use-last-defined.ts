import { useRef } from "react";

/**
 * Último valor não-nulo recebido. Pra diálogos/sheets cujo `open` vem de
 * `valor !== null`: ao fechar, o valor vira null antes da animação de saída
 * terminar, e o conteúdo lido dele sumia ou trocava de texto durante esses
 * ~150ms (um "card fantasma" piscando). Renderize o conteúdo a partir deste
 * valor e mantenha o `open` (e as ações) no valor original.
 */
export function useLastDefined<T>(value: T | null | undefined): T | null {
  const last = useRef<T | null>(value ?? null);
  if (value !== null && value !== undefined) last.current = value;
  return last.current;
}
