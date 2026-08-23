import { getLocalDB } from "./db/local-db";
import { supabase } from "@/integrations/supabase/client";
import { pauseSyncAndWaitForIdle, resumeSync } from "./sync/engine";

export interface DemoAccountInfo {
  is_test: boolean;
  verified_at: string;
}

const DEMO_ACCOUNT_PREFIX = "demo:account:";
const LOCAL_PENDING_PREFIX = "demo:local-reset-pending:";
const REMOTE_PENDING_PREFIX = "demo:remote-reset-pending:";

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
  const key = `${REMOTE_PENDING_PREFIX}${userId}`;
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
  const row = await db.kv.get(`${REMOTE_PENDING_PREFIX}${userId}`);
  return row?.value === true;
}

/**
 * Marca ou desmarca um reset local pendente.
 */
export async function setLocalResetPending(userId: string, pending: boolean): Promise<void> {
  const db = getLocalDB();
  const key = `${LOCAL_PENDING_PREFIX}${userId}`;
  if (pending) {
    await db.kv.put({ key, value: true });
  } else {
    await db.kv.delete(key);
  }
}

/**
 * Verifica se há um reset local pendente.
 */
export async function isLocalResetPending(userId: string): Promise<boolean> {
  const db = getLocalDB();
  const row = await db.kv.get(`${LOCAL_PENDING_PREFIX}${userId}`);
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
export async function prepareDemoBeforeSignOut(userId: string): Promise<{
  attempted: boolean;
  remoteReset: "reset" | "not_demo" | "failed" | "skipped";
  localReset: "reset" | "pending" | "skipped";
}> {
  const result: {
    attempted: boolean;
    remoteReset: "reset" | "not_demo" | "failed" | "skipped";
    localReset: "reset" | "pending" | "skipped";
  } = {
    attempted: false,
    remoteReset: "skipped",
    localReset: "skipped"
  };

  // 1. Verificação Online (Source of Truth) se possível
  let isTest = false;
  try {
    const { data: team, error: teamErr } = await supabase
      .from("equipes")
      .select("is_test")
      .eq("id", userId)
      .single();
    
    if (!teamErr && team) {
      isTest = !!team.is_test;
      await setDemoAccountInfo(userId, {
        is_test: isTest,
        verified_at: new Date().toISOString()
      });
    } else {
      // Se falhou online, usamos o marcador local
      const info = await getDemoAccountInfo(userId);
      if (!info) return result; // Sem marcador, não assumimos que é demo
      isTest = info.is_test;
      
      // Se falhou online e não temos confirmação, FAIL CLOSED: não resetamos
      if (teamErr) {
        console.warn("[demo] Online verification failed, skipping destructive reset", teamErr);
        return result;
      }
    }
  } catch (err) {
    console.error("[demo] Verification error", err);
    return result;
  }

  if (!isTest) {
    result.remoteReset = "not_demo";
    return result;
  }

  result.attempted = true;

  try {
    // A. Quiescência do Sync Engine
    await pauseSyncAndWaitForIdle();

    // B. Limpeza LOCAL transacional
    try {
      await performLocalDemoReset(userId);
      result.localReset = "reset";
      await setLocalResetPending(userId, false);
    } catch (localErr) {
      console.error("[demo] Local reset failed", localErr);
      result.localReset = "pending";
      await setLocalResetPending(userId, true);
      // FAIL CLOSED: Se a limpeza local falhou, não chamamos a RPC para não deixar
      // a conta limpa no servidor mas com lixo local pendente de sincronização.
      result.remoteReset = "failed";
      await setRemoteResetPending(userId, true);
      return result;
    }

    // C. Limpeza REMOTA (RPC)
    const { data, error } = await supabase.rpc("reset_current_demo_session");
    
    // Casting de data para acessar status de forma segura (TanStack Start/Supabase gerado)
    const res = data as any;

    if (error) {
      console.warn("[demo] Remote reset RPC failed, marking as pending", error);
      result.remoteReset = "failed";
      await setRemoteResetPending(userId, true);
    } else if (res?.status === "reset") {
      console.info("[demo] Remote reset success", res);
      result.remoteReset = "reset";
      await setRemoteResetPending(userId, false);
    } else if (res?.status === "not_demo") {
      result.remoteReset = "not_demo";
      await setRemoteResetPending(userId, false);
      await setDemoAccountInfo(userId, { is_test: false, verified_at: new Date().toISOString() });
    } else {
      result.remoteReset = "failed";
      await setRemoteResetPending(userId, true);
    }
  } catch (err) {
    console.error("[demo] Reset flow interrupted", err);
    result.remoteReset = "failed";
    await setRemoteResetPending(userId, true);
  }

  return result;
}
