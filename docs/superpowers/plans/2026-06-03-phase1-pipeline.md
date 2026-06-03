# Phase 1: Pipeline-First Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove the core data pipeline end-to-end on ONE company: scrape screener.in → download filing PDFs → extract metrics → verify each number against the source page → store only verified numbers in SQLite. CLI-driven, no UI.

**Architecture:** Deterministic TypeScript CLI tools (scraper, PDF text extractor, SQLite data access) do the mechanical work and are unit-tested with Vitest. Three Claude Code agent definitions (Coordinator, Extractor, Verifier) orchestrate those tools via Bash. The agents are configuration + a documented end-to-end integration test, since LLM behavior isn't deterministically unit-testable.

**Tech Stack:** TypeScript, pnpm, Vitest, better-sqlite3, Playwright (scraping), pdfjs-dist (PDF text), cheerio (HTML parsing). Claude Code agents run on the Max subscription via `claude`.

---

## File structure

```
package.json
tsconfig.json
vitest.config.ts
.env.example                  # SCREENER_EMAIL, SCREENER_PASSWORD
.gitignore
data/                         # gitignored: stonks.db + downloaded PDFs
src/
  db/
    schema.sql                # table DDL
    db.ts                     # open db, apply schema, resolve data dir
    companies.ts              # upsertCompany, getCompany
    filings.ts                # insertFiling, listFilings
    metrics.ts                # stage/promote/reject/list/integritySummary
  pdf/
    extract-text.ts           # extractPageText(path) -> {page, text}[]
  scraper/
    parse-links.ts            # parseFilingLinks(html) -> FilingLink[]  (pure, tested)
    screener.ts               # login + fetch + download (Playwright, integration)
  cli/
    scrape-company.ts         # `pnpm scrape <name>`
    pdf-text.ts               # `pnpm pdf-text <path> [page]`
    db.ts                     # `pnpm db <subcommand>` (stage/promote/reject/list/summary)
  types.ts                    # shared types
.claude/agents/
    coordinator.md
    extractor.md
    verifier.md
tests/
    db/metrics.test.ts
    db/companies.test.ts
    pdf/extract-text.test.ts
    scraper/parse-links.test.ts
    fixtures/
      screener-company.html   # saved real page (captured in Task 9)
      sample.pdf              # tiny known PDF (created in Task 7)
```

---

## Task 1: Project scaffold

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`, `.gitignore`, `.env.example`

- [ ] **Step 1: Init and install**

```bash
pnpm init
pnpm add better-sqlite3 playwright pdfjs-dist cheerio dotenv
pnpm add -D typescript tsx vitest @types/node @types/better-sqlite3
pnpm exec playwright install chromium
```

- [ ] **Step 2: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "esModuleInterop": true,
    "strict": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "outDir": "dist",
    "types": ["node"]
  },
  "include": ["src", "tests"]
}
```

- [ ] **Step 3: Add `"type": "module"` and scripts to `package.json`**

Merge into `package.json`:

```json
{
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "scrape": "tsx src/cli/scrape-company.ts",
    "pdf-text": "tsx src/cli/pdf-text.ts",
    "db": "tsx src/cli/db.ts"
  }
}
```

- [ ] **Step 4: Write `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { include: ["tests/**/*.test.ts"] },
});
```

- [ ] **Step 5: Write `.gitignore`**

```
node_modules
dist
data
.env
```

- [ ] **Step 6: Write `.env.example`**

```
SCREENER_EMAIL=your-screener-login-email
SCREENER_PASSWORD=your-screener-password
```

- [ ] **Step 7: Verify the toolchain runs**

Run: `pnpm test`
Expected: Vitest runs and reports "No test files found" (exit 0). Confirms tsx/vitest work.

- [ ] **Step 8: Commit**

```bash
git init
git add -A
git commit -m "chore: scaffold phase 1 project"
```

---

## Task 2: Shared types

**Files:**
- Create: `src/types.ts`

- [ ] **Step 1: Write the types**

