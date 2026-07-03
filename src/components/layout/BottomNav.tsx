import { Link } from "@tanstack/react-router";
import { Home, BarChart3, Wallet, Settings } from "lucide-react";
import { useAuthSession } from "@/hooks/use-auth";
import { useIsLeader } from "@/hooks/use-is-leader";

const items = [
  { to: "/" as const, label: "Início", icon: Home, exact: true },
  { to: "/productivity" as const, label: "Produtividade", icon: BarChart3, exact: false },
  { to: "/variable" as const, label: "Variável", icon: Wallet, exact: false },
  { to: "/settings" as const, label: "Config", icon: Settings, exact: false },
];

export function BottomNav() {
  const { userId } = useAuthSession();
  const isLeader = useIsLeader(userId);
  if (isLeader.data === true) return null;
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80 pb-[env(safe-area-inset-bottom)]">
      <ul className="mx-auto flex max-w-md items-stretch justify-around">
        {items.map(({ to, label, icon: Icon, exact }) => (
          <li key={to} className="flex-1">
            <Link
              to={to}
              className="flex flex-col items-center gap-1 py-3 text-xs text-muted-foreground transition-colors data-[status=active]:text-primary"
              activeOptions={{ exact }}
            >
              <Icon className="size-5" />
              <span>{label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}