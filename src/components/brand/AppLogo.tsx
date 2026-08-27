import { cn } from "@/lib/utils";
import lightLogoUrl from "@/assets/acp-logo-light-bundled.png?url";
import darkLogoUrl from "@/assets/acp-logo-dark-bundled.png?url";

export interface AppLogoProps extends React.ComponentProps<"div"> {
  /** Texto alternativo acessível da marca. */
  alt?: string;
}

/**
 * Logo oficial do ACP.
 * Troca automaticamente entre a arte de modo claro (texto preto) e a de
 * modo escuro (texto branco) usando a estratégia de classe `.dark`.
 * Ambas as artes têm recorte idêntico, garantindo alinhamento perfeito.
 */
export function AppLogo({ className, alt = "ACP — Assistente de Campo e Produtividade", ...props }: AppLogoProps) {
  return (
    <div className={cn("relative w-full", className)} {...props}>
      <img src={lightLogoUrl} alt={alt} className="block h-auto w-full dark:hidden" />
      <img src={darkLogoUrl} alt="" aria-hidden="true" className="hidden h-auto w-full dark:block" />
    </div>
  );
}
