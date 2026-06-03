import type Database from "better-sqlite3";
import type { Filing, FilingType } from "../types.js";

export function insertFiling(
  db: Database.Database,
  f: { company_id: number; type: FilingType; period: string | null; source_url: string | null; local_path: string | null },
): number {
  const info = db.prepare(
    `INSERT OR IGNORE INTO filings (company_id, type, period, source_url, local_path)
     VALUES (@company_id, @type, @period, @source_url, @local_path)`,
  ).run(f);
  if (info.changes > 0) return Number(info.lastInsertRowid);
  return (db.prepare(
    `SELECT id FROM filings WHERE company_id=@company_id AND type=@type
     AND IFNULL(period,'')=IFNULL(@period,'') AND IFNULL(source_url,'')=IFNULL(@source_url,'')`,
  ).get(f) as { id: number }).id;
}

export function listFilings(db: Database.Database, companyId: number): Filing[] {
  return db.prepare("SELECT * FROM filings WHERE company_id = ? ORDER BY id").all(companyId) as Filing[];
}
