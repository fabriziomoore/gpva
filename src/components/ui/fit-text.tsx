import { useLayoutEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Texto numa linha só que nunca é cortado: se não couber na largura
 * disponível, a fonte diminui só o necessário pra caber inteiro (sem "…").
 * O tamanho base vem do elemento pai (classes text-* de quem usa); aqui só
 * se aplica um fator de redução sobre ele.
 */
export function FitText({ children, className }: { children: ReactNode; className?: string }) {
  const outerRef = useRef<HTMLSpanElement>(null);
  const innerRef = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) return;
    const fit = () => {
      inner.style.setProperty("--fit", "1");
      const avail = outer.clientWidth;
      const need = inner.scrollWidth;
      // Folga de 1px pra arredondamento de subpixel não deixar corte.
      if (avail > 0 && need > avail) inner.style.setProperty("--fit", String((avail - 1) / need));
    };
    fit();
    // Recalcula quando a largura muda (rotação, tela) e quando a fonte Inter
    // termina de carregar (muda a largura do texto).
    const ro = new ResizeObserver(fit);
    ro.observe(outer);
    void document.fonts?.ready.then(fit);
    return () => ro.disconnect();
  });

  return (
    <span ref={outerRef} className={cn("block min-w-0 overflow-hidden whitespace-nowrap", className)}>
      <span ref={innerRef} className="inline-block align-bottom" style={{ fontSize: "calc(1em * var(--fit, 1))" }}>
        {children}
      </span>
    </span>
  );
}
