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
  headerOverride,
  headerClassName,
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
  /**
   * Quando definido, substitui a linha título/menu do cabeçalho (mesmo
   * elemento `<header>`, sem empilhar um painel novo por cima) — usado por
   * páginas que trocam o cabeçalho por uma barra de ações contextual (ex.:
   * editar/excluir item selecionado). Evita o artefato visual de dois
   * elementos fixed/sticky sobrepostos.
   */
  headerOverride?: ReactNode;
  /** Classe extra pro fundo do `<header>` quando `headerOverride` está ativo. */
  headerClassName?: string;
}) {
  const container = wide
    ? "mx-auto w-full max-w-md md:max-w-none md:px-6 lg:px-8"
    : "mx-auto max-w-md";
  // O <header> sticky nunca troca de classe — a classe dele é 100% fixa.
  // A cor do headerOverride troca só num <div> interno normal (fora do
  // sticky), porque trocar o fundo do próprio elemento sticky+blur deixava
  // a camada de composição do navegador com um resíduo da cor anterior por
  // trás dele por um instante.
  const headerBg = headerOverride ? (headerClassName ?? "bg-card") : "bg-card/95 supports-[backdrop-filter]:bg-card/80";
  return (
    <div className="min-h-screen bg-background">
      <header
        className="sticky top-0 z-30 backdrop-blur"
        style={{ paddingTop: "var(--safe-area-inset-top, env(safe-area-inset-top, 0px))" }}
      >
        <div className={headerBg}>
          {headerOverride ?? (
            <div className={cn("flex items-center gap-2 px-4 py-3", container)}>
              <SideMenu />
              <h1 className="min-w-0 flex-1 overflow-hidden text-sm font-semibold tracking-tight sm:text-base">{title ?? "ACP"}</h1>
              {right}
            </div>
          )}
        </div>
        {showSync ? <SyncIndicator /> : <div className="h-[2px] w-full bg-border/60" />}
      </header>
      <main className={cn("px-4 pt-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))]", container)}>{children}</main>
    </div>
  );
}