```ts
export type FilingType = "presentation" | "result" | "annual_report";

export interface FilingLink {
  type: FilingType;
  period: string | null;
  url: string;
}

export interface Company {
  id: number;
  name: string;
  ticker: string | null;
  industry: string | null;
}

export interface Filing {
  id: number;
  company_id: number;
  type: FilingType;
  period: string | null;
  source_url: string | null;
  local_path: string | null;
}

export interface MetricInput {
  filing_id: number;
  name: string;
  value: number;
  unit: string | null;
  period: string | null;
  source_page: number | null;
}

export interface Metric extends MetricInput {
  id: number;
}

export interface StagedMetric extends Metric {
  status: "pending" | "rejected";
  reject_reason: string | null;
}

export interface IntegritySummary {
  verified: number;
  pending: number;
  rejected: number;
}

export interface PageText {
  page: number;
  text: string;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/types.ts
git commit -m "feat: shared types"
```

---

## Task 3: Database schema + connection

**Files:**
- Create: `src/db/schema.sql`, `src/db/db.ts`

- [ ] **Step 1: Write `src/db/schema.sql`**

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
  source_page INTEGER
);

CREATE TABLE IF NOT EXISTS metrics_staging (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  filing_id INTEGER NOT NULL REFERENCES filings(id),
  name TEXT NOT NULL,
  value REAL NOT NULL,
  unit TEXT,
  period TEXT,
  source_page INTEGER,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','rejected')),
  reject_reason TEXT
);
```

- [ ] **Step 2: Write `src/db/db.ts`**

```ts
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
```

- [ ] **Step 3: Smoke-test the connection**

Run: `pnpm tsx -e "import('./src/db/db.ts').then(m => { const db = m.openDb(':memory:'); console.log(db.prepare('SELECT count(*) c FROM companies').get()); })"`
Expected: prints `{ c: 0 }`

- [ ] **Step 4: Commit**

```bash
git add src/db/schema.sql src/db/db.ts
git commit -m "feat: sqlite schema and connection"
```

---

## Task 4: Companies + filings data access

**Files:**
- Create: `src/db/companies.ts`, `src/db/filings.ts`
- Test: `tests/db/companies.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/db/companies.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { openDb } from "../../src/db/db.js";
import { upsertCompany, getCompany } from "../../src/db/companies.js";
import { insertFiling, listFilings } from "../../src/db/filings.js";

