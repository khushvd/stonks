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
}
