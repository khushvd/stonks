import type Database from "better-sqlite3";
import type { Company } from "../types.js";

export function upsertCompany(
  db: Database.Database,
  c: { name: string; ticker: string | null; industry: string | null },
): number {
  db.prepare(
    `INSERT INTO companies (name, ticker, industry) VALUES (@name, @ticker, @industry)
     ON CONFLICT(name) DO UPDATE SET ticker=excluded.ticker, industry=excluded.industry`,
  ).run(c);
  return (db.prepare("SELECT id FROM companies WHERE name = ?").get(c.name) as { id: number }).id;
}

export function getCompany(db: Database.Database, name: string): Company | undefined {
  return db.prepare("SELECT * FROM companies WHERE name = ?").get(name) as Company | undefined;
}
