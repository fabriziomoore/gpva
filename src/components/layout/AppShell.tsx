import type { ReactNode } from "react";
import { SyncIndicator } from "./SyncIndicator";
import { SideMenu } from "./SideMenu";

export function AppShell({
  title,
  children,
  right,
  showSync = true,
}: {
  title?: ReactNode;
  children: ReactNode;
  right?: ReactNode;
  showBack?: boolean;
  showSync?: boolean;
}) {
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80 pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex max-w-md items-center gap-2 px-4 py-3">
          <SideMenu />
          <h1 className="min-w-0 flex-1 overflow-hidden text-sm font-semibold tracking-tight sm:text-base">{title ?? "GPVA"}</h1>
          {right}
        </div>
        {showSync ? <SyncIndicator /> : <div className="h-[2px] w-full bg-border/60" />}
      </header>
      <main className="mx-auto max-w-md px-4 pt-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">{children}</main>
    </div>
  );
}