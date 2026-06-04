import type Database from "better-sqlite3";

function hasColumn(db: Database.Database, table: string, col: string): boolean {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return cols.some((c) => c.name === col);
}

export function migrate(db: Database.Database): void {
  if (!hasColumn(db, "metrics", "trust")) {
    db.exec("ALTER TABLE metrics ADD COLUMN trust TEXT NOT NULL DEFAULT 'verified' CHECK(trust IN ('verified','notebooklm-only'))");
  }
  if (!hasColumn(db, "metrics_staging", "excerpt")) {
    db.exec("ALTER TABLE metrics_staging ADD COLUMN excerpt TEXT");
  }
  if (!hasColumn(db, "metrics_staging", "source_url")) {
    db.exec("ALTER TABLE metrics_staging ADD COLUMN source_url TEXT");
  }
  if (!hasColumn(db, "filings", "notebooklm_source_id")) {
    db.exec("ALTER TABLE filings ADD COLUMN notebooklm_source_id TEXT");
  }
  if (!hasColumn(db, "metrics_staging", "notebooklm_source_id")) {
    db.exec("ALTER TABLE metrics_staging ADD COLUMN notebooklm_source_id TEXT");
  }

  // user_version 1: rebuild metrics table to allow nullable filing_id + add company_id + add 'screener' trust tier.
  // SQLite cannot ALTER a NOT NULL constraint or CHECK constraint, so we rebuild the table.
  const userVersion = (db.pragma("user_version", { simple: true }) as number) ?? 0;
  if (userVersion < 1) {
    if (!hasColumn(db, "metrics", "company_id")) {
      // Rebuild the metrics table. Disable FK checks during rebuild so we can create the table
      // even in test environments that may not have the companies table yet.
      const fkWasOn = (db.pragma("foreign_keys", { simple: true }) as number) === 1;
      if (fkWasOn) db.pragma("foreign_keys = OFF");
      db.transaction(() => {
        db.exec(`
          CREATE TABLE metrics_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            filing_id INTEGER REFERENCES filings(id),
            company_id INTEGER REFERENCES companies(id),
            name TEXT NOT NULL,
            value REAL NOT NULL,
            unit TEXT,
            period TEXT,
            source_page INTEGER,
            trust TEXT NOT NULL DEFAULT 'verified' CHECK(trust IN ('verified','notebooklm-only','screener'))
          );
          INSERT INTO metrics_new (id, filing_id, name, value, unit, period, source_page, trust)
            SELECT id, filing_id, name, value, unit, period, source_page, trust FROM metrics;
          DROP TABLE metrics;
          ALTER TABLE metrics_new RENAME TO metrics;
        `);
      })();
      if (fkWasOn) db.pragma("foreign_keys = ON");
    }
    db.pragma("user_version = 1");
  }
}
