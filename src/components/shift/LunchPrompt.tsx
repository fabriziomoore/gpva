import { useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useAuthSession } from "@/hooks/use-auth";
import { getLocalDB } from "@/lib/db/local-db";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
} from "@/components/ui/alert-dialog";
import { LUNCH_BREAK_MIN } from "@/lib/report";
import { useLunchStatus, setLunchTaken, dismissLunchPrompt } from "@/lib/lunch-status";

// Reavalia o tempo desde a última O.S. com o app aberto.
const TICK_MS = 30_000;

/**
 * Pergunta "A equipe já almoçou?" em qualquer tela do app, enquanto houver
 * expediente aberto, quando já passou mais de 1h desde a última O.S.
 * registrada — ao abrir o app, ao voltar do segundo plano ou com o app
 * aberto. Também cobre o caso de a O.S. seguinte ter sido registrada mais de
 * 1h depois da anterior sem a pergunta ter sido respondida.
 *
 * "Não" vale só para aquele intervalo (identificado pela O.S. que o abriu);
 * depois de uma nova O.S., uma nova pausa longa pergunta de novo.
 */
export function LunchPrompt() {
  const { userId } = useAuthSession();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const tick = () => setNow(Date.now());
    const id = window.setInterval(tick, TICK_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  const openShift = useLiveQuery(async () => {
    if (!userId) return null;
    const db = getLocalDB();
    const row = await db.shifts
      .where("[team_id+status+started_at]")
      .between([userId, "open", ""], [userId, "open", "￿"])
      .last();
    return row ?? null;
  }, [userId]);

  const services = useLiveQuery(async () => {
    if (!openShift?.id) return [];
    const db = getLocalDB();
    const rows = await db.services.where("shift_id").equals(openShift.id).toArray();
    rows.sort((a, b) => (b.created_at > a.created_at ? 1 : -1));
    return rows;
  }, [openShift?.id]);

  const lunch = useLunchStatus(openShift?.id);

  // Id da O.S. que abriu o intervalo longo ainda não respondido, ou null.
  const gapStartId = useMemo(() => {
    const list = services ?? [];
    if (!openShift || lunch.taken || list.length === 0) return null;
    const lastAt = new Date(list[0].created_at).getTime();
    if ((now - lastAt) / 60000 > LUNCH_BREAK_MIN && !lunch.dismissed.includes(list[0].id)) {
      return list[0].id;
    }
    if (list.length >= 2) {
      const prevAt = new Date(list[1].created_at).getTime();
      if ((lastAt - prevAt) / 60000 > LUNCH_BREAK_MIN && !lunch.dismissed.includes(list[1].id)) {
        return list[1].id;
      }
    }
    return null;
  }, [services, openShift, lunch, now]);

  if (!openShift || !gapStartId) return null;

  return (
    <AlertDialog open>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>A equipe já almoçou?</AlertDialogTitle>
          <AlertDialogDescription>
            Passou mais de 1h sem registro de O.S. Se a equipe já almoçou, 1h será descontada do
            tempo médio entre O.S.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-col gap-2 sm:flex-row">
          <Button variant="outline" onClick={() => dismissLunchPrompt(openShift.id, gapStartId)}>
            Não
          </Button>
          <Button onClick={() => setLunchTaken(openShift.id)}>Sim</Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
