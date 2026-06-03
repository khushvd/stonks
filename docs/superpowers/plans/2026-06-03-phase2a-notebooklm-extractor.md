# Phase 2a — NotebookLM Extractor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Phase 1's raw-pdfjs-text extraction with a NotebookLM-driven flow — NotebookLM proposes numbers from a company's filings, the existing pdfjs Verifier disposes (confirms against the cited source page) — all CLI-driven and proven end-to-end on Asian Paints.

**Architecture:** Three independently re-runnable stages. (1) The Phase-1 Playwright **scraper** (unchanged) downloads PDFs and records public BSE source URLs. (2) An **ingestor agent** (`claude -p` + NotebookLM MCP) adds each filing's URL to a per-company NotebookLM notebook. (3) An **extractor agent** asks NotebookLM for a canonical + industry + free-text metric set and stages the answers with their citation excerpts; the **verifier agent** searches the local PDF for each cited number and promotes it as `verified`, marks chart-only numbers `notebooklm-only`, or rejects. CLI scripts stay dumb deterministic "hands" (DB plumbing + printing the metric list); the agents are the "brains" launched via `claude -p`.

**Tech Stack:** TypeScript ESM, pnpm, Vitest, tsx, better-sqlite3, pdfjs-dist v6 legacy build, Playwright (existing), NotebookLM MCP (`github.com/PleasePrompto/notebooklm-mcp`).

---

## File Structure

**New files**
- `src/db/migrate.ts` — guarded column migrations (idempotent `ALTER`s for existing DBs).
- `src/db/notebooks.ts` — `upsertNotebook` / `getNotebook`.
- `src/db/industry-metrics.ts` — `getIndustryMetrics` / `setIndustryMetrics`.
- `src/extract/canonical.ts` — the universal base metric list (shared constant).
- `src/notebooklm/parse-citations.ts` — pure parser: NLM JSON → typed staged-metric rows.
- `src/verifier/match.ts` — pure classifier: staged metric + page texts → `verified | notebooklm-only | reject` + `source_page`.
- `src/cli/ingest.ts` — thin helper: prints a company's filings + notebook state for the ingestor agent.
- `src/cli/extract.ts` — thin helper: resolves + prints the canonical/industry/ask metric set for the extractor agent.
- `.claude/agents/ingestor.md` — new agent (Sonnet).
- `docs/notebooklm-extractor.md` — usage manual.
- `docs/superpowers/runs/2026-06-03-phase2a-asianpaint.md` — live E2E run record (final task).
- Tests: `tests/db/migrate.test.ts`, `tests/db/notebooks.test.ts`, `tests/db/industry-metrics.test.ts`, `tests/notebooklm/parse-citations.test.ts`, `tests/verifier/match.test.ts`. Extend `tests/db/metrics.test.ts`.

**Modified files**
- `src/db/schema.sql` — add `trust` to `metrics`; `excerpt`/`source_url` to `metrics_staging`; new `notebooks` + `industry_metrics` tables.
- `src/db/db.ts` — call `migrate(db)` after applying schema.
- `src/types.ts` — `trust` on `Metric`; `excerpt`/`source_url` on staging types; `Notebook`, `IndustryMetric`, `Citation` types.
- `src/db/metrics.ts` — `stageMetric` persists excerpt/source_url; `promoteMetric` takes a `trust` arg; `listMetrics` exposes trust; `integritySummary` splits verified vs notebooklm-only.
- `src/cli/db.ts` — `promote` takes optional trust; new `get-notebook`/`set-notebook`/`get-industry-metrics`/`set-industry-metrics` commands.
- `.claude/agents/extractor.md` — rewritten to query NotebookLM.
- `.claude/agents/verifier.md` — set trust on promote; match by excerpt when no page cited.
- `package.json` — add `ingest` + `extract` scripts.

---

## Task 1: Schema + guarded migration

**Files:**
- Modify: `src/db/schema.sql`
- Create: `src/db/migrate.ts`
- Modify: `src/db/db.ts:16-23`
- Test: `tests/db/migrate.test.ts`

- [ ] **Step 1: Update `schema.sql` so fresh DBs already have the new shape**

Replace the `metrics` and `metrics_staging` `CREATE` blocks and append the two new tables. Final state of the file:

```sql
CREATE TABLE IF NOT EXISTS companies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  ticker TEXT,
  industry TEXT
);

CREATE TABLE IF NOT EXISTS filings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  type TEXT NOT NULL CHECK(type IN ('presentation','result','annual_report')),
  period TEXT,
  source_url TEXT,
  local_path TEXT,
  UNIQUE(company_id, type, period, source_url)
);

CREATE TABLE IF NOT EXISTS metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  filing_id INTEGER NOT NULL REFERENCES filings(id),
  name TEXT NOT NULL,
  value REAL NOT NULL,
  unit TEXT,
  period TEXT,
  source_page INTEGER,
  trust TEXT NOT NULL DEFAULT 'verified' CHECK(trust IN ('verified','notebooklm-only'))
);

CREATE TABLE IF NOT EXISTS metrics_staging (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  filing_id INTEGER NOT NULL REFERENCES filings(id),
  name TEXT NOT NULL,
  value REAL NOT NULL,
  unit TEXT,
  period TEXT,
  source_page INTEGER,
  excerpt TEXT,
  source_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','rejected')),
  reject_reason TEXT
);

CREATE TABLE IF NOT EXISTS notebooks (
  company_id INTEGER PRIMARY KEY REFERENCES companies(id),
  notebook_url TEXT,
  notebook_id TEXT
);

CREATE TABLE IF NOT EXISTS industry_metrics (
  industry TEXT NOT NULL,
  metric_key TEXT NOT NULL,
  label TEXT,
  source TEXT NOT NULL CHECK(source IN ('notebooklm','sonnet')),
  PRIMARY KEY (industry, metric_key)
);
```

- [ ] **Step 2: Write the failing migration test**

`CREATE TABLE IF NOT EXISTS` does NOT add columns to a table that already exists from a Phase-1 DB, so existing DBs need guarded `ALTER`s. This test simulates a pre-migration DB.

```ts
// tests/db/migrate.test.ts
import { describe, it, expect } from "vitest";
import Database from "better-sqlite3";
import { migrate } from "../../src/db/migrate.js";

// A pre-Phase-2a metrics/metrics_staging shape (no trust/excerpt/source_url).
function legacyDb(): Database.Database {
  const db = new Database(":memory:");
  db.exec(`
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
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm test migrate`
Expected: FAIL — cannot find module `../../src/db/migrate.js`.

- [ ] **Step 4: Implement `migrate.ts`**

```ts
// src/db/migrate.ts
import type Database from "better-sqlite3";

function hasColumn(db: Database.Database, table: string, col: string): boolean {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return cols.some((c) => c.name === col);
}

