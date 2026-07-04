import { getLocalDB, newId, type LocalService, type LocalShift } from "./local-db";
import { scheduleSync, refreshPendingCount } from "@/lib/sync/engine";
import { cacheTeam, getCachedTeam, type CatTeam } from "@/lib/db/catalogs";
import type { CatalogKind } from "@/lib/db/catalogs";
import { assertActiveSession } from "@/lib/session-guard";

const nowIso = () => new Date().toISOString();

export async function repoSaveCatalogOrder(input: {
  team_id: string;
  catalog: CatalogKind;
  item_ids: string[];
}): Promise<void> {
  await assertActiveSession();
  const db = getLocalDB();
  const key = `catord:${input.team_id}:${input.catalog}`;
  await db.kv.put({ key, value: input.item_ids });
  // Coalesce: drop any pending outbox entry for the same team+catalog so we
  // only push the latest order.
  const rowId = `${input.team_id}:${input.catalog}`;
  const pending = await db.outbox
    .where("table")
    .equals("catalog_order")
    .and((r) => r.row_id === rowId)
    .toArray();
  for (const p of pending) if (p.id != null) await db.outbox.delete(p.id);
  await db.outbox.add({
    table: "catalog_order",
    op: "upsert",
    row_id: rowId,
    payload: {
      team_id: input.team_id,
      catalog: input.catalog,
      item_ids: input.item_ids,
    },
    tries: 0,
    created_at: nowIso(),
  });
  await refreshPendingCount();
  scheduleSync();
}

export async function repoUpdateTeam(
  teamId: string,
  patch: Partial<Pick<CatTeam, "supervisor" | "leader" | "variable_rate" | "onboarded" | "photo_url" | "collaborator1" | "collaborator2" | "team_name">>,
): Promise<CatTeam | null> {
  await assertActiveSession();
  const db = getLocalDB();
  const current = await getCachedTeam(teamId);
  const merged = current ? { ...current, ...patch } : null;
  if (merged) await cacheTeam(merged);
  await db.outbox.add({
    table: "equipes",
    op: "update",
    row_id: teamId,
    payload: patch as Record<string, unknown>,
    tries: 0,
    created_at: nowIso(),
  });
  await refreshPendingCount();
  scheduleSync();
  return merged;
}

export async function repoCreateShift(input: {
  team_id: string;
  variable_rate_snapshot?: number | null;
}): Promise<LocalShift> {
  await assertActiveSession();
  const db = getLocalDB();
  const row: LocalShift = {
    id: newId(),
    team_id: input.team_id,
    started_at: nowIso(),
    ended_at: null,
    status: "open",
    report_text: null,
    variable_rate_snapshot: input.variable_rate_snapshot ?? null,
    updated_at: nowIso(),
    sync_state: "pending",
  };
  await db.shifts.put(row);
  await db.outbox.add({
    table: "expedientes",
    op: "upsert",
    row_id: row.id,
    payload: toShiftPayload(row),
    tries: 0,
    created_at: nowIso(),
  });
  await refreshPendingCount();
  scheduleSync();
  return row;
}

export async function repoCloseShift(opts: {
  shift_id: string;
  report_text: string;
  impacts: { id: string | null; name: string; team_id: string; shift_id: string }[];
}): Promise<void> {
  await assertActiveSession();
  const db = getLocalDB();
  const shift = await db.shifts.get(opts.shift_id);
  if (!shift) throw new Error("Shift not found locally");
  const updated: LocalShift = {
    ...shift,
    status: "closed",
    ended_at: nowIso(),
    report_text: opts.report_text,
    updated_at: nowIso(),
    sync_state: "pending",
  };
  await db.shifts.put(updated);
  await db.outbox.add({
    table: "expedientes",
    op: "upsert",
    row_id: updated.id,
    payload: toShiftPayload(updated),
    tries: 0,
    created_at: nowIso(),
  });
  for (const imp of opts.impacts) {
    const id = newId();
    const row = {
      id,
      team_id: imp.team_id,
      shift_id: imp.shift_id,
      impact_id: imp.id,
      impact_name: imp.name,
      updated_at: nowIso(),
      sync_state: "pending" as const,
    };
    await db.shift_impacts.put(row);
    await db.outbox.add({
      table: "impactos_expediente",
      op: "upsert",
      row_id: id,
      payload: {
        id,
        team_id: imp.team_id,
        shift_id: imp.shift_id,
        impact_id: imp.id,
        impact_name: imp.name,
      },
      tries: 0,
      created_at: nowIso(),
    });
  }
  await refreshPendingCount();
  scheduleSync();
}

export async function repoAddService(input: {
  team_id: string;
  shift_id: string;
  service_type_id: string | null;
  service_type_name: string;
  is_negotiation: boolean;
  viable: boolean;
  reason_id?: string | null;
  reason_name?: string | null;
  registration_number?: string | null;
  negotiated_value?: number | null;
  complements?: { id: string | null; name: string }[];
}): Promise<LocalService> {
  await assertActiveSession();
  const db = getLocalDB();
  const row: LocalService = {
    id: newId(),
    team_id: input.team_id,
    shift_id: input.shift_id,
    service_type_id: input.service_type_id,
    service_type_name: input.service_type_name,
    is_negotiation: input.is_negotiation,
    viable: input.viable,
    reason_id: input.reason_id ?? null,
    reason_name: input.reason_name ?? null,
    registration_number: input.registration_number ?? null,
    negotiated_value: input.negotiated_value ?? null,
    created_at: nowIso(),
    updated_at: nowIso(),
    sync_state: "pending",
  };
  await db.services.put(row);
  await db.outbox.add({
    table: "servicos",
    op: "upsert",
    row_id: row.id,
    payload: toServicePayload(row),
    tries: 0,
    created_at: nowIso(),
  });
  for (const c of input.complements ?? []) {
    const id = newId();
    const link = {
      id,
      team_id: input.team_id,
      shift_id: input.shift_id,
      service_id: row.id,
      complement_id: c.id,
      complement_name: c.name,
      updated_at: nowIso(),
      sync_state: "pending" as const,
    };
    await db.complement_links.put(link);
    await db.outbox.add({
      table: "vinculos_complementos",
      op: "upsert",
      row_id: id,
      payload: {
        id,
        team_id: input.team_id,
        shift_id: input.shift_id,
        service_id: row.id,
        complement_id: c.id,
        complement_name: c.name,
      },
      tries: 0,
      created_at: nowIso(),
    });
  }
  await refreshPendingCount();
  scheduleSync();
  return row;
}

function toShiftPayload(r: LocalShift) {
  return {
    id: r.id,
    team_id: r.team_id,
    started_at: r.started_at,
    ended_at: r.ended_at,
    status: r.status,
    report_text: r.report_text,
    variable_rate_snapshot: r.variable_rate_snapshot,
  };
}

function toServicePayload(r: LocalService) {
  return {
    id: r.id,
    team_id: r.team_id,
    shift_id: r.shift_id,
    service_type_id: r.service_type_id,
    service_type_name: r.service_type_name,
    is_negotiation: r.is_negotiation,
    viable: r.viable,
    reason_id: r.reason_id,
    reason_name: r.reason_name,
    registration_number: r.registration_number,
    negotiated_value: r.negotiated_value,
    created_at: r.created_at,
  };
}