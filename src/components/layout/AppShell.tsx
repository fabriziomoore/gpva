import type { ReactNode } from "react";
import { useRouter } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BottomNav } from "./BottomNav";

export function AppShell({
  title,
  children,
  right,
  showBack = true,
}: {
  title?: ReactNode;
  children: ReactNode;
  right?: ReactNode;
  showBack?: boolean;
}) {
  const router = useRouter();
  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="sticky top-0 z-30 border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
        <div className="mx-auto flex max-w-md items-center gap-2 px-4 py-3">
          {showBack && (
            <Button
              variant="ghost"
              size="icon"
              className="-ml-2 size-8 shrink-0"
              onClick={() => router.history.back()}
              aria-label="Voltar"
            >
              <ArrowLeft className="size-5" />
            </Button>
          )}
          <h1 className="min-w-0 flex-1 text-lg font-semibold tracking-tight">{title ?? "GPVA"}</h1>
          {right}
        </div>
      </header>
      <main className="mx-auto max-w-md px-4 py-4">{children}</main>
      <BottomNav />
    </div>
  );
}