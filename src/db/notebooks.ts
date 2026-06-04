import type Database from "better-sqlite3";
import type { Notebook } from "../types.js";

export function upsertNotebook(
  db: Database.Database,
  companyId: number,
  url: string | null,
  notebookId: string | null,
): void {
  db.prepare(
    `INSERT INTO notebooks (company_id, notebook_url, notebook_id)
     VALUES (@company_id, @notebook_url, @notebook_id)
     ON CONFLICT(company_id) DO UPDATE SET notebook_url=excluded.notebook_url, notebook_id=excluded.notebook_id`,
  ).run({ company_id: companyId, notebook_url: url, notebook_id: notebookId });
}

export function getNotebook(db: Database.Database, companyId: number): Notebook | undefined {
  return db.prepare("SELECT * FROM notebooks WHERE company_id = ?").get(companyId) as Notebook | undefined;
}
