import Dexie, { type Table } from "dexie";

// Local mirror of Supabase tables. Used as the offline-first source of truth
// in Fase 2. For now we expose the schema and a singleton so other modules
// can start reading/writing while the sync engine is wired up.

export type SyncState = "pending" | "syncing" | "synced" | "error";

export interface LocalShift {
  local_id: string;
  server_id?: string | null;
  team_id: string;
  started_at: string;
  ended_at?: string | null;
  status: "open" | "closed";
  report_text?: string | null;
  variable_rate_snapshot?: number | null;
  updated_at: string;
  sync_state: SyncState;
  deleted?: boolean;
}

export interface LocalService {
  local_id: string;
  server_id?: string | null;
  team_id: string;
  shift_local_id: string;
  service_type_id?: string | null;
  service_type_name: string;
  viable: boolean;
  is_negotiation: boolean;
  reason_id?: string | null;
  reason_name?: string | null;
  registration_number?: string | null;
  negotiated_value?: number | null;
  created_at: string;
  updated_at: string;
  sync_state: SyncState;
  deleted?: boolean;
}

export interface LocalComplementLink {
  local_id: string;
  server_id?: string | null;
  team_id: string;
  shift_local_id: string;
  service_local_id: string;
  complement_id?: string | null;
  complement_name: string;
  updated_at: string;
  sync_state: SyncState;
}

export interface LocalShiftImpact {
  local_id: string;
  server_id?: string | null;
  team_id: string;
  shift_local_id: string;
  impact_id?: string | null;
  impact_name: string;
  updated_at: string;
  sync_state: SyncState;
}

export interface LocalCatalogRow {
  id: string; // server uuid
  table: "service_types" | "inviability_reasons" | "service_complements" | "impacts";
  name: string;
  is_negotiation?: boolean;
  sort_order?: number;
  active: boolean;
  updated_at: string;
}

export interface OutboxRow {
  id?: number;
  table: "shifts" | "services" | "shift_impacts" | "service_complement_links";
  op: "insert" | "update" | "delete";
  local_id: string;
  payload: unknown;
  tries: number;
  created_at: string;
  last_error?: string | null;
}

export interface KvRow {
  key: string;
  value: unknown;
}

class GpvaDB extends Dexie {
  shifts!: Table<LocalShift, string>;
  services!: Table<LocalService, string>;
  complement_links!: Table<LocalComplementLink, string>;
  shift_impacts!: Table<LocalShiftImpact, string>;
  catalog!: Table<LocalCatalogRow, [string, string]>;
  outbox!: Table<OutboxRow, number>;
  kv!: Table<KvRow, string>;

  constructor() {
    super("gpva");
    this.version(1).stores({
      shifts: "local_id, server_id, team_id, status, started_at, sync_state",
      services: "local_id, server_id, shift_local_id, team_id, sync_state, created_at",
      complement_links: "local_id, service_local_id, shift_local_id, team_id, sync_state",
      shift_impacts: "local_id, shift_local_id, team_id, sync_state",
      catalog: "[table+id], table, active, updated_at",
      outbox: "++id, table, local_id, created_at",
      kv: "key",
    });
  }
}

let _db: GpvaDB | null = null;

export function getLocalDB(): GpvaDB {
  if (typeof window === "undefined") {
    throw new Error("LocalDB only available in the browser/Capacitor runtime");
  }
  if (!_db) _db = new GpvaDB();
  return _db;
}

export function newLocalId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `loc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}