import { useLayoutEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Texto numa linha só que nunca é cortado: se não couber na largura
 * disponível, a fonte diminui só o necessário pra caber inteiro (sem "…").
 * O tamanho base vem do próprio elemento (classes text-* / style de quem
 * usa); aqui só se aplica um fator de redução sobre ele.
 *
 * Use sempre este componente pra "encolher até caber" — não reimplementar
 * com font-size em px calculado a partir do getComputedStyle: no WebView do
 * Android com a fonte do sistema aumentada (acessibilidade), o tamanho
 * medido já vem multiplicado e um px absoluto é multiplicado de novo, então
 * o texto continuava largo demais e era cortado. Com um fator relativo
 * (1em × fit) o aumento entra uma vez só, e mesmo assim a largura é medida
 * de novo depois de aplicar o fator, refinando até caber.
 */
export function FitText({
  children,
  className,
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  const outerRef = useRef<HTMLSpanElement>(null);
  const innerRef = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) return;
    const fit = () => {
      let factor = 1;
      inner.style.setProperty("--fit", "1");
      // Algumas passadas: aplica o fator, mede de novo e corrige o que
      // ainda sobrar (arredondamento, escala de fonte do sistema).
      for (let i = 0; i < 4; i++) {
        const avail = outer.clientWidth;
        const need = inner.scrollWidth;
        if (avail <= 0 || need <= avail) break;
        // Folga de 1px pra arredondamento de subpixel não deixar corte.
        factor *= (avail - 1) / need;
        inner.style.setProperty("--fit", String(factor));
      }
    };
    fit();
    // Recalcula quando a largura muda (rotação, tela) e quando a fonte
    // termina de carregar (muda a largura do texto).
    const ro = new ResizeObserver(fit);
    ro.observe(outer);
    void document.fonts?.ready.then(fit);
    return () => ro.disconnect();
  });

  return (
    <span ref={outerRef} className={cn("block min-w-0 overflow-hidden whitespace-nowrap", className)} style={style}>
      <span ref={innerRef} className="inline-block align-bottom" style={{ fontSize: "calc(1em * var(--fit, 1))" }}>
        {children}
      </span>
    </span>
  );
}
