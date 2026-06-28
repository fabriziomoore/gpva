import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuthSession } from "@/hooks/use-auth";
import { useTeam } from "@/hooks/use-team";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Loader2, Play, FileText } from "lucide-react";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDateBR } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/")({
  head: () => ({ meta: [{ title: "Início — GPVA" }] }),
  component: HomePage,
});

function HomePage() {
  const navigate = useNavigate();
  const { userId } = useAuthSession();
  const { data: team, isLoading } = useTeam(userId);
  const qc = useQueryClient();
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    if (team && !team.onboarded) navigate({ to: "/onboarding" });
  }, [team, navigate]);

  const openShift = useQuery({
    queryKey: ["open-shift", userId],
    enabled: !!userId && !!team?.onboarded,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shifts")
        .select("id,started_at,status")
        .eq("status", "open")
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const lastClosed = useQuery({
    queryKey: ["last-closed-shift", userId],
    enabled: !!userId && !!team?.onboarded,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shifts")
        .select("id,started_at")
        .eq("status", "closed")
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  async function startShift() {
    if (!userId) return;
    setStarting(true);
    try {
      if (openShift.data) {
        navigate({ to: "/shift" });
        return;
      }
      const { error } = await supabase.from("shifts").insert({
        team_id: userId,
        variable_rate_snapshot: team?.variable_rate ?? 7,
      });
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["open-shift", userId] });
      navigate({ to: "/shift" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao iniciar");
    } finally {
      setStarting(false);
    }
  }

  const today = useMemo(() => formatDateBR(new Date()), []);

  const titleNode = (
    <div className="w-[calc(100vw-2rem)] max-w-[27rem]">
      <svg
        viewBox="0 0 360 22"
        preserveAspectRatio="xMidYMid meet"
        className="block h-auto w-full"
        role="img"
        aria-label="GPVA - Gestão de Produtividade e Variável Autônoma"
      >
        <text x="0" y="17" fontSize="18" fontWeight="700" fill="currentColor">
          GPVA
          <tspan fontSize="11" fontWeight="500" className="fill-muted-foreground" dx="4">
            - GESTÃO DE PRODUTIVIDADE E VARIÁVEL AUTÔNOMA
          </tspan>
        </text>
      </svg>
    </div>
  );

  if (isLoading) {
    return (
      <AppShell title={titleNode}>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title={titleNode}>
      <div className="space-y-6">
        <div className="rounded-2xl border border-border bg-card p-5">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Equipe</p>
          <p className="mt-1 text-3xl font-bold tracking-tight">{team?.team_name}</p>
          <p className="mt-1 text-sm text-muted-foreground">{today}</p>
          {team?.supervisor && (
            <p className="mt-3 text-sm text-muted-foreground">
              Supervisor: <span className="text-foreground">{team.supervisor}</span>
              <br />
              Líder: <span className="text-foreground">{team.leader}</span>
            </p>
          )}
        </div>

        <Button
          onClick={startShift}
          disabled={starting}
          className="h-24 w-full rounded-2xl text-xl font-bold shadow-lg"
        >
          {starting ? (
            <Loader2 className="size-7 animate-spin" />
          ) : openShift.data ? (
            <>
              <Play className="mr-2 size-7" /> Continuar Expediente
            </>
          ) : (
            <>
              <Play className="mr-2 size-7" /> Iniciar Expediente
            </>
          )}
        </Button>

        {lastClosed.data && (
          <Link
            to="/shift/$id/report"
            params={{ id: lastClosed.data.id }}
            className="flex items-center justify-between rounded-xl border border-border bg-card p-4 hover:bg-accent"
          >
            <div className="flex items-center gap-3">
              <FileText className="size-5 text-primary" />
              <div>
                <p className="text-sm font-medium">Último relatório</p>
                <p className="text-xs text-muted-foreground">
                  {formatDateBR(lastClosed.data.started_at)}
                </p>
              </div>
            </div>
            <span className="text-xs text-muted-foreground">Abrir →</span>
          </Link>
        )}
      </div>
    </AppShell>
  );
}