describe("companies + filings", () => {
  it("upserts a company idempotently by name", () => {
    const db = openDb(":memory:");
    const id1 = upsertCompany(db, { name: "Asian Paints", ticker: "ASIANPAINT", industry: "Paints" });
    const id2 = upsertCompany(db, { name: "Asian Paints", ticker: "ASIANPAINT", industry: "Paints" });
    expect(id1).toBe(id2);
    expect(getCompany(db, "Asian Paints")?.industry).toBe("Paints");
  });

  it("inserts and lists filings for a company", () => {
    const db = openDb(":memory:");
    const companyId = upsertCompany(db, { name: "Asian Paints", ticker: null, industry: null });
    insertFiling(db, {
      company_id: companyId, type: "presentation", period: "Q4FY26",
      source_url: "https://x/ppt.pdf", local_path: "data/x.pdf",
    });
    const filings = listFilings(db, companyId);
    expect(filings).toHaveLength(1);
    expect(filings[0].type).toBe("presentation");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/db/companies.test.ts`
Expected: FAIL — cannot find module `companies.js` / `filings.js`.

- [ ] **Step 3: Write `src/db/companies.ts`**

```ts
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
```

- [ ] **Step 4: Write `src/db/filings.ts`**

```ts
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
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm vitest run tests/db/companies.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add src/db/companies.ts src/db/filings.ts tests/db/companies.test.ts
git commit -m "feat: companies and filings data access"
```

---

## Task 5: Metrics staging/promotion data access

This is the integrity core: numbers land in `metrics_staging`, and only `promoteMetric` moves a row into the live `metrics` table.

**Files:**
- Create: `src/db/metrics.ts`
- Test: `tests/db/metrics.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/db/metrics.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { openDb } from "../../src/db/db.js";
import { upsertCompany } from "../../src/db/companies.js";
import { insertFiling } from "../../src/db/filings.js";
import { stageMetric, promoteMetric, rejectMetric, listMetrics, listStaging, integritySummary } from "../../src/db/metrics.js";

function setup() {
  const db = openDb(":memory:");
  const companyId = upsertCompany(db, { name: "Asian Paints", ticker: null, industry: null });
  const filingId = insertFiling(db, { company_id: companyId, type: "result", period: "Q4FY26", source_url: "u", local_path: "p" });
  return { db, filingId };
}

describe("metrics staging and promotion", () => {
  it("stages a metric as pending, not in live table", () => {
    const { db, filingId } = setup();
    stageMetric(db, { filing_id: filingId, name: "revenue", value: 1000, unit: "INR cr", period: "Q4FY26", source_page: 3 });
    expect(listStaging(db, "pending")).toHaveLength(1);
    expect(listMetrics(db)).toHaveLength(0);
    expect(integritySummary(db)).toEqual({ verified: 0, pending: 1, rejected: 0 });
  });

  it("promotes a staged metric into the live table and removes it from staging", () => {
    const { db, filingId } = setup();
    const sid = stageMetric(db, { filing_id: filingId, name: "revenue", value: 1000, unit: "INR cr", period: "Q4FY26", source_page: 3 });
    const mid = promoteMetric(db, sid);
    const live = listMetrics(db);
    expect(live).toHaveLength(1);
    expect(live[0].id).toBe(mid);
    expect(live[0].value).toBe(1000);
    expect(listStaging(db, "pending")).toHaveLength(0);
    expect(integritySummary(db)).toEqual({ verified: 1, pending: 0, rejected: 0 });
  });

  it("rejects a staged metric with a reason and keeps it out of the live table", () => {
    const { db, filingId } = setup();
    const sid = stageMetric(db, { filing_id: filingId, name: "revenue", value: 9999, unit: null, period: null, source_page: 3 });
    rejectMetric(db, sid, "value not found on source page");
    expect(listMetrics(db)).toHaveLength(0);
    const rejected = listStaging(db, "rejected");
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reject_reason).toBe("value not found on source page");
    expect(integritySummary(db)).toEqual({ verified: 0, pending: 0, rejected: 1 });
  });

  it("throws when promoting a non-pending id", () => {
    const { db } = setup();
    expect(() => promoteMetric(db, 999)).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/db/metrics.test.ts`
Expected: FAIL — cannot find module `metrics.js`.

- [ ] **Step 3: Write `src/db/metrics.ts`**

```ts
import type Database from "better-sqlite3";
import type { Metric, MetricInput, StagedMetric, IntegritySummary } from "../types.js";

export function stageMetric(db: Database.Database, m: MetricInput): number {
  const info = db.prepare(
    `INSERT INTO metrics_staging (filing_id, name, value, unit, period, source_page, status)
     VALUES (@filing_id, @name, @value, @unit, @period, @source_page, 'pending')`,
  ).run(m);
  return Number(info.lastInsertRowid);
}

export function promoteMetric(db: Database.Database, stagingId: number): number {
  const row = db.prepare("SELECT * FROM metrics_staging WHERE id = ? AND status = 'pending'").get(stagingId) as StagedMetric | undefined;
  if (!row) throw new Error(`No pending staged metric with id ${stagingId}`);
  const tx = db.transaction(() => {
    const info = db.prepare(
      `INSERT INTO metrics (filing_id, name, value, unit, period, source_page)
       VALUES (@filing_id, @name, @value, @unit, @period, @source_page)`,
    ).run(row);
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
  const verified = (db.prepare("SELECT count(*) c FROM metrics").get() as { c: number }).c;
  const pending = (db.prepare("SELECT count(*) c FROM metrics_staging WHERE status='pending'").get() as { c: number }).c;
  const rejected = (db.prepare("SELECT count(*) c FROM metrics_staging WHERE status='rejected'").get() as { c: number }).c;
  return { verified, pending, rejected };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/db/metrics.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/db/metrics.ts tests/db/metrics.test.ts
git commit -m "feat: metrics staging, promotion, rejection, integrity summary"
```

---

## Task 6: Filing-link parser (pure, tested)

Classifies anchor tags from a screener.in company page into typed filing links. Keyword-based classification on href + link text, which is robust to exact markup changes.

**Files:**
- Create: `src/scraper/parse-links.ts`
- Test: `tests/scraper/parse-links.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/scraper/parse-links.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseFilingLinks } from "../../src/scraper/parse-links.js";

const html = `
<div class="documents">
  <a href="https://www.bseindia.com/q4fy26-investor-ppt.pdf">Investor Presentation Q4FY26</a>
  <a href="https://www.bseindia.com/q4fy26-transcript.pdf">Concall Transcript Q4 FY26</a>
  <a href="https://www.bseindia.com/annual-report-fy25.pdf">Annual Report FY25</a>
  <a href="https://www.screener.in/login">Login</a>
  <a href="https://www.bseindia.com/credit-rating.pdf">Credit Rating</a>
</div>`;

describe("parseFilingLinks", () => {
  it("classifies presentations, transcripts, and annual reports; skips the rest", () => {
    const links = parseFilingLinks(html);
    expect(links).toEqual([
      { type: "presentation", period: "Q4FY26", url: "https://www.bseindia.com/q4fy26-investor-ppt.pdf" },
      { type: "result", period: "Q4FY26", url: "https://www.bseindia.com/q4fy26-transcript.pdf" },
      { type: "annual_report", period: "FY25", url: "https://www.bseindia.com/annual-report-fy25.pdf" },
    ]);
  });

  it("ignores non-pdf and unclassifiable links", () => {
    const links = parseFilingLinks(`<a href="/x">Some Page</a><a href="/y.pdf">Misc Doc</a>`);
    expect(links).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/scraper/parse-links.test.ts`
Expected: FAIL — cannot find module `parse-links.js`.

- [ ] **Step 3: Write `src/scraper/parse-links.ts`**

```ts
import * as cheerio from "cheerio";
import type { FilingLink, FilingType } from "../types.js";

function classify(text: string, href: string): FilingType | null {
  const s = `${text} ${href}`.toLowerCase();
  if (/annual\s*report/.test(s)) return "annual_report";
  if (/transcript|concall|earnings\s*call|result/.test(s)) return "result";
  if (/presentation|investor\s*ppt|\bppt\b/.test(s)) return "presentation";
  return null;
}

// Normalizes "Q4 FY26", "Q4FY26", "FY25" -> "Q4FY26" / "FY25"; null if none found.
function extractPeriod(text: string): string | null {
  const q = text.match(/Q([1-4])\s*FY\s*?(\d{2,4})/i);
  if (q) return `Q${q[1]}FY${q[2]}`;
  const fy = text.match(/FY\s*?(\d{2,4})/i);
  if (fy) return `FY${fy[1]}`;
  return null;
}

export function parseFilingLinks(html: string): FilingLink[] {
  const $ = cheerio.load(html);
  const links: FilingLink[] = [];
  $("a").each((_, el) => {
    const href = $(el).attr("href") ?? "";
    const text = $(el).text().trim();
    if (!href.toLowerCase().includes(".pdf")) return;
    const type = classify(text, href);
    if (!type) return;
    links.push({ type, period: extractPeriod(text), url: href });
  });
  return links;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/scraper/parse-links.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/scraper/parse-links.ts tests/scraper/parse-links.test.ts
git commit -m "feat: filing-link classifier"
```

---

## Task 7: PDF page-text extractor

Returns text per page. The Verifier needs page-level granularity to fill `source_page`.

**Files:**
- Create: `src/pdf/extract-text.ts`
- Test: `tests/pdf/extract-text.test.ts`, `tests/fixtures/sample.pdf`

- [ ] **Step 1: Create a tiny known PDF fixture**

Run (creates a 1-page PDF whose text is "Revenue 1000 cr"):

```bash
pnpm tsx -e "
import { writeFileSync } from 'node:fs';
const content = 'BT /F1 18 Tf 50 700 Td (Revenue 1000 cr) Tj ET';
const objs = [
  '<< /Type /Catalog /Pages 2 0 R >>',
  '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
  '<< /Length ' + content.length + ' >>\nstream\n' + content + '\nendstream',
  '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
];
let pdf = '%PDF-1.4\n'; const offsets = [];
objs.forEach((o, i) => { offsets.push(pdf.length); pdf += (i+1) + ' 0 obj\n' + o + '\nendobj\n'; });
const xref = pdf.length;
pdf += 'xref\n0 ' + (objs.length+1) + '\n0000000000 65535 f \n';
offsets.forEach(o => pdf += String(o).padStart(10,'0') + ' 00000 n \n');
pdf += 'trailer\n<< /Size ' + (objs.length+1) + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF';
writeFileSync('tests/fixtures/sample.pdf', pdf, 'latin1');
console.log('wrote tests/fixtures/sample.pdf');
"
```

Expected: prints `wrote tests/fixtures/sample.pdf`.

- [ ] **Step 2: Write the failing test**

`tests/pdf/extract-text.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { extractPageText } from "../../src/pdf/extract-text.js";

describe("extractPageText", () => {
  it("returns one entry per page with its text", async () => {
    const pages = await extractPageText("tests/fixtures/sample.pdf");
    expect(pages).toHaveLength(1);
    expect(pages[0].page).toBe(1);
    expect(pages[0].text).toContain("Revenue 1000 cr");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm vitest run tests/pdf/extract-text.test.ts`
Expected: FAIL — cannot find module `extract-text.js`.

- [ ] **Step 4: Write `src/pdf/extract-text.ts`**

```ts
import { readFile } from "node:fs/promises";
import type { PageText } from "../types.js";
// pdfjs legacy build works in Node without a DOM.
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

export async function extractPageText(path: string): Promise<PageText[]> {
  const data = new Uint8Array(await readFile(path));
  const doc = await getDocument({ data, useSystemFonts: true }).promise;
  const out: PageText[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const text = content.items.map((it: any) => ("str" in it ? it.str : "")).join(" ");
    out.push({ page: p, text });
  }
  return out;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm vitest run tests/pdf/extract-text.test.ts`
Expected: PASS. If pdfjs logs a font warning, that's fine as long as the assertion passes.

- [ ] **Step 6: Commit**

```bash
git add src/pdf/extract-text.ts tests/pdf/extract-text.test.ts tests/fixtures/sample.pdf
git commit -m "feat: pdf page-text extraction"
```

---

## Task 8: CLI tools (pdf-text + db)

Thin CLI wrappers so agents can call the tested modules via Bash. These are mechanical glue — verified by running them, not unit tests.

**Files:**
- Create: `src/cli/pdf-text.ts`, `src/cli/db.ts`

- [ ] **Step 1: Write `src/cli/pdf-text.ts`**

```ts
import { extractPageText } from "../pdf/extract-text.js";

const [, , path, pageArg] = process.argv;
if (!path) {
  console.error("usage: pnpm pdf-text <path> [page]");
  process.exit(1);
}
const pages = await extractPageText(path);
const filtered = pageArg ? pages.filter((p) => p.page === Number(pageArg)) : pages;
console.log(JSON.stringify(filtered, null, 2));
```

- [ ] **Step 2: Write `src/cli/db.ts`**

```ts
import { openDb } from "../db/db.js";
import { stageMetric, promoteMetric, rejectMetric, listMetrics, listStaging, integritySummary } from "../db/metrics.js";

const [, , cmd, ...rest] = process.argv;
const db = openDb();

function out(v: unknown) { console.log(JSON.stringify(v, null, 2)); }

switch (cmd) {
  case "stage": {
    // pnpm db stage '<json MetricInput>'
    out({ staging_id: stageMetric(db, JSON.parse(rest[0])) });
    break;
  }
  case "promote": { out({ metric_id: promoteMetric(db, Number(rest[0])) }); break; }
  case "reject": { rejectMetric(db, Number(rest[0]), rest.slice(1).join(" ")); out({ ok: true }); break; }
  case "list-metrics": { out(listMetrics(db, rest[0] ? Number(rest[0]) : undefined)); break; }
  case "list-staging": { out(listStaging(db, rest[0] as "pending" | "rejected" | undefined)); break; }
  case "summary": { out(integritySummary(db)); break; }
  default:
    console.error("commands: stage <json> | promote <id> | reject <id> <reason> | list-metrics [filingId] | list-staging [status] | summary");
    process.exit(1);
}
```

- [ ] **Step 3: Verify the CLIs run end-to-end**

Run:

```bash
pnpm pdf-text tests/fixtures/sample.pdf 1
pnpm db summary
```

Expected: first prints a JSON array with the page text; second prints `{ "verified": 0, "pending": 0, "rejected": 0 }`.

- [ ] **Step 4: Commit**

```bash
git add src/cli/pdf-text.ts src/cli/db.ts
git commit -m "feat: pdf-text and db CLI tools"
```

---

## Task 9: Screener scraper (integration) + scrape CLI

Playwright login + page fetch + PDF download. This hits the live site, so it's an integration step verified manually with your credentials (not a unit test). The pure parsing is already covered in Task 6.

**Files:**
- Create: `src/scraper/screener.ts`, `src/cli/scrape-company.ts`
- Create (captured): `tests/fixtures/screener-company.html`

- [ ] **Step 1: Capture a real company-page fixture (de-risks the parser against live markup)**

Create `.env` from `.env.example` with your real screener.in credentials first. Then run:

```bash
pnpm tsx -e "
import { chromium } from 'playwright';
import 'dotenv/config';
import { writeFileSync } from 'node:fs';
const b = await chromium.launch();
const pg = await b.newPage();
await pg.goto('https://www.screener.in/login/');
await pg.fill('#id_username', process.env.SCREENER_EMAIL);
await pg.fill('#id_password', process.env.SCREENER_PASSWORD);
await pg.click('button[type=submit]');
await pg.waitForLoadState('networkidle');
await pg.goto('https://www.screener.in/company/ASIANPAINT/consolidated/');
await pg.waitForLoadState('networkidle');
writeFileSync('tests/fixtures/screener-company.html', await pg.content());
await b.close();
console.log('captured');
"
```

Expected: prints `captured`. Open `tests/fixtures/screener-company.html` and confirm it shows the company page (not a login wall). **If `parseFilingLinks` returns nothing against this fixture, adjust the keyword regexes in `src/scraper/parse-links.ts` and re-run Task 6's test before continuing.**

- [ ] **Step 2: Write `src/scraper/screener.ts`**

```ts
import { chromium, type Browser, type Page } from "playwright";
import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { parseFilingLinks } from "./parse-links.js";
import { dataDir } from "../db/db.js";
import type { FilingLink } from "../types.js";

async function login(page: Page): Promise<void> {
  await page.goto("https://www.screener.in/login/");
  await page.fill("#id_username", process.env.SCREENER_EMAIL ?? "");
  await page.fill("#id_password", process.env.SCREENER_PASSWORD ?? "");
  await page.click("button[type=submit]");
  await page.waitForLoadState("networkidle");
}

// Tries a few slug forms; returns the page HTML and the resolved ticker slug.
async function fetchCompanyHtml(page: Page, ticker: string): Promise<string> {
  for (const path of [`/company/${ticker}/consolidated/`, `/company/${ticker}/`]) {
    const res = await page.goto(`https://www.screener.in${path}`);
    if (res && res.ok()) {
      await page.waitForLoadState("networkidle");
      return page.content();
    }
  }
  throw new Error(`Could not load company page for ${ticker}`);
}

async function downloadPdf(url: string, destPath: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`Download failed (${res.status}) for ${url}`);
  await pipeline(Readable.fromWeb(res.body as any), createWriteStream(destPath));
}

export interface ScrapeResult {
  links: (FilingLink & { local_path: string })[];
}

// Scrapes one company by ticker slug, downloads each filing PDF into data/<ticker>/.
export async function scrapeCompany(ticker: string): Promise<ScrapeResult> {
  let browser: Browser | undefined;
  try {
    browser = await chromium.launch();
    const page = await browser.newPage();
    await login(page);
    const html = await fetchCompanyHtml(page, ticker);
    const links = parseFilingLinks(html);
    const dir = join(dataDir(), ticker);
    await mkdir(dir, { recursive: true });
    const out: ScrapeResult["links"] = [];
    for (const [i, link] of links.entries()) {
      const local_path = join(dir, `${link.type}-${link.period ?? i}.pdf`);
      try {
        await downloadPdf(link.url, local_path);
        out.push({ ...link, local_path });
      } catch (e) {
        console.error(`WARN: couldn't fetch ${link.url}: ${(e as Error).message}`);
      }
    }
    return { links: out };
  } finally {
    await browser?.close();
  }
}
```

- [ ] **Step 3: Write `src/cli/scrape-company.ts`**

This both downloads PDFs and records `companies` + `filings` rows, printing the filing IDs the Extractor will use.

```ts
import "dotenv/config";
import { scrapeCompany } from "../scraper/screener.js";
import { openDb } from "../db/db.js";
import { upsertCompany } from "../db/companies.js";
import { insertFiling } from "../db/filings.js";

const [, , ticker, name] = process.argv;
if (!ticker) {
  console.error('usage: pnpm scrape <TICKER> [display name]');
  process.exit(1);
}

const db = openDb();
const companyId = upsertCompany(db, { name: name ?? ticker, ticker, industry: null });
const { links } = await scrapeCompany(ticker);
const filings = links.map((l) => ({
  filing_id: insertFiling(db, {
    company_id: companyId, type: l.type, period: l.period,
    source_url: l.url, local_path: l.local_path,
  }),
  ...l,
}));
console.log(JSON.stringify({ companyId, filings }, null, 2));
```

- [ ] **Step 4: Verify end-to-end against the live site**

Run: `pnpm scrape ASIANPAINT "Asian Paints"`
Expected: JSON with `companyId` and a `filings` array, each having a `filing_id`, `type`, `local_path`. Confirm PDFs exist under `data/ASIANPAINT/`. If a download warns, that filing is skipped (acceptable) but at least one should succeed.

- [ ] **Step 5: Commit**

```bash
git add src/scraper/screener.ts src/cli/scrape-company.ts tests/fixtures/screener-company.html
git commit -m "feat: screener.in scraper and scrape CLI"
```

---

## Task 10: Agent definitions

The three agents that orchestrate the tested CLI tools. No code — system prompts + tool constraints. Each sets its model in frontmatter.

**Files:**
- Create: `.claude/agents/extractor.md`, `.claude/agents/verifier.md`, `.claude/agents/coordinator.md`

- [ ] **Step 1: Write `.claude/agents/extractor.md`**

```markdown
---
name: extractor
description: Scrapes screener.in for a company, downloads filing PDFs, and stages extracted metrics into SQLite (pending verification). Runs on the cheap model.
model: haiku
tools: Bash, Read
---

You extract financial metrics for ONE company from screener.in. You never invent numbers.

Workflow:
1. Run `pnpm scrape <TICKER> "<Display Name>"`. This downloads filing PDFs and records filings.
   Capture the returned `filings` array (each has `filing_id`, `type`, `period`, `local_path`).
2. For each filing, run `pnpm pdf-text <local_path>` to get per-page text (JSON: `[{page, text}]`).
3. From the page text, identify financial metrics (revenue, EBITDA, PAT, margins, EPS, etc.).
   For EVERY metric you find, record the EXACT page number it came from.
4. Stage each metric: `pnpm db stage '{"filing_id":N,"name":"revenue","value":1234.5,"unit":"INR cr","period":"Q4FY26","source_page":3}'`.
5. Do NOT promote anything. Staging only. Report how many metrics you staged per filing.

Rules:
- Only stage a number you can see verbatim in the page text. If unsure, skip it.
- `value` must be a number (strip commas/currency symbols). Put the unit in `unit`.
- Never write to the live `metrics` table. That is the Verifier's job.
```

- [ ] **Step 2: Write `.claude/agents/verifier.md`**

```markdown
---
name: verifier
description: Independently re-checks every staged metric against its source PDF page, then promotes verified rows and rejects the rest. The integrity gate before data reaches the dashboard.
model: sonnet
tools: Bash, Read
---

You are the integrity gate. No number reaches the live `metrics` table unless you confirm it
against its source page. Be skeptical — your default when unsure is REJECT.

Workflow:
1. Run `pnpm db list-staging pending` to get pending metrics (each has `id`, `filing_id`,
   `name`, `value`, `unit`, `period`, `source_page`).
2. For each, find its filing's `local_path` (run `pnpm db list-metrics`? no — the filing path
   comes from the scrape output you were given by the coordinator). Run
   `pnpm pdf-text <local_path> <source_page>` to read ONLY that page.
3. Confirm the exact `value` (allowing for comma/unit formatting) appears on that page for that
   metric. If yes: `pnpm db promote <staging_id>`. If no / ambiguous / wrong page:
   `pnpm db reject <staging_id> "<short reason>"`.
4. At the end, run `pnpm db summary` and report `verified / pending / rejected` counts.

Rules:
- Verify against the cited `source_page` only. If the number is real but on a different page,
  reject with reason "wrong source_page".
- Never edit values. You only promote or reject what the Extractor staged.
```

- [ ] **Step 3: Write `.claude/agents/coordinator.md`**

```markdown
---
name: coordinator
description: Entry point for an analysis request. Parses targets (companies/industries) + plain-text ask, then dispatches the Extractor and Verifier and reports an integrity summary. (Phase 1: no dashboard yet.)
model: sonnet
tools: Task, Bash
---

You coordinate a Phase-1 data pipeline for ONE company at a time.

Given a request like "analyse Asian Paints (ASIANPAINT)":
1. Determine the screener.in ticker slug (e.g. ASIANPAINT) and display name.
2. Dispatch the `extractor` subagent with the ticker + name. It scrapes, downloads PDFs, and
   stages metrics. Capture the `filings` array (filing_id → local_path) it reports.
3. Dispatch the `verifier` subagent, passing along the filings (filing_id → local_path) so it
   can read source pages. It promotes/rejects staged metrics.
4. Run `pnpm db summary` and present the final integrity summary plus a short list of the
   verified metrics (`pnpm db list-metrics`).

Rules:
- One company per run in Phase 1. No charting/dashboard yet — that is Phase 2.
- Surface any "couldn't fetch" warnings honestly. Never paper over gaps.
```

- [ ] **Step 4: Commit**

```bash
git add .claude/agents/extractor.md .claude/agents/verifier.md .claude/agents/coordinator.md
git commit -m "feat: coordinator, extractor, verifier agent definitions"
```

---

## Task 11: End-to-end integration test (manual, one company)

The acceptance test for Phase 1. Proves scrape → extract → verify → store works on a real company with the real agents on your subscription.

**Files:** none (manual verification).

- [ ] **Step 1: Reset the data dir for a clean run**

```bash
rm -f data/stonks.db
```

- [ ] **Step 2: Run the full pipeline via the coordinator**

Run:

```bash
claude -p "Analyse Asian Paints (ticker ASIANPAINT). Run the Phase 1 pipeline." --agents coordinator
```

(If `--agents` selection differs in your Claude Code version, instead start `claude`, then prompt: "Use the coordinator agent to analyse Asian Paints (ASIANPAINT).")

Expected: the coordinator dispatches extractor → verifier and prints an integrity summary.

- [ ] **Step 3: Confirm the database state independently**

Run:

```bash
pnpm db summary
pnpm db list-metrics
pnpm db list-staging rejected
```

Expected:
- `summary` shows `verified > 0`.
- `list-metrics` rows each have a real `source_page` and sensible `value`/`unit`.
- Any `rejected` rows have a `reject_reason` — spot-check one against the PDF to confirm the verifier was right to reject it.

- [ ] **Step 4: Spot-check integrity by hand (the whole point of Phase 1)**

Pick one verified metric. Open its filing PDF at `source_page` and confirm the value matches. If it does, the integrity gate works. Record the result in the commit message.

- [ ] **Step 5: Commit a short run log**

```bash
mkdir -p docs/superpowers/runs
# write a few lines: company, verified/rejected counts, the spot-check result
git add docs/superpowers/runs
git commit -m "test: phase 1 e2e integration run on Asian Paints"
```

---

## Self-review notes

- **Spec coverage:** scraper (Task 6, 9), PDF parse with page granularity (Task 7), SQLite schema incl. staging/quarantine (Task 3, 5), extractor/verifier/coordinator agents with correct models (Task 10), quarantine-by-default + per-run integrity summary (Task 5, 11), "couldn't fetch X" honesty (Task 9 warning, agent rules). NotebookLM, dashboards, Teacher, and the Next.js app are intentionally Phases 2–3.
- **Subscription-only:** pipeline runs via `claude -p` (Task 11); no Agent SDK introduced. ✓
- **Cheap models:** extractor=haiku, verifier/coordinator=sonnet. ✓
- **Type consistency:** `MetricInput`/`Metric`/`StagedMetric` from `types.ts` used uniformly; CLI `stage` takes a JSON `MetricInput`; agents emit exactly those fields.

## Future phases (separate plans)

- **Phase 2:** Next.js app on localhost, API route spawning the `claude -p` coordinator with `--output-format stream-json`, dashboarder agent emitting a chart spec, Observable Plot rendering from SQLite.
- **Phase 3:** NotebookLM MCP wiring (push docs during extraction; narrative Q&A) + on-demand Teacher agent.
