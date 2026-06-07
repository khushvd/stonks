import type Database from "better-sqlite3";

function hasColumn(db: Database.Database, table: string, col: string): boolean {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return cols.some((c) => c.name === col);
}

export function migrate(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS industry_metrics (
      industry TEXT NOT NULL,
      metric_key TEXT NOT NULL,
      label TEXT,
      source TEXT NOT NULL CHECK(source IN ('notebooklm','sonnet')),
      PRIMARY KEY (industry, metric_key)
    );
  `);
  if (!hasColumn(db, "industry_metrics", "unit")) {
    db.exec("ALTER TABLE industry_metrics ADD COLUMN unit TEXT");
  }
  if (!hasColumn(db, "industry_metrics", "description")) {
    db.exec("ALTER TABLE industry_metrics ADD COLUMN description TEXT");
  }
  if (!hasColumn(db, "industry_metrics", "priority")) {
    db.exec("ALTER TABLE industry_metrics ADD COLUMN priority INTEGER");
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS company_kpi_status (
      company_id INTEGER NOT NULL REFERENCES companies(id),
      metric_key TEXT NOT NULL,
      label TEXT,
      unit TEXT,
      status TEXT NOT NULL CHECK(status IN ('missing','failed')),
      missing_reason TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (company_id, metric_key)
    );
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS analysis_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_name TEXT NOT NULL,
      ask TEXT NOT NULL,
      plan_json TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('planned','running','failed','completed','cancelled')),
      failed_step_id TEXT,
      error_message TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS analysis_run_steps (
      run_id INTEGER NOT NULL REFERENCES analysis_runs(id) ON DELETE CASCADE,
      step_id TEXT NOT NULL,
      label TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('pending','running','completed','failed','skipped')),
      started_at TEXT,
      completed_at TEXT,
      error_message TEXT,
      PRIMARY KEY (run_id, step_id)
    );
  `);

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

  db.exec(`
    CREATE TABLE IF NOT EXISTS commentary_trends (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id        INTEGER NOT NULL REFERENCES companies(id),
      period            TEXT NOT NULL,
      summary           TEXT NOT NULL,
      tone              TEXT NOT NULL CHECK(tone IN ('cautious','neutral','optimistic','confident')),
      key_topics        TEXT NOT NULL,
      contradiction_note TEXT,
      created_at        TEXT DEFAULT (datetime('now'))
    );
  `);
}
