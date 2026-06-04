import type Database from "better-sqlite3";
import type { Filing, FilingType } from "../types.js";

export function insertFiling(
  db: Database.Database,
  f: { company_id: number; type: FilingType; period: string | null; source_url: string | null; local_path: string | null },
): number {
  const existing = db.prepare(
    `SELECT id FROM filings WHERE company_id=@company_id AND type=@type
     AND IFNULL(period,'')=IFNULL(@period,'') AND IFNULL(source_url,'')=IFNULL(@source_url,'')`,
  ).get(f) as { id: number } | undefined;
  if (existing) return existing.id;
  const info = db.prepare(
    `INSERT INTO filings (company_id, type, period, source_url, local_path)
     VALUES (@company_id, @type, @period, @source_url, @local_path)`,
  ).run(f);
  return Number(info.lastInsertRowid);
}

export function listFilings(db: Database.Database, companyId: number): Filing[] {
  return db.prepare("SELECT * FROM filings WHERE company_id = ? ORDER BY id").all(companyId) as Filing[];
}

export function setFilingSourceId(db: Database.Database, filingId: number, sourceId: string): void {
  db.prepare("UPDATE filings SET notebooklm_source_id = ? WHERE id = ?").run(sourceId, filingId);
}

export function getFilingBySourceId(
  db: Database.Database,
  companyId: number,
  sourceId: string,
): Filing | undefined {
  return db
    .prepare("SELECT * FROM filings WHERE company_id = ? AND notebooklm_source_id = ?")
    .get(companyId, sourceId) as Filing | undefined;
}
