import Database from "better-sqlite3";
import { readFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..", "..");

export function dataDir(): string {
  const dir = join(projectRoot, "data");
  mkdirSync(dir, { recursive: true });
  return dir;
}

// Pass ":memory:" in tests for an isolated DB.
export function openDb(path?: string): Database.Database {
  const dbPath = path ?? join(dataDir(), "stonks.db");
  const db = new Database(dbPath);
  db.pragma("foreign_keys = ON");
  const schema = readFileSync(join(__dirname, "schema.sql"), "utf8");
  db.exec(schema);
  return db;
}
