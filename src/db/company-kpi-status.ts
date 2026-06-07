import type Database from "better-sqlite3";
import type { CompanyKpiStatus, KpiStatus } from "../types.js";

export function upsertKpiStatus(
  db: Database.Database,
  row: {
    company_id: number;
    metric_key: string;
    label: string | null;
    unit: string | null;
    status: KpiStatus;
    missing_reason: string | null;
  },
): void {
  db.prepare(
    `INSERT INTO company_kpi_status (company_id, metric_key, label, unit, status, missing_reason, updated_at)
     VALUES (@company_id, @metric_key, @label, @unit, @status, @missing_reason, datetime('now'))
     ON CONFLICT(company_id, metric_key) DO UPDATE SET
       label=excluded.label,
       unit=excluded.unit,
       status=excluded.status,
       missing_reason=excluded.missing_reason,
       updated_at=datetime('now')`,
  ).run(row);
}

export function listKpiStatuses(db: Database.Database, companyId: number): CompanyKpiStatus[] {
  return db
    .prepare("SELECT * FROM company_kpi_status WHERE company_id = ? ORDER BY metric_key")
    .all(companyId) as CompanyKpiStatus[];
}

export function deleteKpiStatus(db: Database.Database, companyId: number, metricKey: string): void {
  db.prepare("DELETE FROM company_kpi_status WHERE company_id = ? AND metric_key = ?").run(companyId, metricKey);
}