// Idempotent column additions for DBs created before Phase 2a.
// schema.sql carries these for fresh DBs; ALTER ADD COLUMN is not idempotent, so guard each.
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
```

- [ ] **Step 5: Wire `migrate` into `openDb`**

In `src/db/db.ts`, import and call it after the schema is applied:

```ts
import Database from "better-sqlite3";
import { readFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { migrate } from "./migrate.js";

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
  migrate(db);
  return db;
}
```

- [ ] **Step 6: Run the full suite to verify nothing regressed**

Run: `pnpm test`
Expected: PASS — migrate tests green, all existing Phase-1 tests still green.

- [ ] **Step 7: Commit**

```bash
git add src/db/schema.sql src/db/migrate.ts src/db/db.ts tests/db/migrate.test.ts
git commit -m "feat(db): add trust/excerpt/source_url schema + guarded migration"
```

---

## Task 2: Types

**Files:**
- Modify: `src/types.ts`

- [ ] **Step 1: Add the new types and fields**

Append/modify in `src/types.ts`. `MetricInput` gains the staging-only `excerpt`/`source_url` (nullable); `Metric` gains `trust`; add `Notebook`, `IndustryMetric`, `Citation`.

```ts
export type Trust = "verified" | "notebooklm-only";

export interface MetricInput {
  filing_id: number;
  name: string;
  value: number;
  unit: string | null;
  period: string | null;
  source_page: number | null;
  excerpt: string | null;
  source_url: string | null;
}

export interface Metric {
  id: number;
  filing_id: number;
  name: string;
  value: number;
  unit: string | null;
  period: string | null;
  source_page: number | null;
  trust: Trust;
}

export interface StagedMetric extends MetricInput {
  id: number;
  status: "pending" | "rejected";
  reject_reason: string | null;
}

export interface IntegritySummary {
  verified: number;
  notebooklmOnly: number;
  pending: number;
  rejected: number;
}

export interface Notebook {
  company_id: number;
  notebook_url: string | null;
  notebook_id: string | null;
}

export interface IndustryMetric {
  industry: string;
  metric_key: string;
  label: string | null;
  source: "notebooklm" | "sonnet";
}

// One normalized metric proposed by NotebookLM, paired with the citation that backs it.
export interface Citation {
  name: string;
  value: number;
  unit: string | null;
  period: string | null;
  excerpt: string | null;
  sourceUrl: string | null;
}
```

Note: `Metric` is now spelled out (no longer `extends MetricInput`) because the live `metrics` table has `trust` but not `excerpt`/`source_url`. `StagedMetric` keeps extending `MetricInput`.

- [ ] **Step 2: Type-check**

Run: `pnpm exec tsc --noEmit`
Expected: errors ONLY in `src/db/metrics.ts` (it references the old shapes — fixed in Task 3). No errors in `types.ts` itself.

- [ ] **Step 3: Commit**

```bash
git add src/types.ts
git commit -m "feat(types): trust, staging excerpt/source_url, notebook + citation types"
```

---

## Task 3: metrics.ts — trust on promote, excerpt/source_url on stage, split summary

**Files:**
- Modify: `src/db/metrics.ts`
- Test: `tests/db/metrics.test.ts`

- [ ] **Step 1: Update the existing test for the new shapes**

The existing tests pass `MetricInput` without `excerpt`/`source_url` and expect a 3-field summary. Update `setup`'s metric inputs and the summary assertions, and add trust coverage. Replace the whole file:

```ts
import { describe, it, expect } from "vitest";
import { openDb } from "../../src/db/db.js";
import { upsertCompany } from "../../src/db/companies.js";
import { insertFiling } from "../../src/db/filings.js";
import { stageMetric, promoteMetric, rejectMetric, listMetrics, listStaging, integritySummary } from "../../src/db/metrics.js";
import type { MetricInput } from "../../src/types.js";

function setup() {
  const db = openDb(":memory:");
  const companyId = upsertCompany(db, { name: "Asian Paints", ticker: null, industry: null });
  const filingId = insertFiling(db, { company_id: companyId, type: "result", period: "Q4FY26", source_url: "u", local_path: "p" });
  return { db, filingId };
}

function input(filingId: number, over: Partial<MetricInput> = {}): MetricInput {
  return { filing_id: filingId, name: "revenue", value: 1000, unit: "INR cr", period: "Q4FY26", source_page: 3, excerpt: "Revenue 1,000 cr", source_url: "https://bse/u.pdf", ...over };
}

