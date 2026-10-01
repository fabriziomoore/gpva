import { useEffect, useRef } from "react";

// Botão "voltar" do Android no APK. O APK usa histórico em memória do
// router, então o evento popstate do navegador nunca dispara lá — as telas
// que fecham um detalhe "no lugar" (Perfil no Ranking, histórico do cliente,
// seções do admin) ou confirmam a saída (Home) se registram aqui também. O
// handler nativo (mobile/src/native.ts) chama o mais recente primeiro; se
// nenhum tratar, volta uma tela no router.

type BackHandler = () => void;

const stack: { current: BackHandler }[] = [];

/** Chama o handler registrado mais recente. Retorna true se algum tratou. */
export function runBackHandler(): boolean {
  const top = stack[stack.length - 1];
  if (!top) return false;
  top.current();
  return true;
}

/** Enquanto `active`, o botão voltar do Android chama `handler`. */
export function useBackHandler(active: boolean, handler: BackHandler): void {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    if (!active) return;
    const entry = { current: () => ref.current() };
    stack.push(entry);
    return () => {
      const i = stack.lastIndexOf(entry);
      if (i >= 0) stack.splice(i, 1);
    };
  }, [active]);
}
