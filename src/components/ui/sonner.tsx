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
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-muted-foreground",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