describe("metrics staging and promotion", () => {
  it("stages a metric as pending with its excerpt and source_url, not in live table", () => {
    const { db, filingId } = setup();
    stageMetric(db, input(filingId));
    const staged = listStaging(db, "pending");
    expect(staged).toHaveLength(1);
    expect(staged[0].excerpt).toBe("Revenue 1,000 cr");
    expect(staged[0].source_url).toBe("https://bse/u.pdf");
    expect(listMetrics(db)).toHaveLength(0);
    expect(integritySummary(db)).toEqual({ verified: 0, notebooklmOnly: 0, pending: 1, rejected: 0 });
  });

  it("promotes as verified by default", () => {
    const { db, filingId } = setup();
    const sid = stageMetric(db, input(filingId));
    const mid = promoteMetric(db, sid);
    const live = listMetrics(db);
    expect(live).toHaveLength(1);
    expect(live[0].id).toBe(mid);
    expect(live[0].value).toBe(1000);
    expect(live[0].trust).toBe("verified");
    expect(listStaging(db, "pending")).toHaveLength(0);
    expect(integritySummary(db)).toEqual({ verified: 1, notebooklmOnly: 0, pending: 0, rejected: 0 });
  });

  it("promotes with trust='notebooklm-only' when asked", () => {
    const { db, filingId } = setup();
    const sid = stageMetric(db, input(filingId, { name: "occupancy", value: 72 }));
    promoteMetric(db, sid, "notebooklm-only");
    const live = listMetrics(db);
    expect(live[0].trust).toBe("notebooklm-only");
    expect(integritySummary(db)).toEqual({ verified: 0, notebooklmOnly: 1, pending: 0, rejected: 0 });
  });

  it("rejects a staged metric with a reason and keeps it out of the live table", () => {
    const { db, filingId } = setup();
    const sid = stageMetric(db, input(filingId, { value: 9999, unit: null, period: null }));
    rejectMetric(db, sid, "value not found on source page");
    expect(listMetrics(db)).toHaveLength(0);
    const rejected = listStaging(db, "rejected");
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reject_reason).toBe("value not found on source page");
    expect(integritySummary(db)).toEqual({ verified: 0, notebooklmOnly: 0, pending: 0, rejected: 1 });
  });

  it("throws when promoting a non-pending id", () => {
    const { db } = setup();
    expect(() => promoteMetric(db, 999)).toThrow();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test metrics`
Expected: FAIL — `stageMetric` ignores excerpt/source_url, `promoteMetric` has no trust arg, summary lacks `notebooklmOnly`.

- [ ] **Step 3: Implement the changes**

Replace `src/db/metrics.ts`:

```ts
import type Database from "better-sqlite3";
import type { Metric, MetricInput, StagedMetric, IntegritySummary, Trust } from "../types.js";

export function stageMetric(db: Database.Database, m: MetricInput): number {
  const info = db.prepare(
    `INSERT INTO metrics_staging (filing_id, name, value, unit, period, source_page, excerpt, source_url, status)
     VALUES (@filing_id, @name, @value, @unit, @period, @source_page, @excerpt, @source_url, 'pending')`,
  ).run(m);
  return Number(info.lastInsertRowid);
}

export function promoteMetric(db: Database.Database, stagingId: number, trust: Trust = "verified"): number {
  const row = db.prepare("SELECT * FROM metrics_staging WHERE id = ? AND status = 'pending'").get(stagingId) as StagedMetric | undefined;
  if (!row) throw new Error(`No pending staged metric with id ${stagingId}`);
  const clean = { filing_id: row.filing_id, name: row.name, value: row.value, unit: row.unit, period: row.period, source_page: row.source_page, trust };
  const tx = db.transaction(() => {
    const info = db.prepare(
      `INSERT INTO metrics (filing_id, name, value, unit, period, source_page, trust)
       VALUES (@filing_id, @name, @value, @unit, @period, @source_page, @trust)`,
    ).run(clean);
    db.prepare("DELETE FROM metrics_staging WHERE id = ?").run(stagingId);
    return Number(info.lastInsertRowid);
  });
  return tx();
}

export function rejectMetric(db: Database.Database, stagingId: number, reason: string): void {
  const info = db.prepare(
    "UPDATE metrics_staging SET status='rejected', reject_reason=? WHERE id=? AND status='pending'",
  ).run(reason, stagingId);
  if (info.changes === 0) throw new Error(`No pending staged metric with id ${stagingId}`);
}

export function listMetrics(db: Database.Database, filingId?: number): Metric[] {
  if (filingId === undefined) return db.prepare("SELECT * FROM metrics ORDER BY id").all() as Metric[];
  return db.prepare("SELECT * FROM metrics WHERE filing_id = ? ORDER BY id").all(filingId) as Metric[];
}

export function listStaging(db: Database.Database, status?: "pending" | "rejected"): StagedMetric[] {
  if (status === undefined) return db.prepare("SELECT * FROM metrics_staging ORDER BY id").all() as StagedMetric[];
  return db.prepare("SELECT * FROM metrics_staging WHERE status = ? ORDER BY id").all(status) as StagedMetric[];
}

export function integritySummary(db: Database.Database): IntegritySummary {
  const verified = (db.prepare("SELECT count(*) c FROM metrics WHERE trust='verified'").get() as { c: number }).c;
  const notebooklmOnly = (db.prepare("SELECT count(*) c FROM metrics WHERE trust='notebooklm-only'").get() as { c: number }).c;
  const pending = (db.prepare("SELECT count(*) c FROM metrics_staging WHERE status='pending'").get() as { c: number }).c;
  const rejected = (db.prepare("SELECT count(*) c FROM metrics_staging WHERE status='rejected'").get() as { c: number }).c;
  return { verified, notebooklmOnly, pending, rejected };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test metrics`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/db/metrics.ts tests/db/metrics.test.ts
git commit -m "feat(db): trust on promote, excerpt/source_url on stage, split summary"
```

---

## Task 4: notebooks.ts

**Files:**
- Create: `src/db/notebooks.ts`
- Test: `tests/db/notebooks.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/db/notebooks.test.ts
import { describe, it, expect } from "vitest";
import { openDb } from "../../src/db/db.js";
import { upsertCompany } from "../../src/db/companies.js";
import { upsertNotebook, getNotebook } from "../../src/db/notebooks.js";

function setup() {
  const db = openDb(":memory:");
  const companyId = upsertCompany(db, { name: "Asian Paints", ticker: "ASIANPAINT", industry: "paints" });
  return { db, companyId };
}

describe("notebooks", () => {
  it("returns undefined when no notebook is registered", () => {
    const { db, companyId } = setup();
    expect(getNotebook(db, companyId)).toBeUndefined();
  });

  it("upserts and reads back a notebook", () => {
    const { db, companyId } = setup();
    upsertNotebook(db, companyId, "https://notebooklm.google.com/notebook/abc", "abc");
    expect(getNotebook(db, companyId)).toEqual({
      company_id: companyId,
      notebook_url: "https://notebooklm.google.com/notebook/abc",
      notebook_id: "abc",
    });
  });

  it("is idempotent — re-upsert overwrites, one row per company", () => {
    const { db, companyId } = setup();
    upsertNotebook(db, companyId, "https://old", "old");
    upsertNotebook(db, companyId, "https://new", "new");
    expect(getNotebook(db, companyId)).toEqual({ company_id: companyId, notebook_url: "https://new", notebook_id: "new" });
    const count = (db.prepare("SELECT count(*) c FROM notebooks").get() as { c: number }).c;
    expect(count).toBe(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test notebooks`
Expected: FAIL — cannot find module `../../src/db/notebooks.js`.

- [ ] **Step 3: Implement**

```ts
// src/db/notebooks.ts
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test notebooks`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/db/notebooks.ts tests/db/notebooks.test.ts
git commit -m "feat(db): notebooks upsert/get (idempotent per company)"
```

---

## Task 5: industry-metrics.ts

**Files:**
- Create: `src/db/industry-metrics.ts`
- Test: `tests/db/industry-metrics.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/db/industry-metrics.test.ts
import { describe, it, expect } from "vitest";
import { openDb } from "../../src/db/db.js";
import { getIndustryMetrics, setIndustryMetrics } from "../../src/db/industry-metrics.js";

describe("industry-metrics cache", () => {
  it("returns [] for an unseen industry", () => {
    const db = openDb(":memory:");
    expect(getIndustryMetrics(db, "hotels")).toEqual([]);
  });

  it("sets and reads back a metric list", () => {
    const db = openDb(":memory:");
    setIndustryMetrics(db, "hotels", [
      { metric_key: "occupancy", label: "Occupancy %" },
      { metric_key: "arr", label: "Average Room Rate" },
    ], "notebooklm");
    const got = getIndustryMetrics(db, "hotels");
    expect(got).toEqual([
      { industry: "hotels", metric_key: "occupancy", label: "Occupancy %", source: "notebooklm" },
      { industry: "hotels", metric_key: "arr", label: "Average Room Rate", source: "notebooklm" },
    ]);
  });

  it("replaces the full list on re-set (no stale rows, source can change to sonnet)", () => {
    const db = openDb(":memory:");
    setIndustryMetrics(db, "cement", [{ metric_key: "realisation", label: "Realisation" }], "notebooklm");
    setIndustryMetrics(db, "cement", [{ metric_key: "logistics_cost", label: "Logistics cost" }], "sonnet");
    const got = getIndustryMetrics(db, "cement");
    expect(got).toEqual([{ industry: "cement", metric_key: "logistics_cost", label: "Logistics cost", source: "sonnet" }]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test industry-metrics`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Implement**

`setIndustryMetrics` replaces the whole list for an industry in one transaction (delete-then-insert) so re-inference never leaves stale keys.

```ts
// src/db/industry-metrics.ts
import type Database from "better-sqlite3";
import type { IndustryMetric } from "../types.js";

export function getIndustryMetrics(db: Database.Database, industry: string): IndustryMetric[] {
  return db.prepare("SELECT * FROM industry_metrics WHERE industry = ? ORDER BY metric_key").all(industry) as IndustryMetric[];
}

export function setIndustryMetrics(
  db: Database.Database,
  industry: string,
  metrics: { metric_key: string; label: string | null }[],
  source: "notebooklm" | "sonnet",
): void {
  const tx = db.transaction(() => {
    db.prepare("DELETE FROM industry_metrics WHERE industry = ?").run(industry);
    const ins = db.prepare(
      "INSERT INTO industry_metrics (industry, metric_key, label, source) VALUES (?, ?, ?, ?)",
    );
    for (const m of metrics) ins.run(industry, m.metric_key, m.label, source);
  });
  tx();
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test industry-metrics`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/db/industry-metrics.ts tests/db/industry-metrics.test.ts
git commit -m "feat(db): industry-metrics cache (get/set, full-replace)"
```

---

## Task 6: parse-citations.ts

**Files:**
- Create: `src/notebooklm/parse-citations.ts`
- Test: `tests/notebooklm/parse-citations.test.ts`

**Context for the implementer:** The extractor agent instructs NotebookLM (`ask_question`, `source_format=json`) to return each metric as a JSON object with `name`, `value`, `unit`, `period`, plus a citation `excerpt` and optional `url`. NotebookLM's wrapper sometimes nests the array under an `answer`/`citations` key, sometimes returns a bare array, and values often arrive as formatted strings like `"9,200"` or `"₹9,200 cr"`. This parser is the tolerant normalizer that turns whatever came back into a clean `Citation[]`, dropping rows it can't make a number out of. Keeping it pure means the integrity-sensitive parsing is unit-tested, not left to agent improvisation.

- [ ] **Step 1: Write the failing test**

```ts
// tests/notebooklm/parse-citations.test.ts
import { describe, it, expect } from "vitest";
import { parseCitations } from "../../src/notebooklm/parse-citations.js";

describe("parseCitations", () => {
  it("parses a bare array with formatted number strings", () => {
    const raw = JSON.stringify([
      { name: "revenue", value: "9,200", unit: "INR cr", period: "Q4FY26", excerpt: "Revenue grew to 9,200 cr", url: "https://bse/p.pdf" },
    ]);
    expect(parseCitations(raw)).toEqual([
      { name: "revenue", value: 9200, unit: "INR cr", period: "Q4FY26", excerpt: "Revenue grew to 9,200 cr", sourceUrl: "https://bse/p.pdf" },
    ]);
  });

  it("unwraps a {metrics:[...]} or {citations:[...]} envelope", () => {
    const raw = JSON.stringify({ metrics: [{ name: "pat", value: 8330, excerpt: "PAT 8,330" }] });
    const got = parseCitations(raw);
    expect(got).toHaveLength(1);
    expect(got[0]).toEqual({ name: "pat", value: 8330, unit: null, period: null, excerpt: "PAT 8,330", sourceUrl: null });
  });

  it("strips currency symbols and parses decimals", () => {
    const raw = JSON.stringify([{ name: "ebitda margin", value: "₹ 18.5", unit: "%", excerpt: "margin 18.5%" }]);
    expect(parseCitations(raw)[0].value).toBe(18.5);
  });

  it("drops rows with no usable number or no name", () => {
    const raw = JSON.stringify([
      { name: "revenue", value: "n/a", excerpt: "not disclosed" },
      { value: 100, excerpt: "missing name" },
      { name: "pat", value: 8330, excerpt: "ok" },
    ]);
    const got = parseCitations(raw);
    expect(got).toHaveLength(1);
    expect(got[0].name).toBe("pat");
  });

  it("returns [] for non-JSON or non-array/non-envelope input", () => {
    expect(parseCitations("sorry, I could not find that")).toEqual([]);
    expect(parseCitations(JSON.stringify({ foo: "bar" }))).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test parse-citations`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Implement**

```ts
// src/notebooklm/parse-citations.ts
import type { Citation } from "../types.js";

// Pull a finite number out of a string/number like 9200, "9,200", "₹9,200 cr", "18.5%".
function toNumber(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  const m = v.replace(/,/g, "").match(/-?\d+(\.\d+)?/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : null;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v : null;
}

function rowsFrom(parsed: unknown): unknown[] {
  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === "object") {
    for (const key of ["metrics", "citations", "answer", "results", "data"]) {
      const v = (parsed as Record<string, unknown>)[key];
      if (Array.isArray(v)) return v;
    }
  }
  return [];
}

// Tolerant: parse NotebookLM's ask_question JSON into clean Citations.
// Drops any row without a name and a usable number — the integrity gate prefers gaps to guesses.
export function parseCitations(raw: string): Citation[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  const out: Citation[] = [];
  for (const r of rowsFrom(parsed)) {
    if (!r || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    const name = str(o.name);
    const value = toNumber(o.value);
    if (name === null || value === null) continue;
    out.push({
      name,
      value,
      unit: str(o.unit),
      period: str(o.period),
      excerpt: str(o.excerpt),
      sourceUrl: str(o.url) ?? str(o.sourceUrl),
    });
  }
  return out;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test parse-citations`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/notebooklm/parse-citations.ts tests/notebooklm/parse-citations.test.ts
git commit -m "feat(nlm): tolerant parser for ask_question JSON citations"
```

---

## Task 7: verifier/match.ts

**Files:**
- Create: `src/verifier/match.ts`
- Test: `tests/verifier/match.test.ts`

**Context for the implementer:** This is the integrity gate's brain, made pure and testable. Given a staged metric (its `value` and citation `excerpt`) and the local PDF's per-page text, it decides one of three outcomes:
- **verified** — the number itself appears verbatim on a page (allowing comma/decimal formatting). We trust it; record that page.
- **notebooklm-only** — the number is NOT in the page text, but the citation excerpt's wording IS present on a page. That means the source page exists but the number lives inside a chart image NLM OCR'd. Store it, flagged.
- **reject** — neither the number nor the excerpt can be located. Default to this when unsure.

- [ ] **Step 1: Write the failing test**

```ts
// tests/verifier/match.test.ts
import { describe, it, expect } from "vitest";
import { matchMetric } from "../../src/verifier/match.js";
import type { PageText } from "../../src/types.js";

const pages: PageText[] = [
  { page: 1, text: "Cover slide. Investor Presentation Q4 FY26." },
  { page: 28, text: "Consolidated PAT for the quarter stood at 8,330 crore versus 7,100 last year." },
  { page: 30, text: "Occupancy improved this quarter as shown in the chart below." },
];

describe("matchMetric", () => {
  it("verifies a number present verbatim (comma-formatted) and records the page", () => {
    const r = matchMetric({ value: 8330, excerpt: "PAT stood at 8,330 crore" }, pages);
    expect(r).toEqual({ decision: "verified", source_page: 28 });
  });

  it("verifies a plain integer that appears without commas", () => {
    const r = matchMetric({ value: 7100, excerpt: "versus 7,100 last year" }, pages);
    expect(r).toEqual({ decision: "verified", source_page: 28 });
  });

  it("marks notebooklm-only when the number is absent but the excerpt wording is on a page", () => {
    const r = matchMetric({ value: 72, excerpt: "Occupancy improved this quarter" }, pages);
    expect(r).toEqual({ decision: "notebooklm-only", source_page: 30 });
  });

  it("rejects when neither number nor excerpt can be located", () => {
    const r = matchMetric({ value: 99999, excerpt: "totally fabricated line" }, pages);
    expect(r).toEqual({ decision: "reject", source_page: null });
  });

  it("rejects a number with a null/empty excerpt that is not present anywhere", () => {
    const r = matchMetric({ value: 12345, excerpt: null }, pages);
    expect(r).toEqual({ decision: "reject", source_page: null });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test verifier`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Implement**

```ts
// src/verifier/match.ts
import type { PageText } from "../types.js";

export type MatchDecision = "verified" | "notebooklm-only" | "reject";
export interface MatchResult {
  decision: MatchDecision;
  source_page: number | null;
}

// Build a regex that matches the number with optional thousands separators:
// 8330 -> /\b8[,]?330\b/  (also matches "8,330"); decimals matched loosely.
function numberRegex(value: number): RegExp {
  const [intPart, decPart] = String(value).split(".");
  const sign = intPart.startsWith("-") ? "-?" : "";
  const digits = intPart.replace("-", "");
  // allow an optional comma between every position so "8330" matches "8,330".
  const grouped = digits.split("").join("[,]?");
  const dec = decPart ? `\\.${decPart}` : "(\\.\\d+)?";
  return new RegExp(`${sign}\\b${grouped}\\b${dec}`);
}

// Distinctive substring of the excerpt to look for (collapse whitespace, take a chunk).
function excerptNeedle(excerpt: string | null): string | null {
  if (!excerpt) return null;
  const norm = excerpt.replace(/\s+/g, " ").trim();
  return norm.length >= 6 ? norm.slice(0, 60).toLowerCase() : null;
}

export function matchMetric(input: { value: number; excerpt: string | null }, pages: PageText[]): MatchResult {
  const re = numberRegex(input.value);
  for (const p of pages) {
    if (re.test(p.text)) return { decision: "verified", source_page: p.page };
  }
  const needle = excerptNeedle(input.excerpt);
  if (needle) {
    for (const p of pages) {
      if (p.text.replace(/\s+/g, " ").toLowerCase().includes(needle)) {
        return { decision: "notebooklm-only", source_page: p.page };
      }
    }
  }
  return { decision: "reject", source_page: null };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test verifier`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/verifier/match.ts tests/verifier/match.test.ts
git commit -m "feat(verifier): pure verified/notebooklm-only/reject classifier"
```

---

## Task 8: db CLI — promote trust + notebook + industry-metrics commands

**Files:**
- Modify: `src/cli/db.ts`

**Context:** The agents drive everything through `pnpm db <cmd>` via Bash. The verifier needs to set trust on promote; the ingestor needs to read/write the notebook row; the extractor needs to read/write the industry-metric cache.

- [ ] **Step 1: Replace `src/cli/db.ts`**

```ts
import { openDb } from "../db/db.js";
import { stageMetric, promoteMetric, rejectMetric, listMetrics, listStaging, integritySummary } from "../db/metrics.js";
import { getNotebook, upsertNotebook } from "../db/notebooks.js";
import { getIndustryMetrics, setIndustryMetrics } from "../db/industry-metrics.js";
import type { Trust } from "../types.js";

const [, , cmd, ...rest] = process.argv;
const db = openDb();

function out(v: unknown) { console.log(JSON.stringify(v, null, 2)); }

switch (cmd) {
  case "stage": {
    // pnpm db stage '<json MetricInput>'
    out({ staging_id: stageMetric(db, JSON.parse(rest[0])) });
    break;
  }
  // pnpm db promote <id> [verified|notebooklm-only]   (default verified)
  case "promote": { out({ metric_id: promoteMetric(db, Number(rest[0]), (rest[1] as Trust) ?? "verified") }); break; }
  case "reject": { rejectMetric(db, Number(rest[0]), rest.slice(1).join(" ")); out({ ok: true }); break; }
  case "list-metrics": { out(listMetrics(db, rest[0] ? Number(rest[0]) : undefined)); break; }
  case "list-staging": { out(listStaging(db, rest[0] as "pending" | "rejected" | undefined)); break; }
  case "summary": { out(integritySummary(db)); break; }
  // pnpm db get-notebook <companyId>
  case "get-notebook": { out(getNotebook(db, Number(rest[0])) ?? null); break; }
  // pnpm db set-notebook <companyId> <url> [notebookId]
  case "set-notebook": { upsertNotebook(db, Number(rest[0]), rest[1] ?? null, rest[2] ?? null); out({ ok: true }); break; }
  // pnpm db get-industry-metrics <industry>
  case "get-industry-metrics": { out(getIndustryMetrics(db, rest[0])); break; }
  // pnpm db set-industry-metrics <industry> <notebooklm|sonnet> '<json [{metric_key,label}]>'
  case "set-industry-metrics": { setIndustryMetrics(db, rest[0], JSON.parse(rest[2]), rest[1] as "notebooklm" | "sonnet"); out({ ok: true }); break; }
  default:
    console.error("commands: stage <json> | promote <id> [trust] | reject <id> <reason> | list-metrics [filingId] | list-staging [status] | summary | get-notebook <companyId> | set-notebook <companyId> <url> [notebookId] | get-industry-metrics <industry> | set-industry-metrics <industry> <source> <json>");
    process.exit(1);
}
```

- [ ] **Step 2: Manually smoke-test the new commands against an in-memory-like temp DB**

Run:
```bash
pnpm db summary
pnpm db set-notebook 1 https://notebooklm.google.com/notebook/test t1 && pnpm db get-notebook 1
pnpm db set-industry-metrics paints notebooklm '[{"metric_key":"realisation","label":"Realisation"}]' && pnpm db get-industry-metrics paints
```
Expected: `summary` prints `{verified,notebooklmOnly,pending,rejected}`; set/get round-trip the notebook and industry rows. (These write to the real `data/stonks.db`; harmless test rows. Clean up with `pnpm db ...` later or leave — company 1 already exists from Phase 1.)

- [ ] **Step 3: Run the full suite (no regressions)**

Run: `pnpm test`
Expected: PASS — all tests from Tasks 1–7 green.

- [ ] **Step 4: Commit**

```bash
git add src/cli/db.ts
git commit -m "feat(cli): db promote trust + notebook/industry-metrics commands"
```

---

## Task 9: canonical.ts + extract CLI helper

**Files:**
- Create: `src/extract/canonical.ts`
- Create: `src/cli/extract.ts`
- Modify: `package.json`
- Test: `tests/extract/canonical.test.ts`

**Context:** `pnpm extract` is a dumb hand. It resolves WHAT to ask NotebookLM and prints it as JSON; the extractor agent reads that JSON and does the asking. Resolution = universal base list (always) + cached industry metrics (may be empty → agent must infer) + optional `--ask` free text. It also prints the notebook state so the agent fails fast if ingestion hasn't run.

- [ ] **Step 1: Write the failing test for the canonical list**

```ts
// tests/extract/canonical.test.ts
import { describe, it, expect } from "vitest";
import { UNIVERSAL_BASE } from "../../src/extract/canonical.js";

describe("UNIVERSAL_BASE", () => {
  it("contains the locked base metrics with keys + labels", () => {
    const keys = UNIVERSAL_BASE.map((m) => m.metric_key);
    expect(keys).toEqual([
      "revenue", "pat", "ebitda", "ebitda_margin", "eps", "total_debt",
      "pat_margin", "debt_equity", "market_cap", "ev_ebitda", "ev",
    ]);
    for (const m of UNIVERSAL_BASE) expect(m.label.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test canonical`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Implement `canonical.ts`**

```ts
// src/extract/canonical.ts
// Universal base metrics — always asked for every company. Stable, comparable dashboard columns.
// Locked in the Phase 2a spec (2026-06-03).
export const UNIVERSAL_BASE: { metric_key: string; label: string }[] = [
  { metric_key: "revenue", label: "Revenue" },
  { metric_key: "pat", label: "Profit After Tax" },
  { metric_key: "ebitda", label: "EBITDA" },
  { metric_key: "ebitda_margin", label: "EBITDA Margin" },
  { metric_key: "eps", label: "Earnings Per Share" },
  { metric_key: "total_debt", label: "Total Debt" },
  { metric_key: "pat_margin", label: "PAT Margin" },
  { metric_key: "debt_equity", label: "Debt / Equity" },
  { metric_key: "market_cap", label: "Market Capitalisation" },
  { metric_key: "ev_ebitda", label: "EV / EBITDA" },
  { metric_key: "ev", label: "Enterprise Value" },
];
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test canonical`
Expected: PASS.

- [ ] **Step 5: Implement `extract.ts` CLI helper**

```ts
// src/cli/extract.ts
import "dotenv/config";
import { openDb } from "../db/db.js";
import { getCompany } from "../db/companies.js";
import { listFilings } from "../db/filings.js";
import { getNotebook } from "../db/notebooks.js";
import { getIndustryMetrics } from "../db/industry-metrics.js";
import { UNIVERSAL_BASE } from "../extract/canonical.js";

// usage: pnpm extract "<Company Name>" [--ask "free text request"]
const raw = process.argv.slice(2);
const askIdx = raw.indexOf("--ask");
const ask = askIdx >= 0 ? raw[askIdx + 1] ?? "" : null;
const name = raw.filter((_, i) => i !== askIdx && i !== askIdx + 1)[0];
if (!name) {
  console.error('usage: pnpm extract "<Company Name>" [--ask "free text"]');
  process.exit(1);
}

const db = openDb();
const company = getCompany(db, name);
if (!company) {
  console.error(`Company "${name}" not found. Run pnpm scrape first.`);
  process.exit(1);
}

const notebook = getNotebook(db, company.id);
const industry = company.industry;
const industryMetrics = industry ? getIndustryMetrics(db, industry) : [];

console.log(JSON.stringify({
  company: { id: company.id, name: company.name, ticker: company.ticker, industry },
  notebook: notebook ?? null,
  filings: listFilings(db, company.id),
  metrics: {
    universal: UNIVERSAL_BASE,
    industry: industryMetrics.map((m) => ({ metric_key: m.metric_key, label: m.label })),
    // When industry metrics are empty, the extractor agent must ask NotebookLM to infer them,
    // then persist via: pnpm db set-industry-metrics <industry> notebooklm '<json>'.
    needsIndustryInference: industry !== null && industryMetrics.length === 0,
  },
  ask,
}, null, 2));
```

- [ ] **Step 6: Add scripts to `package.json`**

In the `"scripts"` block, add:

```json
    "ingest": "tsx src/cli/ingest.ts",
    "extract": "tsx src/cli/extract.ts",
```

(Place them after the existing `"scrape"` line.)

- [ ] **Step 7: Smoke-test the helper**

Run: `pnpm extract "Asian Paints"`
Expected: JSON with `company`, `notebook` (likely `null`), `filings` (from Phase 1), `metrics.universal` (11 entries), `metrics.needsIndustryInference`. If company missing, run `pnpm scrape ASIANPAINT "Asian Paints"` first.

- [ ] **Step 8: Commit**

```bash
git add src/extract/canonical.ts src/cli/extract.ts package.json tests/extract/canonical.test.ts
git commit -m "feat(extract): canonical base list + extract CLI helper"
```

---

## Task 10: ingest CLI helper

**Files:**
- Create: `src/cli/ingest.ts`

**Context:** `pnpm ingest` is the dumb hand for the ingestor agent: it prints which filings (with public `source_url`s) need to be in NotebookLM and the current notebook state, so the agent knows what to `add_source` and whether it must create/register a notebook first. It does NOT call the MCP.

- [ ] **Step 1: Implement**

```ts
// src/cli/ingest.ts
import "dotenv/config";
import { openDb } from "../db/db.js";
import { getCompany } from "../db/companies.js";
import { listFilings } from "../db/filings.js";
import { getNotebook } from "../db/notebooks.js";

// usage: pnpm ingest "<Company Name>"
const name = process.argv[2];
if (!name) {
  console.error('usage: pnpm ingest "<Company Name>"');
  process.exit(1);
}

const db = openDb();
const company = getCompany(db, name);
if (!company) {
  console.error(`Company "${name}" not found. Run pnpm scrape first.`);
  process.exit(1);
}

const filings = listFilings(db, company.id);
const withUrls = filings.filter((f) => f.source_url);
console.log(JSON.stringify({
  company: { id: company.id, name: company.name, ticker: company.ticker, industry: company.industry },
  notebook: getNotebook(db, company.id) ?? null,
  // The agent feeds each source_url to NotebookLM add_source (type=url).
  sources: withUrls.map((f) => ({ filing_id: f.id, type: f.type, period: f.period, source_url: f.source_url })),
  missingUrlCount: filings.length - withUrls.length,
}, null, 2));
```

- [ ] **Step 2: Smoke-test**

Run: `pnpm ingest "Asian Paints"`
Expected: JSON with `company`, `notebook` (`null` until registered), `sources` (each filing's BSE `source_url`), `missingUrlCount`.

- [ ] **Step 3: Commit**

```bash
git add src/cli/ingest.ts
git commit -m "feat(ingest): ingest CLI helper (prints filings + notebook state)"
```

---

## Task 11: Agent definitions

**Files:**
- Create: `.claude/agents/ingestor.md`
- Modify: `.claude/agents/extractor.md`
- Modify: `.claude/agents/verifier.md`

**Context:** These are prompts, not code — no tests. They must reference only the CLI commands built above. The NotebookLM MCP tool names are `add_notebook`, `list_notebooks`, `select_notebook`, `add_source`, `ask_question` (per the spec).

- [ ] **Step 1: Create `.claude/agents/ingestor.md`**

```markdown
---
name: ingestor
description: Loads one company's filing PDFs into a per-company NotebookLM notebook by feeding the public BSE source URLs to the NotebookLM MCP. Idempotent; reports failures honestly.
model: sonnet
tools: Bash, Read, mcp__notebooklm__list_notebooks, mcp__notebooklm__add_notebook, mcp__notebooklm__select_notebook, mcp__notebooklm__add_source
---

You load ONE company's filings into NotebookLM so the extractor can query them. You never fabricate success.

Workflow:
1. Run `pnpm ingest "<Company Name>"`. Capture `company.id`, `notebook`, and the `sources` array
   (each has `filing_id`, `type`, `period`, `source_url`).
2. Resolve the notebook:
   - If `notebook` is non-null, use its `notebook_url` — call `select_notebook` for it.
   - Else try to create/register a notebook for this company (use `list_notebooks` to check for an
     existing one by the company name; if none and you can create one, do so via `add_notebook`).
     Persist it: `pnpm db set-notebook <companyId> "<notebook_url>" "<notebook_id>"`.
   - If you cannot create or register a notebook, STOP: tell the user to create an empty notebook
     named "<Company Name>" in the NotebookLM UI and paste its share-URL, then re-run. Exit clearly.
3. For each source, call `add_source` with `type=url` and the `source_url`. NotebookLM dedupes by URL,
   but treat already-present sources as success (idempotent).
4. Report: how many sources added, how many already present, and any that FAILED to crawl — list the
   exact failed `source_url`s and tell the user to add them manually to the notebook. If any failed,
   exit non-zero (say so explicitly in your final message).

Rules:
- One company per run. Feed URLs only — there is no file upload.
- Never claim a source loaded if `add_source` errored. Honesty over a clean-looking summary.
```

- [ ] **Step 2: Rewrite `.claude/agents/extractor.md`**

```markdown
---
name: extractor
description: Asks NotebookLM for a company's canonical + industry + free-text metrics and stages each answer (with its citation excerpt) into SQLite as pending. Never promotes. Never invents numbers.
model: sonnet
tools: Bash, Read, mcp__notebooklm__select_notebook, mcp__notebooklm__ask_question
---

You extract financial metrics for ONE company by querying its NotebookLM notebook. NotebookLM proposes;
the Verifier disposes. You only STAGE — you never write the live `metrics` table.

Workflow:
1. Run `pnpm extract "<Company Name>" [--ask "<free text>"]`. Capture:
   - `notebook` (if null, STOP — tell the user to run the ingestor first),
   - `metrics.universal` (always ask these), `metrics.industry`, `metrics.needsIndustryInference`,
   - `filings` (filing_id -> source_url / period, to attach each metric to a filing), and `ask`.
2. `select_notebook` for the notebook's URL.
3. If `metrics.needsIndustryInference` is true: ask NotebookLM which 4-8 metrics matter most for this
   company's industry (e.g. hotels -> occupancy/ARR; cement -> realisation/logistics cost; BFSI -> NPA/NIM).
   Persist them: `pnpm db set-industry-metrics "<industry>" notebooklm '[{"metric_key":"...","label":"..."}]'`.
   (Fallback: if NotebookLM is unreachable/unhelpful, infer the list yourself and store it with
   `sonnet` instead of `notebooklm`. This is the documented fallback — see docs/notebooklm-extractor.md.)
4. For the universal + industry metrics (and the `--ask` request, if any), call `ask_question` with
   `source_format=json`. Instruct NotebookLM to return a JSON ARRAY where each item has:
   `name`, `value`, `unit`, `period`, `excerpt` (the sentence/figure the number came from), and `url`.
5. For EACH returned item, stage it against the most relevant filing_id:
   `pnpm db stage '{"filing_id":N,"name":"revenue","value":9200,"unit":"INR cr","period":"Q4FY26","source_page":null,"excerpt":"<citation excerpt>","source_url":"<url or null>"}'`.
   Leave `source_page` null — the Verifier locates the page. ALWAYS include the `excerpt`; without it the
   Verifier cannot confirm a chart-only number.
6. Report how many metrics you staged. Do NOT promote anything.

Rules:
- Stage only numbers NotebookLM actually returned with a citation. If it says "not disclosed", skip it.
- `value` must be a number (strip commas/currency). Never guess to fill a column.
```

- [ ] **Step 3: Update `.claude/agents/verifier.md`**

```markdown
---
name: verifier
description: Independently re-checks every staged metric against its source PDF, promotes confirmed numbers as verified, marks chart-only numbers notebooklm-only, and rejects the rest. The integrity gate.
model: sonnet
tools: Bash, Read
---

You are the integrity gate. No number reaches the live `metrics` table unless you can locate it (or its
cited context) in the source PDF. Be skeptical — your default when unsure is REJECT.

Workflow:
1. Run `pnpm db list-staging pending` to get pending metrics (each has `id`, `filing_id`, `name`,
   `value`, `unit`, `period`, `source_page` (usually null), `excerpt`, `source_url`).
2. For each, find its filing's `local_path` (the coordinator passes you the filings array mapping
   filing_id -> local_path). Run `pnpm pdf-text <local_path>` to read ALL pages (NotebookLM rarely
   cites a page number, so you search the whole document).
3. Decide using the same rule as `src/verifier/match.ts`:
   - The `value` appears verbatim on a page (allow comma/decimal formatting) -> VERIFIED on that page:
     `pnpm db promote <id> verified`.
   - The value is NOT in the text but the `excerpt` wording IS on a page (number lives in a chart image)
     -> `pnpm db promote <id> notebooklm-only`.
   - Neither the number nor the excerpt can be found -> `pnpm db reject <id> "<short reason>"`.
4. At the end, run `pnpm db summary` and report `verified / notebooklmOnly / pending / rejected`.

Rules:
- Never edit values. You only promote (with a trust level) or reject what the Extractor staged.
- notebooklm-only is NOT a free pass — only use it when the citation excerpt genuinely appears on a page.
  If you cannot even find the excerpt, REJECT.
```

- [ ] **Step 4: Commit**

```bash
git add .claude/agents/ingestor.md .claude/agents/extractor.md .claude/agents/verifier.md
git commit -m "feat(agents): ingestor + NotebookLM extractor + trust-aware verifier"
```

---

## Task 12: Usage manual

**Files:**
- Create: `docs/notebooklm-extractor.md`

- [ ] **Step 1: Write the manual**

```markdown
# NotebookLM Extractor — Usage

Local, CLI-driven pipeline that turns a company's BSE filings into verified metrics in SQLite.
NotebookLM proposes the numbers; the pdfjs Verifier confirms them against the source PDF.

## One-time setup

1. Install the MCP server:
   `claude mcp add notebooklm -- npx notebooklm-mcp@latest`
2. First run only — authenticate Google in a visible Chrome window:
   run the NotebookLM MCP `setup_auth` tool once (e.g. `claude -p "use notebooklm setup_auth"`).
   Cookies persist; later runs are headless. Re-run `re_auth` if sessions expire.
3. Ensure `.env` has `SCREENER_EMAIL` / `SCREENER_PASSWORD` (Phase 1).

## The pipeline (run per company)

```bash
# 1. Scrape filings (downloads PDFs to data/<TICKER>/, records public BSE URLs)
pnpm scrape ASIANPAINT "Asian Paints"

# 2. Ingest — load the filing URLs into a per-company NotebookLM notebook
claude -p --agent ingestor 'ingest "Asian Paints"'

# 3. Extract — ask NotebookLM for canonical + industry + (optional) free-text metrics, stage them
claude -p --agent extractor 'extract "Asian Paints"'
claude -p --agent extractor 'extract "Asian Paints" --ask "capex guidance for FY27"'

# 4. Verify — confirm each staged number against the source PDF, promote/reject
claude -p --agent verifier 'verify "Asian Paints"'

# 5. Read results
pnpm db summary                 # { verified, notebooklmOnly, pending, rejected }
pnpm db list-metrics            # the live, trusted table
```

The CLI helpers (`pnpm ingest`, `pnpm extract`) just print what the agents need; the agents do the
NotebookLM work. You can run them directly to inspect state.

## Reading trust levels

- **verified** — the number was found verbatim on its source PDF page. Trust it.
- **notebooklm-only** — NotebookLM read it (usually from a chart image) and the cited wording is on the
  page, but the number itself isn't in the text. Stored, but shown differently on the dashboard. Sanity-check before relying on it.
- Rejected numbers never enter `metrics`; see `pnpm db list-staging rejected`.

## Notebook creation fallback

If the ingestor cannot auto-create a notebook, create an empty notebook named after the company in the
NotebookLM UI, copy its share-URL, then register it:
`pnpm db set-notebook <companyId> "<share-url>" "<notebook-id>"` and re-run the ingestor.

## Industry-metric inference fallback

The extractor normally asks NotebookLM which metrics matter for the company's industry and caches them
in `industry_metrics`. If NotebookLM is unreachable, the extractor infers the list itself and stores it
with `source='sonnet'` (vs `notebooklm`). The cache is hand-editable:
`pnpm db get-industry-metrics "<industry>"` / `pnpm db set-industry-metrics "<industry>" sonnet '<json>'`.
```

- [ ] **Step 2: Commit**

```bash
git add docs/notebooklm-extractor.md
git commit -m "docs: NotebookLM extractor usage manual"
```

---

## Task 13: Full green build + live E2E on Asian Paints

**Files:**
- Create: `docs/superpowers/runs/2026-06-03-phase2a-asianpaint.md`

**Context:** This is the real-integration proof. It needs the NotebookLM MCP installed and a one-time `setup_auth` Google login (the accepted exception to "no terminal for the user"). It costs tokens. Run it once and record exactly what happened — mirroring the Phase 1 run doc.

- [ ] **Step 1: Confirm the whole unit suite is green**

Run: `pnpm test`
Expected: PASS — migrate, metrics, notebooks, industry-metrics, parse-citations, verifier/match, canonical, plus all Phase-1 tests.

- [ ] **Step 2: Type-check the whole project**

Run: `pnpm exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Ensure the MCP is installed + authed**

Run: `claude mcp list`
Expected: `notebooklm` listed and connected. If absent: `claude mcp add notebooklm -- npx notebooklm-mcp@latest`, then run `setup_auth` once (visible Chrome Google login).

- [ ] **Step 4: Run the full pipeline live**

```bash
pnpm scrape ASIANPAINT "Asian Paints"
claude -p --agent ingestor 'ingest "Asian Paints"'
claude -p --agent extractor 'extract "Asian Paints"'
claude -p --agent verifier 'verify "Asian Paints"'
pnpm db summary
pnpm db list-metrics
```

- [ ] **Step 5: Confirm the three integrity outcomes are demonstrated**

Inspect the results and confirm, with evidence:
- at least one metric promoted as `verified` (number present verbatim in the PDF);
- at least one chart-sourced metric landed as `notebooklm-only` (excerpt on the page, number in an image);
- a fabricated/unfindable number was rejected. If the live run produced no chart-only or no rejection
  naturally, manually stage one of each to prove the gate (`pnpm db stage '{...,"value":99999,...}'` then
  run the verifier), and note that in the run doc.

- [ ] **Step 6: Write the run record**

Create `docs/superpowers/runs/2026-06-03-phase2a-asianpaint.md` documenting: commands run, notebook
creation path (auto vs manual), counts from `pnpm db summary`, one concrete `verified` example (metric +
page), one `notebooklm-only` example, one `reject` example, and any MCP auth/crawl/limit issues hit and
how they were resolved. Mirror `docs/superpowers/runs/2026-06-03-phase1-asianpaint.md`.

- [ ] **Step 7: Commit**

```bash
git add docs/superpowers/runs/2026-06-03-phase2a-asianpaint.md
git commit -m "docs: Phase 2a live E2E run record (Asian Paints)"
```

---

## Self-Review (completed)

**Spec coverage:**
- NotebookLM MCP constraints (no upload → URL ingest; share-URL notebooks; one-time auth; citations may lack page) → Tasks 10, 11, 12.
- Trust enum on metrics (verified | notebooklm-only) → Tasks 1, 2, 3; set by verifier → Tasks 7, 8, 11.
- `notebooks` idempotency → Task 4. `industry_metrics` cache → Task 5.
- `parse-citations` pure parser → Task 6. `verifier/match` pure classifier → Task 7.
- Guarded `metrics.trust` migration + `CREATE TABLE IF NOT EXISTS` → Task 1.
- Canonical set: universal base (11 metrics from spec line 117) + industry (NLM-inferred, cached, Sonnet fallback) + `--ask` → Tasks 9, 11.
- Error handling: URL crawl fail, notebook auto-create fallback, NLM-unreachable Sonnet fallback, verifier gate → Tasks 11, 12.
- Testing: unit (Tasks 1,3,4,5,6,7,9) + manual E2E (Task 13). Deliverable manual → Task 12.
- Staging `excerpt`/`source_url` (decided this session — required for the no-page-number citation flow) → Tasks 1, 2, 3, 11.

**Placeholder scan:** none — every code step shows complete code; agent prompts are full.

**Type consistency:** `MetricInput` (with excerpt/source_url) used identically in `stageMetric` (Task 3), the metrics test (Task 3), and the extractor's `pnpm db stage` payload (Task 11). `promoteMetric(db, id, trust)` consistent across Tasks 3, 8, 11. `IntegritySummary` `{verified, notebooklmOnly, pending, rejected}` consistent across Tasks 2, 3, 8, 11, 13. `Citation` shape consistent between Task 2, Task 6, and the extractor's requested JSON (Task 11). `matchMetric` decisions map 1:1 to verifier `promote/reject` calls (Tasks 7, 11).
```
