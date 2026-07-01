import type { ReactNode } from "react";
import { BottomNav } from "./BottomNav";
import { SyncIndicator } from "./SyncIndicator";
import { PullToRefresh } from "./PullToRefresh";

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
    <div className="min-h-screen bg-background pb-24">
      <header className="sticky top-0 z-30 bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80 pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex max-w-md items-center gap-2 px-4 py-3">
          <h1 className="min-w-0 flex-1 text-lg font-semibold tracking-tight">{title ?? "GPVA"}</h1>
          {right}
        </div>
        <SyncIndicator />
      </header>
      <PullToRefresh>
        <main className="mx-auto max-w-md px-4 py-4">{children}</main>
      </PullToRefresh>
      <BottomNav />
    </div>
  );
}