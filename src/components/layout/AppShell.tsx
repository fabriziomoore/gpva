import type { ReactNode } from "react";
import { SyncIndicator } from "./SyncIndicator";
import { SideMenu } from "./SideMenu";
import { cn } from "@/lib/utils";

export function AppShell({
  title,
  children,
  right,
  showSync = true,
  wide = false,
}: {
  title?: ReactNode;
  children: ReactNode;
  right?: ReactNode;
  showBack?: boolean;
  showSync?: boolean;
  /**
   * Quando true, permite que o conteúdo ocupe a largura total da tela em
   * viewports md+ (versão web). No app Android o WebView sempre roda em
   * largura de celular, então esse flag não altera nada por lá.
   */
  wide?: boolean;
}) {
  const container = wide
    ? "mx-auto w-full max-w-md md:max-w-none md:px-6 lg:px-8"
    : "mx-auto max-w-md";
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
        <div className={cn("flex items-center gap-2 px-4 py-3", container)}>
          <SideMenu />
          <h1 className="min-w-0 flex-1 overflow-hidden text-sm font-semibold tracking-tight sm:text-base">{title ?? "ACP"}</h1>
          {right}
        </div>
        {showSync ? <SyncIndicator /> : <div className="h-[2px] w-full bg-border/60" />}
      </header>
      <main className={cn("px-4 pt-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))]", container)}>{children}</main>
    </div>
  );
}