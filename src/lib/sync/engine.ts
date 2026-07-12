import { supabase } from "@/integrations/supabase/client";
import {
  getLocalDB,
  type OutboxRow,
  type LocalShift,
  type LocalService,
  type LocalComplementLink,
  type LocalShiftImpact,
} from "@/lib/db/local-db";
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
  const s0 = useSyncStore.getState();
  // Só drena quando o dispositivo está online E o backend está alcançável.
  // A conectividade é decidida pelo NetworkService, nunca aqui.
  if (!s0.online || !s0.backendReachable) {
    await refreshPendingCount();
    return;
  }
  running = true;
  const store = useSyncStore.getState();
  try {
    const db = getLocalDB();
    const pendingCount = await db.outbox.count();
    useSyncStore.getState().setPending(pendingCount);
    if (pendingCount === 0) {
      // Nada para enviar — não pisca "sincronizando" à toa.
      if (useSyncStore.getState().phase !== "idle") {
        useSyncStore.getState().markSynced();
      }
      return;
    }
    store.setPhase("syncing");
    store.setLastError(null);
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
          const message = toSyncErrorMessage(err);
          await db.outbox.update(row.id!, {
            tries: row.tries + 1,
            last_error: message,
          });
          // Stop on first failure for this table to preserve order
          throw err;
        }
      }
    }
    useSyncStore.getState().markSynced();
  } catch (err) {
    const message = toSyncErrorMessage(err);
    console.warn("[sync] drain failed", err);
    useSyncStore.getState().setLastError(message);
    useSyncStore.getState().setPhase("error");
    // Erros de push nunca alteram conectividade. O NetworkService (pings de
    // 1 s) é a única fonte de verdade — se o backend estiver realmente
    // inacessível, o próximo ping vai refletir isso em backendReachable.
  } finally {
    running = false;
    await refreshPendingCount();
  }
}

function toSyncErrorMessage(err: unknown): string {
  if (err instanceof Error && err.message.trim()) return err.message;
  if (typeof err === "string" && err.trim()) return err;
  if (err && typeof err === "object") {
    const e = err as {
      message?: unknown;
      code?: unknown;
      details?: unknown;
      hint?: unknown;
      status?: unknown;
      statusText?: unknown;
    };
    const parts = [e.message, e.code, e.details, e.hint, e.status, e.statusText]
      .filter((v): v is string | number =>
        (typeof v === "string" && v.trim().length > 0) || typeof v === "number",
      )
      .map(String);
    if (parts.length) return parts.join(" · ");
    try {
      return JSON.stringify(err);
    } catch {
      return "Erro desconhecido ao sincronizar";
    }
  }
  return "Erro desconhecido ao sincronizar";
}

async function pushRow(row: OutboxRow): Promise<void> {
  const table = row.table as Exclude<OutboxRow["table"], "catalog_order">;
  if (row.op === "upsert") {
    if (row.table === "catalog_order") {
      const { error } = await supabase
        .from("catalog_order")
        .upsert(row.payload as never, { onConflict: "team_id,catalog" });
      if (error) throw error;
      return;
    }
    await ensureParentsBeforePush(row);
    const { error } = await supabase
      .from(table)
      .upsert(row.payload as never, { onConflict: "id" });
    if (isMissingParentError(error)) {
      await ensureParentsBeforePush(row, { force: true });
      const retry = await supabase
        .from(table)
        .upsert(row.payload as never, { onConflict: "id" });
      if (retry.error) throw retry.error;
      return;
    }
    if (error) throw error;
  } else if (row.op === "update") {
    const { error } = await supabase
      .from(table)
      .update(row.payload as never)
      .eq("id", row.row_id);
    if (error) throw error;
  } else if (row.op === "delete") {
    const { error } = await supabase.from(table).delete().eq("id", row.row_id);
    if (error) throw error;
  }
}

async function ensureParentsBeforePush(
  row: OutboxRow,
  opts: { force?: boolean } = {},
): Promise<void> {
  if (row.table === "servicos") {
    const shiftId = asString(row.payload.shift_id);
    const teamId = asString(row.payload.team_id);
    const createdAt = asString(row.payload.captured_at) ?? asString(row.payload.created_at);
    if (shiftId && teamId) await ensureShiftExists(shiftId, teamId, createdAt, opts.force);
    return;
  }

  if (row.table === "impactos_expediente") {
    const shiftId = asString(row.payload.shift_id);
    const teamId = asString(row.payload.team_id);
    if (shiftId && teamId) await ensureShiftExists(shiftId, teamId, null, opts.force);
    return;
  }

  if (row.table === "vinculos_complementos") {
    const serviceId = asString(row.payload.service_id);
    if (serviceId) await ensureServiceExists(serviceId, opts.force);
  }
}

