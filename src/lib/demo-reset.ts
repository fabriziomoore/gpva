import { getLocalDB } from "./db/local-db";
import { supabase } from "@/integrations/supabase/client";
import { pauseSyncAndWaitForIdle, resumeSync } from "./sync/engine";

export interface DemoAccountInfo {
  is_test: boolean;
  verified_at: string;
}

const DEMO_ACCOUNT_PREFIX = "demo:account:";
const PENDING_RESET_PREFIX = "demo:remote-reset-pending:";

/**
 * Retorna as informações de conta demo do KV local.
 */
export async function getDemoAccountInfo(userId: string): Promise<DemoAccountInfo | null> {
  const db = getLocalDB();
  const row = await db.kv.get(`${DEMO_ACCOUNT_PREFIX}${userId}`);
  return row ? (row.value as DemoAccountInfo) : null;
}

/**
 * Salva as informações de conta demo no KV local.
 */
export async function setDemoAccountInfo(userId: string, info: DemoAccountInfo): Promise<void> {
  const db = getLocalDB();
  await db.kv.put({ key: `${DEMO_ACCOUNT_PREFIX}${userId}`, value: info });
}

/**
 * Marca ou desmarca um reset remoto pendente.
 */
export async function setRemoteResetPending(userId: string, pending: boolean): Promise<void> {
  const db = getLocalDB();
  const key = `${PENDING_RESET_PREFIX}${userId}`;
  if (pending) {
    await db.kv.put({ key, value: true });
  } else {
    await db.kv.delete(key);
  }
}

/**
 * Verifica se há um reset remoto pendente.
 */
export async function isRemoteResetPending(userId: string): Promise<boolean> {
  const db = getLocalDB();
  const row = await db.kv.get(`${PENDING_RESET_PREFIX}${userId}`);
  return row?.value === true;
}

/**
 * Executa a limpeza transacional de dados locais da demo.
 */
export async function performLocalDemoReset(demoTeamId: string): Promise<void> {
  const db = getLocalDB();

  // 1. Capturar IDs demo para filtragem do outbox
  const shifts = await db.shifts.where("team_id").equals(demoTeamId).toArray();
  const shiftIds = new Set(shifts.map(s => s.id));

  const services = await db.services.where("team_id").equals(demoTeamId).toArray();
  const serviceIds = new Set(services.map(s => s.id));

  const links = await db.complement_links.where("team_id").equals(demoTeamId).toArray();
  const linkIds = new Set(links.map(l => l.id));

  const impacts = await db.shift_impacts.where("team_id").equals(demoTeamId).toArray();
  const impactIds = new Set(impacts.map(i => i.id));

  // 2. Executar limpeza em uma única transação RW
  await db.transaction("rw", [db.shifts, db.services, db.complement_links, db.shift_impacts, db.outbox, db.kv], async () => {
    // Processar Outbox com regras estritas
    const outboxItems = await db.outbox.toArray();
    for (const item of outboxItems) {
      if (!item.id) continue;
      
      let shouldDelete = false;
      const payload = item.payload as any;

      switch (item.table) {
        case "equipes":
          // REGRA 1: NUNCA apagar equipes
          shouldDelete = false;
          break;
        case "catalog_order":
          // REGRA 2: Apenas se pertencer à demo
          shouldDelete = payload.team_id === demoTeamId;
          break;
        case "expedientes":
          // REGRA 3
          shouldDelete = payload.team_id === demoTeamId || shiftIds.has(item.row_id);
          break;
        case "servicos":
          // REGRA 4
          shouldDelete = payload.team_id === demoTeamId || serviceIds.has(item.row_id);
          break;
        case "vinculos_complementos":
          // REGRA 5
          shouldDelete = payload.team_id === demoTeamId || linkIds.has(item.row_id);
          break;
        case "impactos_expediente":
          // REGRA 6
          shouldDelete = payload.team_id === demoTeamId || impactIds.has(item.row_id);
          break;
      }

      if (shouldDelete) {
        await db.outbox.delete(item.id);
      }
    }

    // Remover registros locais
    await db.shifts.where("team_id").equals(demoTeamId).delete();
    await db.services.where("team_id").equals(demoTeamId).delete();
    await db.complement_links.where("team_id").equals(demoTeamId).delete();
    await db.shift_impacts.where("team_id").equals(demoTeamId).delete();

    // Remover KVs de ordenação de catálogo da demo
    const catalogs = ["tipos_servico", "motivos_inviabilidade", "complementos_servico", "impactos"];
    for (const cat of catalogs) {
      await db.kv.delete(`catord:${demoTeamId}:${cat}`);
    }
  });
}

/**
 * Coordena o reset completo (barreira sync + local + remoto)
 */
export async function prepareDemoBeforeSignOut(userId: string): Promise<void> {
  const info = await getDemoAccountInfo(userId);
  if (!info?.is_test) return;

  try {
    // A. Quiescência do Sync Engine
    await pauseSyncAndWaitForIdle();

    // B. Limpeza LOCAL transacional
    await performLocalDemoReset(userId);

    // C. Limpeza REMOTA (RPC)
    const { data, error } = await supabase.rpc("reset_current_demo_session");
    
    if (error) {
      console.warn("[demo] Remote reset RPC failed, marking as pending", error);
      await setRemoteResetPending(userId, true);
    } else {
      console.info("[demo] Remote reset success", data);
      await setRemoteResetPending(userId, false);
    }
  } catch (err) {
    console.error("[demo] Reset flow interrupted", err);
    // Em caso de erro crítico no fluxo, garantimos o marcador de pending se possível
    await setRemoteResetPending(userId, true);
  } finally {
    // D. Restaurar o Sync Engine (será inofensivo pois o outbox demo está limpo)
    resumeSync();
  }
}
