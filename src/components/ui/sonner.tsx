import { Toaster as Sonner } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      className="toaster group"
      position="top-center"
      offset="calc(env(safe-area-inset-top, 0px) + 56px)"
      mobileOffset="calc(env(safe-area-inset-top, 0px) + 56px)"
      style={
        {
          "--width": "min(92vw, 480px)",
          "--mobile-width": "min(92vw, 480px)",
        } as React.CSSProperties
      }
      toastOptions={{
        style: { width: "min(92vw, 480px)", maxWidth: "92vw", margin: "0 auto" },
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg group-[.toaster]:w-[min(92vw,480px)] group-[.toaster]:max-w-[92vw] group-[.toaster]:mx-auto group-[.toaster]:left-1/2 group-[.toaster]:-translate-x-1/2",
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
