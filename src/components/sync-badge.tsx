import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useSyncStore } from "@/lib/sync/store";
import { cn } from "@/lib/utils";
import { netLog, useNetDiag } from "@/lib/sync/diagnostics";
import { useAuthSession } from "@/hooks/use-auth";
import { useUserRoles } from "@/hooks/use-user-roles";

/**
 * Faixa inferior de largura total exibida quando o app está offline, com
 * pendências ou sincronizando. Reserva espaço via a CSS var
 * `--sync-banner-h` para que botões flutuantes (ex.: Finalizar / + Serviço)
 * subam automaticamente enquanto ela estiver visível.
 */
export function SyncBadge() {
  const online = useSyncStore((s) => s.online);
  const pending = useSyncStore((s) => s.pending);
  const { userId } = useAuthSession();
  const { data: roles } = useUserRoles(userId);
  useEffect(() => {
    useNetDiag.getState().bump("syncBadgeRenders");
    netLog("SyncBadge", "render", { online, pending });
  });
  const [mounted, setMounted] = useState(false);
  const bannerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => setMounted(true), []);

  // Faixa exibida SOMENTE quando o dispositivo está offline E o usuário
  // pertence a uma equipe (ou é a conta de teste). Contas privilegiadas
  // (admin, líder, supervisor) NÃO veem a faixa. Sem sessão (tela de login)
  // também não exibe.
  const isPrivileged = Array.isArray(roles)
    ? roles.some((r) => r === "admin" || r === "leader" || r === "supervisor")
    : false;
  const visible = mounted && !online && !!userId && !isPrivileged;

  // Mantém outros elementos fixos sincronizados com a faixa offline usando a
  // altura real da faixa. Isso evita somar safe-area duas vezes no Android.
  useLayoutEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;

    if (!visible) {
      root.style.setProperty("--sync-banner-h", "0px");
      root.style.setProperty(
        "--sync-floating-bottom",
        "calc(env(safe-area-inset-bottom, 0px) + 1rem)",
      );
      return;
    }

    const updateOffset = () => {
      const height = bannerRef.current?.getBoundingClientRect().height ?? 0;
      root.style.setProperty("--sync-banner-h", `${height}px`);
      root.style.setProperty("--sync-floating-bottom", `calc(${height}px + 0.75rem)`);
    };

    updateOffset();
    const resizeObserver = new ResizeObserver(updateOffset);
    if (bannerRef.current) resizeObserver.observe(bannerRef.current);
    window.addEventListener("resize", updateOffset);
    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", updateOffset);
    };
  }, [visible]);

  if (!visible) return null;

  const label = pending > 0
    ? `MODO OFFLINE · ${pending} pendente${pending > 1 ? "s" : ""}`
    : "MODO OFFLINE";

  return (
    <div
      ref={bannerRef}
      role="status"
      aria-live="polite"
      className={cn(
        "pointer-events-none fixed inset-x-0 bottom-0 z-[9990]",
        "flex items-center justify-center bg-destructive",
        "px-4 pt-1.5 text-xs font-semibold text-destructive-foreground",
        "pb-[calc(env(safe-area-inset-bottom)+6px)]",
      )}
    >
      {label}
    </div>
  );
}