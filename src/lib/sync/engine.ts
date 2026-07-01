import { supabase } from "@/integrations/supabase/client";
import { getLocalDB, type OutboxRow } from "@/lib/db/local-db";
import { useSyncStore } from "./store";

let running = false;
let scheduled = false;

export async function refreshPendingCount(): Promise<void> {
  try {
    const db = getLocalDB();
    const n = await db.outbox.count();
    useSyncStore.getState().setPending(n);
  } catch {
    /* ignore (SSR) */
  }
}

export function scheduleSync(): void {
  if (scheduled) return;
  scheduled = true;
  setTimeout(() => {
    scheduled = false;
    void drainOutbox();
  }, 250);
}

export async function drainOutbox(): Promise<void> {
  if (running) return;
  if (typeof window === "undefined") return;
  if (!useSyncStore.getState().online) {
    await refreshPendingCount();
    return;
  }
  running = true;
  const store = useSyncStore.getState();
  store.setPhase("syncing");
  try {
    const db = getLocalDB();
    // Process in deterministic order so FKs resolve: shifts → services → links → impacts.
    const order: OutboxRow["table"][] = [
      "expedientes",
      "servicos",
      "vinculos_complementos",
      "impactos_expediente",
      "equipes",
      "catalog_order",
    ];
    for (const table of order) {
      const rows = await db.outbox.where("table").equals(table).sortBy("id");
      for (const row of rows) {
        try {
          await pushRow(row);
          if (row.id != null) await db.outbox.delete(row.id);
          await markSynced(table, row.row_id);
        } catch (err) {
          await db.outbox.update(row.id!, {
            tries: row.tries + 1,
            last_error: err instanceof Error ? err.message : String(err),
          });
          // Stop on first failure for this table to preserve order
          throw err;
        }
      }
    }
    useSyncStore.getState().markSynced();
  } catch (err) {
    console.warn("[sync] drain failed", err);
    useSyncStore.getState().setPhase("error");
  } finally {
    running = false;
    await refreshPendingCount();
  }
}

async function pushRow(row: OutboxRow): Promise<void> {
  if (row.op === "upsert") {
    if (row.table === "catalog_order") {
      const { error } = await supabase
        .from("catalog_order")
        .upsert(row.payload as never, { onConflict: "team_id,catalog" });
      if (error) throw error;
      return;
    }
    const { error } = await supabase
      .from(row.table)
      .upsert(row.payload as never, { onConflict: "id" });
    if (error) throw error;
  } else if (row.op === "update") {
    const { error } = await supabase
      .from(row.table)
      .update(row.payload as never)
      .eq("id", row.row_id);
    if (error) throw error;
  } else if (row.op === "delete") {
    const { error } = await supabase.from(row.table).delete().eq("id", row.row_id);
    if (error) throw error;
  }
}

async function markSynced(table: OutboxRow["table"], id: string): Promise<void> {
  const db = getLocalDB();
  switch (table) {
    case "expedientes": {
      const row = await db.shifts.get(id);
      if (row) await db.shifts.put({ ...row, sync_state: "synced" });
      return;
    }
    case "servicos": {
      const row = await db.services.get(id);
      if (row) await db.services.put({ ...row, sync_state: "synced" });
      return;
    }
    case "vinculos_complementos": {
      const row = await db.complement_links.get(id);
      if (row) await db.complement_links.put({ ...row, sync_state: "synced" });
      return;
    }
    case "impactos_expediente": {
      const row = await db.shift_impacts.get(id);
      if (row) await db.shift_impacts.put({ ...row, sync_state: "synced" });
      return;
    }
  }
}