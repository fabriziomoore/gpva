// Mobile (APK Android) equivalents of admin server functions. Every call is
// proxied through the Supabase Edge Function `admin-api` (service_role).
import { callAdminApi } from "./admin-api.mobile";

export const ADMIN_PASSWORD = "137889";
export const ADMIN_LOGIN = "adm";
export const ADMIN_EMAIL = `${ADMIN_LOGIN}@gpva.local`;

type Args<T> = { data: T & { adminPassword: string } };

const call = <R,>(op: string) => async <T,>(arg: Args<T>): Promise<R> => {
  const { adminPassword, ...rest } = arg.data as { adminPassword: string } & Record<string, unknown>;
  return callAdminApi<R>(op, rest, adminPassword);
};

export const listTeams = call<Array<{
  id: string; team_name: string; variable_rate: number; photo_url: string | null;
  collaborator1: string | null; collaborator2: string | null; setor_id: string | null;
  leader: string | null; is_test: boolean | null;
}>>("listTeams");

export const adminListRows = call<Array<{ id: string; name: string }>>("adminListRows");
export const adminAddRow = call<{ ok: true }>("adminAddRow");
export const adminDeleteRow = call<{ ok: true }>("adminDeleteRow");
export const adminUpdateRate = call<{ ok: true }>("adminUpdateRate");
export const adminCreateTeam = call<{ ok: true }>("adminCreateTeam");
export const adminUpdateTeam = call<{ ok: true }>("adminUpdateTeam");
export const adminDeleteTeam = call<{ ok: true }>("adminDeleteTeam");

export const adminListTestTeams = call<Array<{
  id: string; team_name: string; variable_rate: number; photo_url: string | null;
  collaborator1: string | null; collaborator2: string | null; setor_id: string | null;
  leader: string | null; is_test: boolean | null;
}>>("adminListTestTeams");
export const adminCreateTestTeam = call<{ ok: true }>("adminCreateTestTeam");

export const adminTeamsRanking = call<Array<{
  id: string; team_name: string; total: number; viable: number; inviable: number;
  negotiations: number; negotiationValue: number; byType: Record<string, number>;
}>>("adminTeamsRanking");

export const adminListShifts = call<Array<{
  id: string; started_at: string; ended_at: string | null; status: string; report_text: string | null;
}>>("adminListShifts");
export const adminDeleteShift = call<{ ok: true }>("adminDeleteShift");
export const adminUpdateShiftReport = call<{ ok: true }>("adminUpdateShiftReport");

export const adminCreateLeader = call<{ ok: true; login: string }>("adminCreateLeader");
export const adminListLeaders = call<Array<{ id: string; email: string; login: string; display_name: string }>>("adminListLeaders");
export const adminDeleteLeader = call<{ ok: true }>("adminDeleteLeader");

export type SetorRow = { id: string; nome: string; supervisor_nome: string };
export const adminListSetores = call<SetorRow[]>("adminListSetores");
export const adminCreateSetor = call<{ ok: true }>("adminCreateSetor");
export const adminUpdateSetor = call<{ ok: true }>("adminUpdateSetor");
export const adminDeleteSetor = call<{ ok: true }>("adminDeleteSetor");

export const adminBootstrap = call<{ ok: true; login: string }>("adminBootstrap");

export type MapServiceRow = {
  id: string; created_at: string; team_id: string; team_name: string;
  lat: number | null; lng: number | null;
  viable: boolean; is_negotiation: boolean;
  service_type_name: string | null; negotiated_value: number | null;
  registration_number: string | null;
};
export const adminListMapServices = call<MapServiceRow[]>("adminListMapServices");
export const adminDeleteMapService = call<{ ok: true }>("adminDeleteMapService");
export const adminDeleteMapServicesRange = call<{ ok: true; deleted: number }>("adminDeleteMapServicesRange");

export type DeviceRow = {
  user_id: string;
  session_id: string;
  user_agent: string | null;
  last_seen_at: string;
  updated_at: string;
  account_label: string;
  account_kind: "admin" | "leader" | "team" | "unknown";
};
export const adminListDevices = call<DeviceRow[]>("adminListDevices");
export const adminSignOutDevice = call<{ ok: true }>("adminSignOutDevice");

// Lixeira (soft-delete)
export type TrashShiftRow = {
  id: string; team_id: string; team_name: string;
  started_at: string; ended_at: string | null; status: string;
  report_text: string | null; deleted_at: string; service_count: number;
};
export const adminListTrashShifts = call<TrashShiftRow[]>("adminListTrashShifts");
export const adminRestoreShift = call<{ ok: true }>("adminRestoreShift");
export const adminPurgeShift = call<{ ok: true }>("adminPurgeShift");