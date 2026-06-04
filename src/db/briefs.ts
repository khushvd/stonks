import type Database from "better-sqlite3";

export function saveBrief(db: Database.Database, companyId: number, ask: string | null, json: string): number {
  const info = db
    .prepare("INSERT INTO briefs (company_id, ask, json) VALUES (?, ?, ?)")
    .run(companyId, ask, json);
  return Number(info.lastInsertRowid);
}

export function getLatestBrief(
  db: Database.Database,
  companyId: number,
): { ask: string | null; json: string } | null {
  const row = db
    .prepare("SELECT ask, json FROM briefs WHERE company_id = ? ORDER BY id DESC LIMIT 1")
    .get(companyId) as { ask: string | null; json: string } | undefined;
  return row ?? null;
}
