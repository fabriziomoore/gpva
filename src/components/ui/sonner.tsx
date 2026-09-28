import { Toaster as Sonner } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      className="toaster group"
      position="top-center"
      offset={{
        top: "calc(env(safe-area-inset-top, 0px) + 8px)",
        right: 24,
        bottom: 24,
        left: 24,
      }}
      mobileOffset={{
        top: "calc(env(safe-area-inset-top, 0px) + 8px)",
        right: 16,
        bottom: 16,
        left: 16,
      }}
      style={
        {
          "--width": "min(92vw, 480px)",
          "--mobile-width": "min(92vw, 480px)",
          // Sem interação nenhuma (não é só estético): no touch, o hover
          // sintético do sonner ao tocar no toast prendia o estado
          // "expanded" sem nunca disparar mouseleave, pausando o
          // auto-dismiss pra sempre. Sem pointer events, esse toque nunca
          // chega no sonner.
          pointerEvents: "none",
        } as React.CSSProperties
      }
      toastOptions={{
        // Cabe dentro da faixa do cabeçalho (~56px) sem invadir a linha de
        // sincronismo logo abaixo dele — antes o offset de 56px + a altura
        // padrão do toast empurravam o aviso pra cobrir exatamente a linha.
        // O CSS do sonner define background/cor/borda via var(--normal-*)
        // com especificidade maior que uma classe do Tailwind (duas
        // seletoras de atributo), então só muda de verdade sobrescrevendo
        // essas variáveis (ou a propriedade) aqui — classes como bg-black
        // não tinham efeito nenhum.
        style: {
          width: "min(92vw, 480px)",
          maxWidth: "calc(100vw - 32px)",
          minHeight: "auto",
          padding: "10px 16px",
          border: "none",
          "--normal-bg": "#2563eb",
          "--normal-text": "#ffffff",
        } as React.CSSProperties,
        classNames: {
          toast: "group toast group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-white/80",
          actionButton: "group-[.toast]:bg-white group-[.toast]:text-primary",
          cancelButton: "group-[.toast]:bg-white/15 group-[.toast]:text-white",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