async function ensureShiftExists(
  shiftId: string,
  teamId: string,
  fallbackStartedAt: string | null,
  force = false,
): Promise<void> {
  if (!force) {
    const existing = await supabase
      .from("expedientes")
      .select("id")
      .eq("id", shiftId)
      .maybeSingle();
    if (existing.error) throw existing.error;
    if (existing.data) return;
  }

  const db = getLocalDB();
  const local = await db.shifts.get(shiftId);
  const payload = local
    ? {
        id: local.id,
        team_id: local.team_id,
        started_at: local.started_at,
        ended_at: local.ended_at ?? null,
        status: local.status,
        report_text: local.report_text ?? null,
        variable_rate_snapshot: local.variable_rate_snapshot ?? null,
      }
    : {
        id: shiftId,
        team_id: teamId,
        started_at: fallbackStartedAt ?? new Date().toISOString(),
        ended_at: null,
        status: "open" as const,
        report_text: null,
        variable_rate_snapshot: null,
      };

  const { error } = await supabase.from("expedientes").upsert(payload as never, {
    onConflict: "id",
  });
  if (error) throw error;
  if (local) await db.shifts.put({ ...local, sync_state: "synced" });
}

async function ensureServiceExists(serviceId: string, force = false): Promise<void> {
  if (!force) {
    const existing = await supabase
      .from("servicos")
      .select("id")
      .eq("id", serviceId)
      .maybeSingle();
    if (existing.error) throw existing.error;
    if (existing.data) return;
  }

  const db = getLocalDB();
  const local = await db.services.get(serviceId);
  if (!local) return;
  await ensureShiftExists(local.shift_id, local.team_id, local.captured_at ?? local.created_at, force);
  const { error } = await supabase.from("servicos").upsert(
    {
      id: local.id,
      team_id: local.team_id,
      shift_id: local.shift_id,
      service_type_id: local.service_type_id ?? null,
      service_type_name: local.service_type_name,
      is_negotiation: local.is_negotiation,
      viable: local.viable,
      reason_id: local.reason_id ?? null,
      reason_name: local.reason_name ?? null,
      registration_number: local.registration_number ?? null,
      negotiated_value: local.negotiated_value ?? null,
      lat: local.lat ?? null,
      lng: local.lng ?? null,
      accuracy_m: local.accuracy_m ?? null,
      captured_at: local.captured_at ?? null,
      created_at: local.created_at,
    } as never,
    { onConflict: "id" },
  );
  if (error) throw error;
  await db.services.put({ ...local, sync_state: "synced" });
}

function isMissingParentError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: unknown; message?: unknown; details?: unknown };
  return (
    e.code === "23503" ||
    String(e.message ?? "").includes("violates foreign key constraint") ||
    String(e.details ?? "").includes("is not present")
  );
}

