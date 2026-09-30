import { useMemo } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useAuthSession } from "@/hooks/use-auth";
import { getLocalDB } from "@/lib/db/local-db";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogFooter,
} from "@/components/ui/alert-dialog";
import { LUNCH_BREAK_MIN } from "@/lib/report";
import { useLunchStatus, setLunchTaken, dismissLunchPrompt } from "@/lib/lunch-status";

/**
 * Pergunta "A equipe já almoçou?" logo depois de a equipe registrar a
 * primeira O.S. após mais de 1h sem registros (intervalo entre as duas O.S.
 * mais recentes do expediente aberto). Fica no layout autenticado pra
 * continuar aparecendo em qualquer tela até ser respondida.
 *
 * "Não" vale só para aquele intervalo (identificado pela O.S. que o abriu);
 * uma nova pausa longa depois pergunta de novo.
 */
export function LunchPrompt() {
  const { userId } = useAuthSession();

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
    if (!openShift || lunch.taken || list.length < 2) return null;
    const lastAt = new Date(list[0].created_at).getTime();
    const prevAt = new Date(list[1].created_at).getTime();
    if ((lastAt - prevAt) / 60000 <= LUNCH_BREAK_MIN) return null;
    if (lunch.dismissed.includes(list[1].id)) return null;
    return list[1].id;
  }, [services, openShift, lunch]);

  if (!openShift || !gapStartId) return null;

  return (
    <AlertDialog open>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle
            className="uppercase whitespace-nowrap"
            style={{ fontSize: "clamp(0.75rem, 4.5vw, 1.125rem)" }}
          >
            A equipe já almoçou?
          </AlertDialogTitle>
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
