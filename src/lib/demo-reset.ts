import { getLocalDB } from "./db/local-db";
import { supabase } from "@/integrations/supabase/client";
import { pauseSyncAndWaitForIdle } from "./sync/engine";
import { useSyncStore } from "./sync/store";

export interface DemoAccountInfo {
  is_test: boolean;
  verified_at: string;
}

const DEMO_ACCOUNT_PREFIX = "demo:account:";
const LOCAL_PENDING_PREFIX = "demo:local-reset-pending:";
const REMOTE_PENDING_PREFIX = "demo:remote-reset-pending:";

export async function getDemoAccountInfo(userId: string): Promise<DemoAccountInfo | null> {
  const db = getLocalDB();
  const row = await db.kv.get(`${DEMO_ACCOUNT_PREFIX}${userId}`);
  return row ? (row.value as DemoAccountInfo) : null;
}

export async function setDemoAccountInfo(userId: string, info: DemoAccountInfo): Promise<void> {
  const db = getLocalDB();
  await db.kv.put({ key: `${DEMO_ACCOUNT_PREFIX}${userId}`, value: info });
}

export async function setRemoteResetPending(userId: string, pending: boolean): Promise<void> {
  const db = getLocalDB();
  const key = `${REMOTE_PENDING_PREFIX}${userId}`;
  if (pending) {
    await db.kv.put({ key, value: true });
  } else {
    await db.kv.delete(key);
  }
}

export async function isRemoteResetPending(userId: string): Promise<boolean> {
  const db = getLocalDB();
  const row = await db.kv.get(`${REMOTE_PENDING_PREFIX}${userId}`);
  return row?.value === true;
}

export async function setLocalResetPending(userId: string, pending: boolean): Promise<void> {
  const db = getLocalDB();
  const key = `${LOCAL_PENDING_PREFIX}${userId}`;
  if (pending) {
    await db.kv.put({ key, value: true });
  } else {
    await db.kv.delete(key);
  }
}

export async function isLocalResetPending(userId: string): Promise<boolean> {
  const db = getLocalDB();
  const row = await db.kv.get(`${LOCAL_PENDING_PREFIX}${userId}`);
  return row?.value === true;
}

export async function performLocalDemoReset(demoTeamId: string): Promise<void> {
  const db = getLocalDB();

  const shifts = await db.shifts.where("team_id").equals(demoTeamId).toArray();
  const shiftIds = new Set(shifts.map(s => s.id));

  const services = await db.services.where("team_id").equals(demoTeamId).toArray();
  const serviceIds = new Set(services.map(s => s.id));

  const links = await db.complement_links.where("team_id").equals(demoTeamId).toArray();
  const linkIds = new Set(links.map(l => l.id));

  const impacts = await db.shift_impacts.where("team_id").equals(demoTeamId).toArray();
  const impactIds = new Set(impacts.map(i => i.id));

  await db.transaction("rw", [db.shifts, db.services, db.complement_links, db.shift_impacts, db.outbox, db.kv], async () => {
    const outboxItems = await db.outbox.toArray();
    for (const item of outboxItems) {
      if (!item.id) continue;
      
      let shouldDelete = false;
      const payload = item.payload as any;

      switch (item.table) {
        case "equipes":
          shouldDelete = false;
          break;
        case "catalog_order":
          shouldDelete = payload.team_id === demoTeamId;
          break;
        case "expedientes":
          shouldDelete = payload.team_id === demoTeamId || shiftIds.has(item.row_id);
          break;
        case "servicos":
          shouldDelete = payload.team_id === demoTeamId || serviceIds.has(item.row_id);
          break;
        case "vinculos_complementos":
          shouldDelete = payload.team_id === demoTeamId || linkIds.has(item.row_id);
          break;
        case "impactos_expediente":
          shouldDelete = payload.team_id === demoTeamId || impactIds.has(item.row_id);
          break;
      }

      if (shouldDelete) {
        await db.outbox.delete(item.id);
      }
    }

    await db.shifts.where("team_id").equals(demoTeamId).delete();
    await db.services.where("team_id").equals(demoTeamId).delete();
    await db.complement_links.where("team_id").equals(demoTeamId).delete();
    await db.shift_impacts.where("team_id").equals(demoTeamId).delete();

    const catalogs = ["tipos_servico", "motivos_inviabilidade", "complementos_servico", "impactos"];
    for (const cat of catalogs) {
      await db.kv.delete(`catord:${demoTeamId}:${cat}`);
    }
  });
}

export type RemoteResetStatus = "reset" | "not_demo" | "failed" | "skipped";
export type LocalResetStatus = "reset" | "pending" | "skipped";

export async function prepareDemoBeforeSignOut(userId: string): Promise<{
  attempted: boolean;
  remoteReset: RemoteResetStatus;
  localReset: LocalResetStatus;
  keepSyncPausedUntilSignOut: boolean;
}> {
  const result: {
    attempted: boolean;
    remoteReset: RemoteResetStatus;
    localReset: LocalResetStatus;
    keepSyncPausedUntilSignOut: boolean;
  } = {
    attempted: false,
    remoteReset: "skipped",
    localReset: "skipped",
    keepSyncPausedUntilSignOut: false
  };

  const isOnline = useSyncStore.getState().online;

  // 1. Lógica Offline Real
  if (!isOnline) {
    const info = await getDemoAccountInfo(userId);
    if (info?.is_test) {
      await setLocalResetPending(userId, true);
      await setRemoteResetPending(userId, true);
      result.localReset = "pending";
      return result;
    }
    return result;
  }

  // 2. Fluxo Online
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

      if (!isTest) {
        result.remoteReset = "not_demo";
        await setLocalResetPending(userId, false);
        await setRemoteResetPending(userId, false);
        return result;
      }
    } else {
      // FAIL CLOSED: Online, mas falhou o SELECT
      const info = await getDemoAccountInfo(userId);
      if (info?.is_test) {
        await setLocalResetPending(userId, true);
        await setRemoteResetPending(userId, true);
      }
      return result;
    }
  } catch (err) {
    console.error("[demo] Online check error", err);
    return result;
  }

  // Se chegou aqui, is_test === true confirmado online
  result.attempted = true;
  await pauseSyncAndWaitForIdle();

  try {
    await performLocalDemoReset(userId);
    result.localReset = "reset";
    await setLocalResetPending(userId, false);

    const { data, error } = await supabase.rpc("reset_current_demo_session");
    const res = data as any;

    if (!error && res?.status === "reset") {
      result.remoteReset = "reset";
      await setRemoteResetPending(userId, false);
    } else {
      result.remoteReset = "failed";
      await setRemoteResetPending(userId, true);
    }
  } catch (err) {
    console.error("[demo] Reset flow error", err);
    result.localReset = "pending";
    await setLocalResetPending(userId, true);
    await setRemoteResetPending(userId, true);
    result.keepSyncPausedUntilSignOut = true;
  }

  return result;
}
