// Mobile (APK Android) equivalents of audit server functions.
import { callAdminApi } from "../admin-api.mobile";
import type { CheckResult, JsonValue } from "./types";

type Args<T> = { data: T & { adminPassword: string } };
const call = <R,>(op: string) => async <T,>(arg: Args<T>): Promise<R> => {
  const { adminPassword, ...rest } = arg.data as { adminPassword: string } & Record<string, unknown>;
  return callAdminApi<R>(op, rest, adminPassword);
};

export const runDbAudit = call<CheckResult[]>("auditDb");
export const runSecurityAudit = call<CheckResult[]>("auditSecurity");
export const runAccountsAudit = call<CheckResult[]>("auditAccounts");
export const runConfigAudit = call<CheckResult[]>("auditConfig");

export const saveAuditReport = call<{ id: string; created_at: string }>("auditSave");
export const listAuditReports = call<Array<{ id: string; created_at: string; duration_ms: number; overall_score: number; counts: JsonValue }>>("auditList");
export const deleteAuditReport = call<{ ok: true }>("auditDelete");
export const getAuditReport = call<{ id: string; created_at: string; duration_ms: number; overall_score: number; counts: JsonValue; report: JsonValue }>("auditGet");