import { describe, it, expect } from "vitest";
import Database from "better-sqlite3";
import { migrate } from "../../src/db/migrate.js";

function legacyDb(): Database.Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE filings (id INTEGER PRIMARY KEY, company_id INTEGER, type TEXT, period TEXT, source_url TEXT, local_path TEXT);
    CREATE TABLE metrics (id INTEGER PRIMARY KEY, filing_id INTEGER, name TEXT, value REAL, unit TEXT, period TEXT, source_page INTEGER);
    CREATE TABLE metrics_staging (id INTEGER PRIMARY KEY, filing_id INTEGER, name TEXT, value REAL, unit TEXT, period TEXT, source_page INTEGER, status TEXT, reject_reason TEXT);
  `);
  return db;
}

function columns(db: Database.Database, table: string): string[] {
  return (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name);
}

describe("migrate", () => {
  it("adds trust to metrics and excerpt/source_url to metrics_staging", () => {
    const db = legacyDb();
    migrate(db);
    expect(columns(db, "metrics")).toContain("trust");
    expect(columns(db, "metrics_staging")).toContain("excerpt");
    expect(columns(db, "metrics_staging")).toContain("source_url");
  });

  it("defaults existing metrics rows to trust='verified'", () => {
    const db = legacyDb();
    db.prepare("INSERT INTO metrics (filing_id,name,value) VALUES (1,'revenue',100)").run();
    migrate(db);
    const row = db.prepare("SELECT trust FROM metrics WHERE name='revenue'").get() as { trust: string };
    expect(row.trust).toBe("verified");
  });

  it("is idempotent — running twice does not throw", () => {
    const db = legacyDb();
    migrate(db);
    expect(() => migrate(db)).not.toThrow();
  });

  it("adds notebooklm_source_id to filings and metrics_staging", () => {
    const db = legacyDb();
    migrate(db);
    expect(columns(db, "filings")).toContain("notebooklm_source_id");
    expect(columns(db, "metrics_staging")).toContain("notebooklm_source_id");
  });

  it("adds peer KPI status storage and industry metric metadata", () => {
    const db = legacyDb();
    migrate(db);
    expect(columns(db, "company_kpi_status")).toEqual(
      expect.arrayContaining(["company_id", "metric_key", "label", "unit", "status", "missing_reason", "updated_at"]),
    );
    expect(columns(db, "industry_metrics")).toEqual(
      expect.arrayContaining(["unit", "description", "priority"]),
    );
  });
});
