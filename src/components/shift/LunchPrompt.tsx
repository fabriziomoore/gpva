import { useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useAuthSession } from "@/hooks/use-auth";
import { useTeam } from "@/hooks/use-team";
import { getLocalDB } from "@/lib/db/local-db";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { LUNCH_BREAK_MIN } from "@/lib/report";
import { useLunchStatus, setLunchTaken, dismissLunchPrompt } from "@/lib/lunch-status";

// A pergunta só é feita a partir desse horário (hora local do aparelho).
const LUNCH_PROMPT_FROM_HOUR = 13;

// Setor de Corte e Religa, identificado pelo nome (sem acento/caixa).
function isCorteSector(nome: string | null | undefined): boolean {
  if (!nome) return false;
  return nome
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .includes("corte");
}

// true a partir das 13h de hoje; agenda a virada pra re-renderizar na hora.
function useAfterLunchHour(): boolean {
  const [after, setAfter] = useState(() => new Date().getHours() >= LUNCH_PROMPT_FROM_HOUR);
  useEffect(() => {
    if (after) return;
    const at = new Date();
    at.setHours(LUNCH_PROMPT_FROM_HOUR, 0, 0, 0);
    const id = setTimeout(() => setAfter(true), Math.max(0, at.getTime() - Date.now()));
    return () => clearTimeout(id);
  }, [after]);
  return after;
}

/**
 * Pergunta "A equipe já almoçou?" logo depois de a equipe registrar a
 * primeira O.S. após mais de 1h sem registros (intervalo entre as duas O.S.
 * mais recentes do expediente aberto). Fica no layout autenticado pra
 * continuar aparecendo em qualquer tela até ser respondida.
 *
 * Só no setor de Corte e só a partir das 13h (um intervalo longo antes disso
 * é perguntado quando der 13h). Nos demais setores não pergunta: o tempo
 * médio entre O.S. fica sem desconto durante o expediente e a 1h de almoço
 * é descontada ao finalizar, no relatório.
 *
 * "Não" vale só para aquele intervalo (identificado pela O.S. que o abriu);
 * uma nova pausa longa depois pergunta de novo.
 */
export function LunchPrompt() {
  const { userId } = useAuthSession();
  const { data: team } = useTeam(userId);
  const enabled = isCorteSector(team?.setor_nome);
  const afterLunchHour = useAfterLunchHour();

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
    if (!enabled || !afterLunchHour) return null;
    if (!openShift || lunch.taken || list.length < 2) return null;
    const lastAt = new Date(list[0].created_at).getTime();
    const prevAt = new Date(list[1].created_at).getTime();
    if ((lastAt - prevAt) / 60000 <= LUNCH_BREAK_MIN) return null;
    if (lunch.dismissed.includes(list[1].id)) return null;
    return list[1].id;
  }, [services, openShift, lunch, enabled, afterLunchHour]);

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
        <AlertDialogFooter>
          <AlertDialogCancel
            onClick={() => dismissLunchPrompt(openShift.id, gapStartId)}
          >
            Não
          </AlertDialogCancel>
          <AlertDialogAction onClick={() => setLunchTaken(openShift.id)}>Sim</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
