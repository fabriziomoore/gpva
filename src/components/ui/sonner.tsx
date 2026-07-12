import { Toaster as Sonner } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      className="toaster group"
      position="top-center"
      offset={{
        top: "calc(env(safe-area-inset-top, 0px) + 56px)",
        right: 24,
        bottom: 24,
        left: 24,
      }}
      mobileOffset={{
        top: "calc(env(safe-area-inset-top, 0px) + 56px)",
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
        style: { width: "min(92vw, 480px)", maxWidth: "calc(100vw - 32px)" },
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
