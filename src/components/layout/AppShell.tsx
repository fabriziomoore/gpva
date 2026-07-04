import type { ReactNode } from "react";
import { SyncIndicator } from "./SyncIndicator";
import { SideMenu } from "./SideMenu";

export function AppShell({
  title,
  children,
  right,
}: {
  title?: ReactNode;
  children: ReactNode;
  right?: ReactNode;
  showBack?: boolean;
}) {
  return (
    <div className="min-h-screen bg-background pb-6">
      <header className="sticky top-0 z-30 bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80 pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex max-w-md items-center gap-2 px-4 py-3">
          <SideMenu />
          <h1 className="min-w-0 flex-1 overflow-hidden text-sm font-semibold tracking-tight sm:text-base">{title ?? "GPVA"}</h1>
          {right}
        </div>
        <SyncIndicator />
      </header>
      <main className="mx-auto max-w-md px-4 py-4">{children}</main>
    </div>
  );
}