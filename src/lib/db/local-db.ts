import Dexie, { type Table } from "dexie";

// Local mirror of Supabase tables. Client generates UUIDs so the same id is
// used locally and on the server — no FK resolution needed during sync.

export type SyncState = "pending" | "synced" | "error";

export interface LocalShift {
  id: string;
  team_id: string;
  started_at: string;
  ended_at?: string | null;
  status: "open" | "closed";
  report_text?: string | null;
  variable_rate_snapshot?: number | null;
  updated_at: string;
  sync_state: SyncState;
}

export interface LocalService {
  id: string;
  team_id: string;
  shift_id: string;
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
}

export interface LocalComplementLink {
  id: string;
  team_id: string;
  shift_id: string;
  service_id: string;
  complement_id?: string | null;
  complement_name: string;
  updated_at: string;
  sync_state: SyncState;
}

export interface LocalShiftImpact {
  id: string;
  team_id: string;
  shift_id: string;
  impact_id?: string | null;
  impact_name: string;
  updated_at: string;
  sync_state: SyncState;
}

export type OutboxTable =
  | "expedientes"
  | "servicos"
  | "impactos_expediente"
  | "vinculos_complementos"
  | "equipes"
  | "catalog_order";

export interface OutboxRow {
  id?: number;
  table: OutboxTable;
  op: "upsert" | "update" | "delete";
  row_id: string; // matches server id
  payload: Record<string, unknown>;
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
  outbox!: Table<OutboxRow, number>;
  kv!: Table<KvRow, string>;

  constructor() {
    super("gpva");
    this.version(1).stores({
      shifts: "id, team_id, status, started_at, sync_state",
      services: "id, shift_id, team_id, sync_state, created_at",
      complement_links: "id, service_id, shift_id, team_id, sync_state",
      shift_impacts: "id, shift_id, team_id, sync_state",
      outbox: "++id, table, row_id, created_at",
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

export function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  // RFC4122-ish fallback
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const h = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}