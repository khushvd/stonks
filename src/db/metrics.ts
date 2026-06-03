import type Database from "better-sqlite3";
import type { Metric, MetricInput, StagedMetric, IntegritySummary, Trust } from "../types.js";

export function stageMetric(db: Database.Database, m: MetricInput): number {
  // Default the optional field so better-sqlite3 never sees a missing named param.
  const row = { notebooklm_source_id: null, ...m };
  const info = db.prepare(
    `INSERT INTO metrics_staging (filing_id, name, value, unit, period, source_page, excerpt, source_url, notebooklm_source_id, status)
     VALUES (@filing_id, @name, @value, @unit, @period, @source_page, @excerpt, @source_url, @notebooklm_source_id, 'pending')`,
  ).run(row);
  return Number(info.lastInsertRowid);
}

export function promoteMetric(db: Database.Database, stagingId: number, trust: Trust = "verified"): number {
  const row = db.prepare("SELECT * FROM metrics_staging WHERE id = ? AND status = 'pending'").get(stagingId) as StagedMetric | undefined;
  if (!row) throw new Error(`No pending staged metric with id ${stagingId}`);
  const clean = { filing_id: row.filing_id, name: row.name, value: row.value, unit: row.unit, period: row.period, source_page: row.source_page, trust };
  const tx = db.transaction(() => {
    const info = db.prepare(
      `INSERT INTO metrics (filing_id, name, value, unit, period, source_page, trust)
       VALUES (@filing_id, @name, @value, @unit, @period, @source_page, @trust)`,
    ).run(clean);
    db.prepare("DELETE FROM metrics_staging WHERE id = ?").run(stagingId);
    return Number(info.lastInsertRowid);
  });
  return tx();
}

export function rejectMetric(db: Database.Database, stagingId: number, reason: string): void {
  const info = db.prepare(
    "UPDATE metrics_staging SET status='rejected', reject_reason=? WHERE id=? AND status='pending'",
  ).run(reason, stagingId);
  if (info.changes === 0) throw new Error(`No pending staged metric with id ${stagingId}`);
}

export function listMetrics(db: Database.Database, filingId?: number): Metric[] {
  if (filingId === undefined) return db.prepare("SELECT * FROM metrics ORDER BY id").all() as Metric[];
  return db.prepare("SELECT * FROM metrics WHERE filing_id = ? ORDER BY id").all(filingId) as Metric[];
}

export function listStaging(db: Database.Database, status?: "pending" | "rejected"): StagedMetric[] {
  if (status === undefined) return db.prepare("SELECT * FROM metrics_staging ORDER BY id").all() as StagedMetric[];
  return db.prepare("SELECT * FROM metrics_staging WHERE status = ? ORDER BY id").all(status) as StagedMetric[];
}

export function integritySummary(db: Database.Database): IntegritySummary {
  const verified = (db.prepare("SELECT count(*) c FROM metrics WHERE trust='verified'").get() as { c: number }).c;
  const notebooklmOnly = (db.prepare("SELECT count(*) c FROM metrics WHERE trust='notebooklm-only'").get() as { c: number }).c;
  const pending = (db.prepare("SELECT count(*) c FROM metrics_staging WHERE status='pending'").get() as { c: number }).c;
  const rejected = (db.prepare("SELECT count(*) c FROM metrics_staging WHERE status='rejected'").get() as { c: number }).c;
  return { verified, notebooklmOnly, pending, rejected };
}
