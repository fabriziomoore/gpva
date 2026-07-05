import { useMemo, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Link, useNavigate } from "@tanstack/react-router";
import { Home, BarChart3, Wallet, Settings, Menu, X, LogOut } from "lucide-react";
import { useAuthSession } from "@/hooks/use-auth";
import { useIsLeader } from "@/hooks/use-is-leader";
import { supabase } from "@/integrations/supabase/client";
import { ExitConfirmDialog } from "@/components/layout/ExitConfirmDialog";

const teamItems = [
  { to: "/" as const, label: "Início", icon: Home, exact: true },
  { to: "/productivity" as const, label: "Produtividade", icon: BarChart3, exact: false },
  { to: "/variable" as const, label: "Variável", icon: Wallet, exact: false },
  { to: "/settings" as const, label: "Configurações", icon: Settings, exact: false },
];

const leaderItems = [
  { to: "/leader" as const, label: "Painel do Líder", icon: BarChart3, exact: true },
  { to: "/leader-config" as const, label: "Configuração", icon: Settings, exact: false },
];

export function SideMenu() {
  const { userId } = useAuthSession();
  const isLeader = useIsLeader(userId);
  const [open, setOpen] = useState(false);
  const [exitOpen, setExitOpen] = useState(false);
  const navigate = useNavigate();
  async function confirmSignOut() {
    setExitOpen(false);
    setOpen(false);
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  }
  const items = useMemo(
    () => (isLeader.data === true ? leaderItems : teamItems),
    [isLeader.data],
  );
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger
        aria-label="Abrir menu"
        className="-ml-1 inline-flex size-10 items-center justify-center rounded-lg text-foreground transition-colors hover:bg-muted"
      >
        <Menu className="size-6" />
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[9998] bg-background/40 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content
          className="fixed inset-y-0 left-0 z-[9999] flex h-full w-72 max-w-[80vw] flex-col border-r border-border bg-card/40 backdrop-blur-2xl backdrop-saturate-150 shadow-2xl transition ease-in-out data-[state=closed]:duration-300 data-[state=open]:duration-500 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]"
        >
          <Dialog.Title className="sr-only">Menu</Dialog.Title>
          <div className="flex items-center justify-between px-4 py-4">
            <span className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Menu
            </span>
            <Dialog.Close
              aria-label="Fechar menu"
              className="inline-flex size-9 items-center justify-center rounded-lg bg-destructive text-white hover:bg-destructive/90"
            >
              <X className="size-5" />
            </Dialog.Close>
          </div>
          <nav className="flex-1 overflow-y-auto px-2">
            <ul className="space-y-1">
              {items.map(({ to, label, icon: Icon, exact }) => (
                <li key={to}>
                  <Link
                    to={to}
                    activeOptions={{ exact }}
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground data-[status=active]:bg-primary/10 data-[status=active]:text-primary"
                  >
                    <Icon className="size-5" />
                    <span>{label}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <button
            type="button"
            onClick={() => setExitOpen(true)}
            className="flex w-full items-center gap-3 border-t border-border bg-destructive px-5 py-4 text-left text-sm font-semibold text-destructive-foreground transition-colors hover:bg-destructive/90"
          >
            <LogOut className="size-5" />
            <span>Sair</span>
          </button>
        </Dialog.Content>
      </Dialog.Portal>
      <ExitConfirmDialog open={exitOpen} onOpenChange={setExitOpen} onConfirm={confirmSignOut} />
    </Dialog.Root>
  );
}