function asString(v: unknown): string | null {
  return typeof v === "string" && v.trim().length > 0 ? v : null;
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

/**
 * Pull remote rows for the current user into the local Dexie mirror so a new
 * device can resume the open shift and see full history. Rows that still have
 * pending outbox writes are left untouched to avoid clobbering local edits.
 */
export async function pullRemote(): Promise<void> {
  if (typeof window === "undefined") return;
  const s = useSyncStore.getState();
  if (!s.online || !s.backendReachable) return;
  const { data: userRes } = await supabase.auth.getUser();
  const user = userRes.user;
  if (!user) return;
  const teamId = user.id;
  const db = getLocalDB();

  const pendingIds = new Set<string>(
    (await db.outbox.toArray()).map((r) => `${r.table}:${r.row_id}`),
  );

  try {
    const [shiftsRes, servicesRes, linksRes, impactsRes] = await Promise.all([
      supabase.from("expedientes").select("*").eq("team_id", teamId),
      supabase.from("servicos").select("*").eq("team_id", teamId),
      supabase.from("vinculos_complementos").select("*").eq("team_id", teamId),
      supabase.from("impactos_expediente").select("*").eq("team_id", teamId),
    ]);
    if (shiftsRes.error) throw shiftsRes.error;
    if (servicesRes.error) throw servicesRes.error;
    if (linksRes.error) throw linksRes.error;
    if (impactsRes.error) throw impactsRes.error;

    const shifts: LocalShift[] = (shiftsRes.data ?? [])
      .filter((r) => !pendingIds.has(`expedientes:${r.id}`))
      .map((r) => ({
        id: r.id,
        team_id: r.team_id,
        started_at: r.started_at,
        ended_at: r.ended_at,
        status: r.status as "open" | "closed",
        report_text: r.report_text,
        variable_rate_snapshot: r.variable_rate_snapshot,
        updated_at: r.started_at,
        sync_state: "synced",
      }));
    if (shifts.length) await db.shifts.bulkPut(shifts);

    const services: LocalService[] = (servicesRes.data ?? [])
      .filter((r) => !pendingIds.has(`servicos:${r.id}`))
      .map((r) => ({
        id: r.id,
        team_id: r.team_id,
        shift_id: r.shift_id,
        service_type_id: r.service_type_id,
        service_type_name: r.service_type_name,
        viable: r.viable,
        is_negotiation: r.is_negotiation,
        reason_id: r.reason_id,
        reason_name: r.reason_name,
        registration_number: r.registration_number,
        negotiated_value: r.negotiated_value,
        lat: r.lat ?? null,
        lng: r.lng ?? null,
        accuracy_m: r.accuracy_m ?? null,
        captured_at: r.captured_at ?? null,
        created_at: r.created_at,
        updated_at: r.created_at,
        sync_state: "synced",
      }));
    if (services.length) await db.services.bulkPut(services);

    const links: LocalComplementLink[] = (linksRes.data ?? [])
      .filter((r) => !pendingIds.has(`vinculos_complementos:${r.id}`))
      .map((r) => ({
        id: r.id,
        team_id: r.team_id,
        shift_id: r.shift_id,
        service_id: r.service_id,
        complement_id: r.complement_id,
        complement_name: r.complement_name,
        updated_at: r.created_at ?? new Date().toISOString(),
        sync_state: "synced",
      }));
    if (links.length) await db.complement_links.bulkPut(links);

    const impacts: LocalShiftImpact[] = (impactsRes.data ?? [])
      .filter((r) => !pendingIds.has(`impactos_expediente:${r.id}`))
      .map((r) => ({
        id: r.id,
        team_id: r.team_id,
        shift_id: r.shift_id,
        impact_id: r.impact_id,
        impact_name: r.impact_name,
        updated_at: new Date().toISOString(),
        sync_state: "synced",
      }));
    if (impacts.length) await db.shift_impacts.bulkPut(impacts);

    // Reconcile deletions: rows that exist locally (as "synced") but are no
    // longer present on the server were deleted remotely (e.g. admin removed
    // a closed report). Remove them locally so the UI stops reflecting them.
    // Skip rows with pending outbox writes to preserve unsynced local edits.
    const remoteShiftIds = new Set((shiftsRes.data ?? []).map((r) => r.id));
    const remoteServiceIds = new Set((servicesRes.data ?? []).map((r) => r.id));
    const remoteLinkIds = new Set((linksRes.data ?? []).map((r) => r.id));
    const remoteImpactIds = new Set((impactsRes.data ?? []).map((r) => r.id));

    const localShifts = await db.shifts.where("team_id").equals(teamId).toArray();
    const staleShiftIds = localShifts
      .filter((r) => r.sync_state === "synced" && !remoteShiftIds.has(r.id) && !pendingIds.has(`expedientes:${r.id}`))
      .map((r) => r.id);
    if (staleShiftIds.length) await db.shifts.bulkDelete(staleShiftIds);

    const localServices = await db.services.where("team_id").equals(teamId).toArray();
    const staleServiceIds = localServices
      .filter((r) => r.sync_state === "synced" && !remoteServiceIds.has(r.id) && !pendingIds.has(`servicos:${r.id}`))
      .map((r) => r.id);
    if (staleServiceIds.length) await db.services.bulkDelete(staleServiceIds);

    const localLinks = await db.complement_links.where("team_id").equals(teamId).toArray();
    const staleLinkIds = localLinks
      .filter((r) => r.sync_state === "synced" && !remoteLinkIds.has(r.id) && !pendingIds.has(`vinculos_complementos:${r.id}`))
      .map((r) => r.id);
    if (staleLinkIds.length) await db.complement_links.bulkDelete(staleLinkIds);

    const localImpacts = await db.shift_impacts.where("team_id").equals(teamId).toArray();
    const staleImpactIds = localImpacts
      .filter((r) => r.sync_state === "synced" && !remoteImpactIds.has(r.id) && !pendingIds.has(`impactos_expediente:${r.id}`))
      .map((r) => r.id);
    if (staleImpactIds.length) await db.shift_impacts.bulkDelete(staleImpactIds);
  } catch (err) {
    console.warn("[sync] pullRemote failed", err);
  }
}