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
        } as React.CSSProperties
      }
      toastOptions={{
        // Cabe dentro da faixa do cabeçalho (~56px) sem invadir a linha de
        // sincronismo logo abaixo dele — antes o offset de 56px + a altura
        // padrão do toast empurravam o aviso pra cobrir exatamente a linha.
        style: {
          width: "min(92vw, 480px)",
          maxWidth: "calc(100vw - 32px)",
          minHeight: "auto",
          padding: "10px 16px",
        },
        classNames: {
          // Fundo sempre escuro (preto) e texto sempre branco, nos dois
          // temas — no claro, bg-background/text-foreground davam um toast
          // branco com texto escuro, destoando do resto do app.
          toast:
            "group toast group-[.toaster]:bg-black group-[.toaster]:text-white group-[.toaster]:border-white/10 group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-white/70",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
