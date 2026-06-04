# NotebookLM CLI Pivot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the NotebookLM MCP with the standalone `notebooklm` Python CLI as the data source for ingest + extract, keeping the deterministic pdfjs verifier as the integrity gate (now source-scoped).

**Architecture:** A single typed TypeScript wrapper (`src/notebooklm/cli.ts`) shells out to the `notebooklm` binary via `execFile`. Deterministic ingest (`runIngest`) creates/reuses a notebook and uploads local PDFs, persisting each returned `source_id` onto the filing row. The extractor agent queries `notebooklm ask --json` per metric; a pure `selectCitation` picks the reference whose `cited_text` contains the value (reusing the verifier's number tokenizer). The verifier scopes its PDF search to the cited source's filing when known, else all company PDFs.

**Tech Stack:** TypeScript (ESM, `.js` import specifiers), better-sqlite3, pdfjs-dist, Vitest, `tsx` for CLI scripts, the `notebooklm` CLI v0.3.4 (on PATH).

---

## Key conventions (read before starting)

- **ESM imports use `.js` specifiers** even for `.ts` files (e.g. `import { x } from "../db/db.js"`). Match this everywhere.
- **Tests** live under `tests/<mirror of src path>`, use Vitest (`describe/it/expect`), and open an isolated DB with `openDb(":memory:")`.
- **DB params** use better-sqlite3 named params (`@field`) bound from an object whose keys match the column names (snake_case).
- **Run a single test file:** `pnpm exec vitest run tests/path/to/file.test.ts`
- **Run everything:** `pnpm exec vitest run` and `pnpm exec tsc --noEmit`
- **Binary override:** `cli.ts` calls the binary named by `process.env.NOTEBOOKLM_BIN ?? "notebooklm"` so tests/CI can stub it; it is on PATH today.

### Two intentional deviations from `pivot.md` (locked with the user 2026-06-04)

1. **`MetricInput` field is snake_case `notebooklm_source_id`**, NOT camelCase `notebooklmSourceId`. Every other `MetricInput` field is snake_case (`filing_id`, `source_page`, `source_url`), the staging INSERT binds by column name, and the `pnpm db stage '<json>'` payload the extractor passes already uses `notebooklm_source_id` (per the design's architecture section). This keeps zero field-mapping and one consistent shape end-to-end.
2. **A `pnpm db select-citation` subcommand** is added so the extractor agent selects the citation *deterministically* (TS numeric-equality) instead of eyeballing references. Data integrity is non-negotiable; the agent must never pick a number by judgment.

---

## File structure

**New:**
- `src/notebooklm/cli.ts` — typed wrappers over the `notebooklm` binary (single chokepoint).
- `tests/notebooklm/cli.test.ts` — unit tests with an injected fake runner.
- `tests/notebooklm/select-citation.test.ts` — tests for `selectCitation`.
- `tests/db/filings.test.ts` — source-id helper round-trip.
- `tests/cli/ingest.test.ts` — `runIngest` with mocked CLI deps.
- `tests/cli/extract.test.ts` — `buildExtractPayload` surfaces `notebooklm_source_id`.
- `docs/superpowers/runs/2026-06-04-cli-pivot-asianpaint.md` — Task 10 E2E capture (manual gate).

**Modified:**
- `src/db/schema.sql`, `src/db/migrate.ts`, `tests/db/migrate.test.ts` — new column on `filings` + `metrics_staging`.
- `src/verifier/match.ts`, `tests/verifier/match.test.ts` — export `extractNumbers`; `pageHasValue` reuses it.
- `src/notebooklm/parse-citations.ts` — replace `parseCitations` with `selectCitation`.
- `src/db/filings.ts`, `src/types.ts` — `Filing.notebooklm_source_id` + helpers.
- `src/db/metrics.ts`, `src/types.ts` — stage persists `notebooklm_source_id`.
- `src/cli/ingest.ts` — rewrite to `runIngest(db, name, deps)` + thin wrapper.
- `src/verifier/verify.ts` — source-scoped page selection.
- `src/cli/extract.ts` — extract `buildExtractPayload`, surface the new field.
- `src/cli/db.ts` — add `select-citation` subcommand.
- `.claude/agents/ingestor.md`, `.claude/agents/extractor.md`, `.claude/settings.local.json` — drop MCP, use Bash/Read + CLI.

**Deleted:**
- `tests/notebooklm/parse-citations.test.ts` (the function it tests is replaced).
- `Citation` interface in `src/types.ts` (only `parse-citations.ts` used it).

---

## Task 1: Schema + migration for `notebooklm_source_id`

**Files:**
- Modify: `src/db/schema.sql`
- Modify: `src/db/migrate.ts`
- Test: `tests/db/migrate.test.ts`

- [ ] **Step 1: Add the failing migration test**

Add these two `it` blocks inside the existing `describe("migrate", ...)` in `tests/db/migrate.test.ts`:

```typescript
  it("adds notebooklm_source_id to filings and metrics_staging", () => {
    const db = legacyDb();
    migrate(db);
    expect(columns(db, "filings")).toContain("notebooklm_source_id");
    expect(columns(db, "metrics_staging")).toContain("notebooklm_source_id");
  });
```

The existing `legacyDb()` builds `metrics` and `metrics_staging` but not `filings`. Update `legacyDb()` to also create a column-light `filings` table so the migration has something to alter:

```typescript
function legacyDb(): Database.Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE filings (id INTEGER PRIMARY KEY, company_id INTEGER, type TEXT, period TEXT, source_url TEXT, local_path TEXT);
    CREATE TABLE metrics (id INTEGER PRIMARY KEY, filing_id INTEGER, name TEXT, value REAL, unit TEXT, period TEXT, source_page INTEGER);
    CREATE TABLE metrics_staging (id INTEGER PRIMARY KEY, filing_id INTEGER, name TEXT, value REAL, unit TEXT, period TEXT, source_page INTEGER, status TEXT, reject_reason TEXT);
  `);
  return db;
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run tests/db/migrate.test.ts`
Expected: FAIL — `filings` (and/or `metrics_staging`) does not contain `notebooklm_source_id`.

- [ ] **Step 3: Add the column to `schema.sql` (fresh DBs)**

In `src/db/schema.sql`, add the column to `filings` (after `local_path`):

```sql
CREATE TABLE IF NOT EXISTS filings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  type TEXT NOT NULL CHECK(type IN ('presentation','result','annual_report')),
  period TEXT,
  source_url TEXT,
  local_path TEXT,
  notebooklm_source_id TEXT,
  UNIQUE(company_id, type, period, source_url)
);
```

And to `metrics_staging` (after `source_url`):

```sql
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
  notebooklm_source_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','rejected')),
  reject_reason TEXT
);
```

- [ ] **Step 4: Add guarded ALTERs to `migrate.ts` (existing DBs)**

Append inside `migrate()` in `src/db/migrate.ts`, after the existing guards:

```typescript
  if (!hasColumn(db, "filings", "notebooklm_source_id")) {
    db.exec("ALTER TABLE filings ADD COLUMN notebooklm_source_id TEXT");
  }
  if (!hasColumn(db, "metrics_staging", "notebooklm_source_id")) {
    db.exec("ALTER TABLE metrics_staging ADD COLUMN notebooklm_source_id TEXT");
  }
```

- [ ] **Step 5: Run the test to verify it passes (and idempotency holds)**

Run: `pnpm exec vitest run tests/db/migrate.test.ts`
Expected: PASS — all `migrate` tests green, including the existing idempotency test.

- [ ] **Step 6: Commit**

```bash
git add src/db/schema.sql src/db/migrate.ts tests/db/migrate.test.ts
git commit -m "feat(db): add notebooklm_source_id to filings + metrics_staging (guarded migration)"
```

---

## Task 2: `src/notebooklm/cli.ts` — typed CLI wrapper

**Files:**
- Create: `src/notebooklm/cli.ts`
- Test: `tests/notebooklm/cli.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/notebooklm/cli.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { nbList, nbCreate, nbSourceAdd, nbSourceWait, nbAsk, type Runner } from "../../src/notebooklm/cli.js";

const ok = (stdout: string): Runner => async () => ({ stdout, stderr: "" });
const fail = (stderr: string): Runner => async () => {
  const e = new Error("Command failed") as Error & { stderr?: string };
  e.stderr = stderr;
  throw e;
};

describe("notebooklm cli wrapper", () => {
  it("nbList parses the notebooks array", async () => {
    const run = ok(JSON.stringify({ notebooks: [{ index: 1, id: "nb1", title: "Asian Paints", is_owner: true }] }));
    const res = await nbList(run);
    expect(res.notebooks[0]).toMatchObject({ id: "nb1", title: "Asian Paints", is_owner: true });
  });

  it("nbCreate unwraps the nested notebook id", async () => {
    const run = ok(JSON.stringify({ notebook: { id: "nb-xyz", title: "Asian Paints", created_at: null } }));
    expect(await nbCreate("Asian Paints", run)).toEqual({ id: "nb-xyz" });
  });

  it("nbSourceAdd unwraps the nested source", async () => {
    const run = ok(JSON.stringify({ source: { id: "src-1", title: "result-0.pdf", type: "SourceType.UNKNOWN", url: null } }));
    expect(await nbSourceAdd("nb1", "data/x/result-0.pdf", run)).toEqual({ id: "src-1", title: "result-0.pdf" });
  });

  it("nbSourceWait resolves on success and does not require JSON", async () => {
    const run = ok("✓ Source ready: src-1");
    await expect(nbSourceWait("nb1", "src-1", run)).resolves.toBeUndefined();
  });

  it("nbAsk returns answer + references", async () => {
    const run = ok(JSON.stringify({
      answer: "Revenue was ₹9,228 cr [1].",
      references: [{ source_id: "src-1", citation_number: 1, cited_text: "9,228" }],
    }));
    const res = await nbAsk("nb1", "What was revenue?", run);
    expect(res.answer).toContain("9,228");
    expect(res.references[0]).toMatchObject({ source_id: "src-1", cited_text: "9,228" });
  });

  it("throws with stderr text on non-zero exit", async () => {
    await expect(nbList(fail("not authenticated"))).rejects.toThrow(/not authenticated/);
  });

  it("throws on unparseable output", async () => {
    await expect(nbList(ok("not json at all"))).rejects.toThrow(/unparseable/i);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run tests/notebooklm/cli.test.ts`
Expected: FAIL — cannot find module `src/notebooklm/cli.js`.

- [ ] **Step 3: Implement `cli.ts`**

Create `src/notebooklm/cli.ts`:

```typescript
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const BIN = process.env.NOTEBOOKLM_BIN ?? "notebooklm";

/** Injectable command runner. Default shells out to the real `notebooklm` binary. */
export type Runner = (file: string, args: string[]) => Promise<{ stdout: string; stderr: string }>;

const defaultRun: Runner = (file, args) =>
  // Answers can be large; lift maxBuffer well above the 1 MB default.
  execFileAsync(file, args, { maxBuffer: 64 * 1024 * 1024 });

export interface NbReference {
  source_id: string;
  citation_number: number;
  cited_text: string;
}

async function runRaw(run: Runner, args: string[]): Promise<string> {
  try {
    const { stdout } = await run(BIN, args);
    return stdout;
  } catch (e) {
    const err = e as Error & { stderr?: string };
    const detail = err.stderr?.trim() || err.message;
    throw new Error(`notebooklm ${args.join(" ")} failed: ${detail}`);
  }
}

async function runJson<T>(run: Runner, args: string[]): Promise<T> {
  const stdout = await runRaw(run, args);
  try {
    return JSON.parse(stdout) as T;
  } catch {
    throw new Error(`notebooklm ${args.join(" ")} returned unparseable output: ${stdout.slice(0, 200)}`);
  }
}

/** Auth precheck: a thrown nbList means "not logged in / CLI broken". */
export async function nbList(
  run: Runner = defaultRun,
): Promise<{ notebooks: { id: string; title: string; is_owner: boolean }[] }> {
  return runJson(run, ["list", "--json"]);
}

export async function nbCreate(title: string, run: Runner = defaultRun): Promise<{ id: string }> {
  const res = await runJson<{ notebook: { id: string } }>(run, ["create", title, "--json"]);
  return { id: res.notebook.id };
}

export async function nbSourceAdd(
  notebookId: string,
  filePath: string,
  run: Runner = defaultRun,
): Promise<{ id: string; title: string }> {
  // --type file is REQUIRED for PDFs.
  const res = await runJson<{ source: { id: string; title: string } }>(
    run,
    ["source", "add", filePath, "--type", "file", "-n", notebookId, "--json"],
  );
  return { id: res.source.id, title: res.source.title };
}

export async function nbSourceWait(notebookId: string, sourceId: string, run: Runner = defaultRun): Promise<void> {
  // Blocks until the source is "ready"; prints a human line, not JSON.
  await runRaw(run, ["source", "wait", sourceId, "-n", notebookId]);
}

export async function nbAsk(
  notebookId: string,
  question: string,
  run: Runner = defaultRun,
): Promise<{ answer: string; references: NbReference[] }> {
  const res = await runJson<{ answer?: string; references?: NbReference[] }>(
    run,
    ["ask", question, "-n", notebookId, "--json"],
  );
  return { answer: res.answer ?? "", references: Array.isArray(res.references) ? res.references : [] };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run tests/notebooklm/cli.test.ts`
Expected: PASS — all 7 cases green.

- [ ] **Step 5: Commit**

```bash
git add src/notebooklm/cli.ts tests/notebooklm/cli.test.ts
git commit -m "feat(notebooklm): typed CLI wrapper over the notebooklm binary"
```

---

## Task 3: `extractNumbers` (shared tokenizer) + `selectCitation`

**Files:**
- Modify: `src/verifier/match.ts`
- Modify: `tests/verifier/match.test.ts`
- Modify: `src/notebooklm/parse-citations.ts`
- Modify: `src/types.ts` (delete unused `Citation`)
- Create: `tests/notebooklm/select-citation.test.ts`
- Delete: `tests/notebooklm/parse-citations.test.ts`

- [ ] **Step 1: Write the failing test for `extractNumbers`**

Append to `tests/verifier/match.test.ts` (add the import for `extractNumbers` to the existing import line from `match.js`):

```typescript
describe("extractNumbers", () => {
  it("tokenizes comma/decimal numbers and ignores label-glued digits", () => {
    expect(extractNumbers("Revenue 9,228 cr, margin 18.5%")).toEqual([9228, 18.5]);
    expect(extractNumbers("FY18 vs Q3 FY26")).toEqual([26]); // FY18, Q3 are letter-glued; "26" is free
    expect(extractNumbers("no numbers here")).toEqual([]);
    expect(extractNumbers("₹9,228 crore")).toEqual([9228]); // currency prefix is fine
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run tests/verifier/match.test.ts`
Expected: FAIL — `extractNumbers` is not exported.

- [ ] **Step 3: Add `extractNumbers` and make `pageHasValue` reuse it**

In `src/verifier/match.ts`, replace the `pageHasValue` function with an exported tokenizer plus a thin `pageHasValue`:

```typescript
// Every number-like token in `text`, parsed to a JS number. Boundaries: not preceded by a
// letter/digit/comma/dot (so "FY18" and digits inside a larger number don't match), not
// followed by a letter (so "18A"/"Q3" don't match). A trailing % or currency/space is fine.
// Shared by the verifier and the citation selector so the matching rule lives in ONE place.
export function extractNumbers(text: string): number[] {
  const re = /(?<![A-Za-z\d.,])-?\d[\d,]*(?:\.\d+)?(?![A-Za-z\d])/g;
  const out: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const n = Number(m[0].replace(/,/g, ""));
    if (Number.isFinite(n)) out.push(n);
  }
  return out;
}

// True if `value` appears on the page AS A NUMBER (exact numeric equality, comma/decimal aware).
function pageHasValue(text: string, value: number): boolean {
  return extractNumbers(text).includes(value);
}
```

- [ ] **Step 4: Run the test to verify it passes (and the gate is unregressed)**

Run: `pnpm exec vitest run tests/verifier/match.test.ts tests/verifier/verify.test.ts`
Expected: PASS — `extractNumbers` cases + all existing `matchMetric`/`verifyPending` cases green (proves the refactor preserved the integrity gate).

- [ ] **Step 5: Write the failing test for `selectCitation`**

Create `tests/notebooklm/select-citation.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { selectCitation } from "../../src/notebooklm/parse-citations.js";

function askJson(refs: { source_id: string; citation_number: number; cited_text: string }[]): string {
  return JSON.stringify({ answer: "prose [1]", references: refs });
}

describe("selectCitation", () => {
  it("returns the reference whose cited_text contains the value (comma-formatted)", () => {
    const raw = askJson([{ source_id: "src-A", citation_number: 1, cited_text: "Revenue grew to 9,228 cr" }]);
    expect(selectCitation(raw, 9228)).toEqual({ excerpt: "Revenue grew to 9,228 cr", sourceId: "src-A" });
  });

  it("matches a currency-prefixed value", () => {
    const raw = askJson([{ source_id: "src-A", citation_number: 1, cited_text: "₹9,228 crore" }]);
    expect(selectCitation(raw, 9228)).toEqual({ excerpt: "₹9,228 crore", sourceId: "src-A" });
  });

  it("does not return a reference for a different number", () => {
    const raw = askJson([{ source_id: "src-B", citation_number: 1, cited_text: "PAT was 8,330 cr" }]);
    expect(selectCitation(raw, 9228)).toEqual({ excerpt: null, sourceId: null });
  });

  it("picks the FIRST reference that contains the value", () => {
    const raw = askJson([
      { source_id: "src-B", citation_number: 1, cited_text: "PAT 8,330" },
      { source_id: "src-A", citation_number: 2, cited_text: "Revenue 9,228" },
    ]);
    expect(selectCitation(raw, 9228)).toEqual({ excerpt: "Revenue 9,228", sourceId: "src-A" });
  });

  it("returns nulls for empty/garbage JSON or no references", () => {
    expect(selectCitation("not json", 9228)).toEqual({ excerpt: null, sourceId: null });
    expect(selectCitation(JSON.stringify({ answer: "x" }), 9228)).toEqual({ excerpt: null, sourceId: null });
    expect(selectCitation(JSON.stringify({ references: [] }), 9228)).toEqual({ excerpt: null, sourceId: null });
  });
});
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `pnpm exec vitest run tests/notebooklm/select-citation.test.ts`
Expected: FAIL — `selectCitation` is not exported (file still exports `parseCitations`).

- [ ] **Step 7: Replace `parse-citations.ts` with `selectCitation`**

Overwrite `src/notebooklm/parse-citations.ts` entirely:

```typescript
import { extractNumbers } from "../verifier/match.js";

/** The citation backing a value: the cited excerpt and the NotebookLM source it came from. */
export interface CitationPick {
  excerpt: string | null;
  sourceId: string | null;
}

// Parse `notebooklm ask --json` output and return the FIRST reference whose cited_text contains
// `value` by numeric equality (reusing the verifier's tokenizer, so "9,228"/"₹9,228 crore"/"9228"
// all match 9228 and "FY18" does not match 18). No match / bad JSON -> honest nulls.
export function selectCitation(askJsonRaw: string, value: number): CitationPick {
  let parsed: unknown;
  try {
    parsed = JSON.parse(askJsonRaw);
  } catch {
    return { excerpt: null, sourceId: null };
  }
  const refs =
    parsed && typeof parsed === "object" && Array.isArray((parsed as { references?: unknown }).references)
      ? ((parsed as { references: unknown[] }).references)
      : [];
  for (const r of refs) {
    if (!r || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    const cited = typeof o.cited_text === "string" ? o.cited_text : "";
    if (extractNumbers(cited).includes(value)) {
      return { excerpt: cited, sourceId: typeof o.source_id === "string" ? o.source_id : null };
    }
  }
  return { excerpt: null, sourceId: null };
}
```

- [ ] **Step 8: Delete the obsolete test and the unused `Citation` type**

```bash
git rm tests/notebooklm/parse-citations.test.ts
```

In `src/types.ts`, delete the `Citation` interface (the block starting `/** One normalized metric proposed by NotebookLM... */` through its closing `}`). It was only imported by the old `parse-citations.ts`.

- [ ] **Step 9: Verify no dangling references to the deleted symbols**

Run: `grep -rn "parseCitations\|\bCitation\b" src/ tests/`
Expected: no matches (only `CitationPick` may appear, which is fine — confirm it's `CitationPick`, not bare `Citation`).

- [ ] **Step 10: Run the full suite + typecheck**

Run: `pnpm exec vitest run && pnpm exec tsc --noEmit`
Expected: PASS / clean.

- [ ] **Step 11: Commit**

```bash
git add src/verifier/match.ts tests/verifier/match.test.ts src/notebooklm/parse-citations.ts src/types.ts tests/notebooklm/select-citation.test.ts
git commit -m "feat(notebooklm): selectCitation via shared extractNumbers tokenizer; drop parseCitations"
```

---

## Task 4: `filings.ts` — source-id helpers + `Filing` type

**Files:**
- Modify: `src/types.ts`
- Modify: `src/db/filings.ts`
- Test: `tests/db/filings.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/db/filings.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { openDb } from "../../src/db/db.js";
import { upsertCompany } from "../../src/db/companies.js";
import { insertFiling, setFilingSourceId, getFilingBySourceId, listFilings } from "../../src/db/filings.js";

function setup() {
  const db = openDb(":memory:");
  const companyId = upsertCompany(db, { name: "Asian Paints", ticker: "ASIANPAINT", industry: "paints" });
  const filingId = insertFiling(db, { company_id: companyId, type: "result", period: "Q4FY26", source_url: "u", local_path: "/a.pdf" });
  return { db, companyId, filingId };
}

describe("filing source-id helpers", () => {
  it("sets and reads back a source id", () => {
    const { db, companyId, filingId } = setup();
    setFilingSourceId(db, filingId, "src-A");
    const f = getFilingBySourceId(db, companyId, "src-A");
    expect(f?.id).toBe(filingId);
    expect(f?.notebooklm_source_id).toBe("src-A");
  });

  it("listFilings includes notebooklm_source_id (null before set)", () => {
    const { db, companyId, filingId } = setup();
    expect(listFilings(db, companyId)[0].notebooklm_source_id).toBeNull();
    setFilingSourceId(db, filingId, "src-A");
    expect(listFilings(db, companyId)[0].notebooklm_source_id).toBe("src-A");
  });

  it("returns undefined for an unknown source id", () => {
    const { db, companyId } = setup();
    expect(getFilingBySourceId(db, companyId, "nope")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run tests/db/filings.test.ts`
Expected: FAIL — `setFilingSourceId` / `getFilingBySourceId` not exported.

- [ ] **Step 3: Add `notebooklm_source_id` to the `Filing` type**

In `src/types.ts`, update the `Filing` interface:

```typescript
export interface Filing {
  id: number;
  company_id: number;
  type: FilingType;
  period: string | null;
  source_url: string | null;
  local_path: string | null;
  notebooklm_source_id: string | null;
}
```

- [ ] **Step 4: Add the helpers to `filings.ts`**

Append to `src/db/filings.ts`:

```typescript
export function setFilingSourceId(db: Database.Database, filingId: number, sourceId: string): void {
  db.prepare("UPDATE filings SET notebooklm_source_id = ? WHERE id = ?").run(sourceId, filingId);
}

export function getFilingBySourceId(
  db: Database.Database,
  companyId: number,
  sourceId: string,
): Filing | undefined {
  return db
    .prepare("SELECT * FROM filings WHERE company_id = ? AND notebooklm_source_id = ?")
    .get(companyId, sourceId) as Filing | undefined;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm exec vitest run tests/db/filings.test.ts`
Expected: PASS — all 3 cases green.

- [ ] **Step 6: Commit**

```bash
git add src/types.ts src/db/filings.ts tests/db/filings.test.ts
git commit -m "feat(db): setFilingSourceId + getFilingBySourceId helpers"
```

---

## Task 5: `metrics.ts` — stage with `notebooklm_source_id`

**Files:**
- Modify: `src/types.ts`
- Modify: `src/db/metrics.ts`
- Test: `tests/db/metrics.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `tests/db/metrics.test.ts` inside the existing `describe`:

```typescript
  it("persists notebooklm_source_id on the staging row and defaults it to null", () => {
    const { db, filingId } = setup();
    stageMetric(db, input(filingId, { notebooklm_source_id: "src-A" }));
    stageMetric(db, input(filingId, { name: "pat" })); // omit the field entirely
    const staged = listStaging(db, "pending");
    expect(staged[0].notebooklm_source_id).toBe("src-A");
    expect(staged[1].notebooklm_source_id).toBeNull();
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run tests/db/metrics.test.ts`
Expected: FAIL — TS error on unknown property `notebooklm_source_id` in `MetricInput`, and/or the column is not persisted.

- [ ] **Step 3: Add the optional field to `MetricInput`**

In `src/types.ts`, update `MetricInput`:

```typescript
export interface MetricInput {
  filing_id: number;
  name: string;
  value: number;
  unit: string | null;
  period: string | null;
  source_page: number | null;
  excerpt: string | null;
  source_url: string | null;
  notebooklm_source_id?: string | null;
}
```

(`StagedMetric extends MetricInput`, so it inherits the field automatically.)

- [ ] **Step 4: Persist it in `stageMetric`**

In `src/db/metrics.ts`, replace `stageMetric`:

```typescript
export function stageMetric(db: Database.Database, m: MetricInput): number {
  // Default the optional field so better-sqlite3 never sees a missing named param.
  const row = { notebooklm_source_id: null, ...m };
  const info = db.prepare(
    `INSERT INTO metrics_staging (filing_id, name, value, unit, period, source_page, excerpt, source_url, notebooklm_source_id, status)
     VALUES (@filing_id, @name, @value, @unit, @period, @source_page, @excerpt, @source_url, @notebooklm_source_id, 'pending')`,
  ).run(row);
  return Number(info.lastInsertRowid);
}
```

- [ ] **Step 5: Run the test to verify it passes (existing metrics tests too)**

Run: `pnpm exec vitest run tests/db/metrics.test.ts`
Expected: PASS — the new case plus all existing staging/promotion cases (which omit the field) stay green.

- [ ] **Step 6: Commit**

```bash
git add src/types.ts src/db/metrics.ts tests/db/metrics.test.ts
git commit -m "feat(db): stageMetric persists notebooklm_source_id"
```

---

## Task 6: `src/cli/ingest.ts` — deterministic ingest driver

**Files:**
- Modify: `src/cli/ingest.ts`
- Test: `tests/cli/ingest.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/cli/ingest.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { openDb } from "../../src/db/db.js";
import { upsertCompany } from "../../src/db/companies.js";
import { insertFiling, listFilings } from "../../src/db/filings.js";
import { getNotebook } from "../../src/db/notebooks.js";
import { runIngest, type IngestDeps } from "../../src/cli/ingest.js";

function setup() {
  const db = openDb(":memory:");
  const companyId = upsertCompany(db, { name: "Asian Paints", ticker: "ASIANPAINT", industry: "paints" });
  insertFiling(db, { company_id: companyId, type: "result", period: "Q4FY26", source_url: "u1", local_path: "/a.pdf" });
  insertFiling(db, { company_id: companyId, type: "presentation", period: "Q4FY26", source_url: "u2", local_path: "/b.pdf" });
  return { db, companyId };
}

function makeDeps() {
  const calls = { create: 0, add: [] as string[], wait: [] as string[] };
  let n = 0;
  const deps: IngestDeps = {
    nbList: async () => ({ notebooks: [] }),
    nbCreate: async () => { calls.create++; return { id: "nb-123" }; },
    nbSourceAdd: async (_nb, filePath) => { calls.add.push(filePath); return { id: `src-${++n}`, title: filePath }; },
    nbSourceWait: async (_nb, sid) => { calls.wait.push(sid); },
  };
  return { deps, calls };
}

describe("runIngest", () => {
  it("creates a notebook once, uploads each unmapped filing, and persists source ids", async () => {
    const { db, companyId } = setup();
    const { deps, calls } = makeDeps();
    const summary = await runIngest(db, "Asian Paints", deps);

    expect(calls.create).toBe(1);
    expect(calls.add).toEqual(["/a.pdf", "/b.pdf"]);
    expect(summary.notebook_id).toBe("nb-123");
    expect(summary.added).toHaveLength(2);
    expect(summary.failed).toHaveLength(0);
    expect(getNotebook(db, companyId)?.notebook_id).toBe("nb-123");
    expect(listFilings(db, companyId).map((f) => f.notebooklm_source_id)).toEqual(["src-1", "src-2"]);
  });

  it("is idempotent — a second run reuses the notebook and re-adds nothing", async () => {
    const { db } = setup();
    const first = makeDeps();
    await runIngest(db, "Asian Paints", first.deps);

    const second = makeDeps();
    const summary = await runIngest(db, "Asian Paints", second.deps);
    expect(second.calls.create).toBe(0);
    expect(second.calls.add).toEqual([]);
    expect(summary.added).toHaveLength(0);
    expect(summary.skipped).toHaveLength(2);
  });

  it("throws a friendly auth error when nbList fails", async () => {
    const { db } = setup();
    const { deps } = makeDeps();
    deps.nbList = async () => { throw new Error("boom"); };
    await expect(runIngest(db, "Asian Paints", deps)).rejects.toThrow(/notebooklm login/);
  });

  it("throws when the company is unknown", async () => {
    const { db } = setup();
    const { deps } = makeDeps();
    await expect(runIngest(db, "Nonexistent Co", deps)).rejects.toThrow(/not found/i);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run tests/cli/ingest.test.ts`
Expected: FAIL — `runIngest` / `IngestDeps` not exported from `ingest.ts`.

- [ ] **Step 3: Rewrite `ingest.ts` with a testable core + thin wrapper**

Overwrite `src/cli/ingest.ts`:

```typescript
import "dotenv/config";
import type Database from "better-sqlite3";
import { openDb } from "../db/db.js";
import { getCompany } from "../db/companies.js";
import { listFilings, setFilingSourceId } from "../db/filings.js";
import { getNotebook, upsertNotebook } from "../db/notebooks.js";
import { nbList, nbCreate, nbSourceAdd, nbSourceWait } from "../notebooklm/cli.js";

export interface IngestDeps {
  nbList: typeof nbList;
  nbCreate: typeof nbCreate;
  nbSourceAdd: typeof nbSourceAdd;
  nbSourceWait: typeof nbSourceWait;
}

export interface IngestSummary {
  notebook_id: string;
  added: { filing_id: number; source_id: string }[];
  skipped: { filing_id: number; source_id: string }[];
  failed: { filing_id: number; error: string }[];
}

export async function runIngest(db: Database.Database, companyName: string, deps: IngestDeps): Promise<IngestSummary> {
  // 1. Auth precheck.
  try {
    await deps.nbList();
  } catch {
    throw new Error("NotebookLM not authenticated — run `notebooklm login` once.");
  }

  // 2. Company.
  const company = getCompany(db, companyName);
  if (!company) throw new Error(`Company "${companyName}" not found. Run pnpm scrape first.`);

  // 3. Notebook: reuse or create.
  const existing = getNotebook(db, company.id);
  let notebookId = existing?.notebook_id ?? null;
  if (!notebookId) {
    notebookId = (await deps.nbCreate(company.name)).id;
    upsertNotebook(db, company.id, `https://notebooklm.google.com/notebook/${notebookId}`, notebookId);
  }

  // 4. Per filing with a local PDF and no source id yet.
  const summary: IngestSummary = { notebook_id: notebookId, added: [], skipped: [], failed: [] };
  for (const f of listFilings(db, company.id)) {
    if (!f.local_path) continue;
    if (f.notebooklm_source_id) {
      summary.skipped.push({ filing_id: f.id, source_id: f.notebooklm_source_id });
      continue;
    }
    try {
      const src = await deps.nbSourceAdd(notebookId, f.local_path);
      setFilingSourceId(db, f.id, src.id);
      await deps.nbSourceWait(notebookId, src.id);
      summary.added.push({ filing_id: f.id, source_id: src.id });
    } catch (e) {
      summary.failed.push({ filing_id: f.id, error: (e as Error).message });
    }
  }
  return summary;
}

// CLI entrypoint: `pnpm ingest "<Company Name>"`. Skipped when imported by tests.
async function main(): Promise<void> {
  const name = process.argv[2];
  if (!name) {
    console.error('usage: pnpm ingest "<Company Name>"');
    process.exit(1);
  }
  const db = openDb();
  try {
    const summary = await runIngest(db, name, { nbList, nbCreate, nbSourceAdd, nbSourceWait });
    console.log(JSON.stringify(summary, null, 2));
    if (summary.failed.length > 0) process.exit(1);
  } catch (e) {
    console.error((e as Error).message);
    process.exit(1);
  }
}

// Run only when invoked directly (not when imported by a test).
if (process.argv[1] && process.argv[1].endsWith("ingest.ts")) {
  await main();
}
```

> Note: the `import.meta`-style direct-run guard above uses `process.argv[1]` so that importing `runIngest` in Vitest does not trigger `main()` / `process.exit`. `tsx` runs the file as `.../src/cli/ingest.ts`, so the suffix check holds.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run tests/cli/ingest.test.ts`
Expected: PASS — all 4 cases green, no `process.exit` triggered during import.

- [ ] **Step 5: Commit**

```bash
git add src/cli/ingest.ts tests/cli/ingest.test.ts
git commit -m "feat(ingest): deterministic CLI-driven ingest with idempotent source-id backfill"
```

---

## Task 7: `src/verifier/verify.ts` — source-scoped verification

**Files:**
- Modify: `src/verifier/verify.ts`
- Test: `tests/verifier/verify.test.ts`

- [ ] **Step 1: Write the failing source-scoping test**

Append to `tests/verifier/verify.test.ts`:

```typescript
import { setFilingSourceId, getFilingBySourceId } from "../../src/db/filings.js"; // add to existing imports if not present

describe("verifyPending source-scoping", () => {
  // PDF-A contains 9,228; PDF-B does not.
  const pagesByPath: Record<string, PageText[]> = {
    "/a.pdf": [{ page: 1, text: "Revenue grew to 9,228 crore this quarter." }],
    "/b.pdf": [{ page: 1, text: "Some other commentary with 5,000 mentioned." }],
  };
  const loader = async (path: string): Promise<PageText[]> => pagesByPath[path] ?? [];

  function twoFilings() {
    const db = openDb(":memory:");
    const companyId = upsertCompany(db, { name: "Co", ticker: null, industry: null });
    const a = insertFiling(db, { company_id: companyId, type: "result", period: "Q4", source_url: "ua", local_path: "/a.pdf" });
    const b = insertFiling(db, { company_id: companyId, type: "presentation", period: "Q4", source_url: "ub", local_path: "/b.pdf" });
    setFilingSourceId(db, a, "src-A");
    setFilingSourceId(db, b, "src-B");
    return { db, companyId, a, b };
  }

  it("verifies a value cited to the source whose PDF contains it", async () => {
    const { db, companyId, a } = twoFilings();
    stageMetric(db, { filing_id: a, name: "revenue", value: 9228, unit: "INR cr", period: "Q4", source_page: null, excerpt: null, source_url: "ua", notebooklm_source_id: "src-A" });
    await verifyPending(db, companyId, loader);
    const live = listMetrics(db);
    expect(live).toHaveLength(1);
    expect(live[0].trust).toBe("verified");
  });

  it("rejects the SAME value when cited to a source whose PDF lacks it (scoping tightens integrity)", async () => {
    const { db, companyId, b } = twoFilings();
    stageMetric(db, { filing_id: b, name: "revenue", value: 9228, unit: "INR cr", period: "Q4", source_page: null, excerpt: null, source_url: "ub", notebooklm_source_id: "src-B" });
    await verifyPending(db, companyId, loader);
    expect(listMetrics(db)).toHaveLength(0);
    expect(listStaging(db, "rejected")).toHaveLength(1);
  });

  it("falls back to all company PDFs when notebooklm_source_id is null", async () => {
    const { db, companyId, b } = twoFilings();
    // Staged against filing B (no source id) but the value lives in PDF-A; all-pages fallback finds it.
    stageMetric(db, { filing_id: b, name: "revenue", value: 9228, unit: "INR cr", period: "Q4", source_page: null, excerpt: null, source_url: "ub", notebooklm_source_id: null });
    await verifyPending(db, companyId, loader);
    expect(listMetrics(db)).toHaveLength(1);
    expect(listMetrics(db)[0].trust).toBe("verified");
  });
});
```

(`getFilingBySourceId` is imported only so the test file compiles cleanly alongside `setFilingSourceId`; if your linter flags it as unused, drop it from the import.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run tests/verifier/verify.test.ts`
Expected: FAIL — the "rejects when cited to B" case fails because the current verifier scopes by `filing_id` and would still only look at B's pages... actually confirm the **fallback** case fails: current code loads only `m.filing_id` (B) pages, so the null-source-id fallback case (expects all-pages) fails to find 9,228.

- [ ] **Step 3: Rewrite `verifyPending` to scope by source id with all-pages fallback**

Overwrite `src/verifier/verify.ts`:

```typescript
import type Database from "better-sqlite3";
import type { PageText, StagedMetric } from "../types.js";
import { listStaging, promoteMetric, rejectMetric } from "../db/metrics.js";
import { getFilingBySourceId } from "../db/filings.js";
import { matchMetric } from "./match.js";
import { extractPageText } from "../pdf/extract-text.js";

export interface VerifyOutcome {
  staging_id: number;
  name: string;
  decision: "verified" | "notebooklm-only" | "reject";
  source_page: number | null;
}

type PageLoader = (localPath: string) => Promise<PageText[]>;

// Deterministic integrity gate. Runs in TS, never in an LLM context — verification is token-free.
// companyId scopes which pending metrics to verify; loadPages is injectable for tests.
// Page selection: a staged metric carrying notebooklm_source_id is checked ONLY against that
// source's filing PDF; otherwise it is checked against ALL of the company's PDFs (back-compat).
export async function verifyPending(
  db: Database.Database,
  companyId: number,
  loadPages: PageLoader = extractPageText,
): Promise<VerifyOutcome[]> {
  const companyFilings = db
    .prepare("SELECT id, local_path FROM filings WHERE company_id = ?")
    .all(companyId) as { id: number; local_path: string | null }[];
  const filingIds = new Set(companyFilings.map((f) => f.id));
  const pending = listStaging(db, "pending").filter((m) => filingIds.has(m.filing_id));

  const pageCache = new Map<string, PageText[]>(); // keyed by local_path
  async function pagesFor(localPath: string | null): Promise<PageText[]> {
    if (!localPath) return [];
    let p = pageCache.get(localPath);
    if (!p) {
      p = await loadPages(localPath);
      pageCache.set(localPath, p);
    }
    return p;
  }

  const setSourcePage = db.prepare("UPDATE metrics_staging SET source_page = ? WHERE id = ?");
  const outcomes: VerifyOutcome[] = [];

  for (const m of pending as StagedMetric[]) {
    let pages: PageText[];
    if (m.notebooklm_source_id) {
      const filing = getFilingBySourceId(db, companyId, m.notebooklm_source_id);
      pages = await pagesFor(filing?.local_path ?? null);
    } else {
      pages = [];
      for (const f of companyFilings) pages.push(...(await pagesFor(f.local_path)));
    }

    const res = matchMetric({ value: m.value, excerpt: m.excerpt }, pages);
    if (res.decision === "reject") {
      const reason = pages.length === 0
        ? "source PDF not downloaded (local_path missing)"
        : "value and excerpt not found in source PDF";
      rejectMetric(db, m.id, reason);
    } else {
      setSourcePage.run(res.source_page, m.id);
      promoteMetric(db, m.id, res.decision);
    }
    outcomes.push({ staging_id: m.id, name: m.name, decision: res.decision, source_page: res.source_page });
  }
  return outcomes;
}
```

- [ ] **Step 4: Run the test to verify it passes (old verify tests too)**

Run: `pnpm exec vitest run tests/verifier/verify.test.ts`
Expected: PASS — the 3 new scoping cases AND the 4 original cases (which stage with `notebooklm_source_id` undefined → null → all-pages fallback over the single filing) all green.

- [ ] **Step 5: Commit**

```bash
git add src/verifier/verify.ts tests/verifier/verify.test.ts
git commit -m "feat(verify): source-scoped verification keyed on notebooklm_source_id with all-PDF fallback"
```

---

## Task 8: `src/cli/extract.ts` — testable payload that surfaces the source id

> (This is `pivot.md` Task 9, pulled earlier because the extractor agent in Task 9-here depends on it.)

**Files:**
- Modify: `src/cli/extract.ts`
- Test: `tests/cli/extract.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/cli/extract.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { openDb } from "../../src/db/db.js";
import { upsertCompany } from "../../src/db/companies.js";
import { insertFiling, setFilingSourceId } from "../../src/db/filings.js";
import { buildExtractPayload } from "../../src/cli/extract.js";

describe("buildExtractPayload", () => {
  it("surfaces notebooklm_source_id for each filing and echoes the ask", () => {
    const db = openDb(":memory:");
    const companyId = upsertCompany(db, { name: "Asian Paints", ticker: "ASIANPAINT", industry: "paints" });
    const fid = insertFiling(db, { company_id: companyId, type: "result", period: "Q4FY26", source_url: "u", local_path: "/a.pdf" });
    setFilingSourceId(db, fid, "src-A");

    const payload = buildExtractPayload(db, "Asian Paints", "focus on margins");
    expect(payload.filings[0].notebooklm_source_id).toBe("src-A");
    expect(payload.ask).toBe("focus on margins");
    expect(payload.metrics.universal.length).toBeGreaterThan(0);
  });

  it("throws when the company is unknown", () => {
    const db = openDb(":memory:");
    expect(() => buildExtractPayload(db, "Nope", null)).toThrow(/not found/i);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run tests/cli/extract.test.ts`
Expected: FAIL — `buildExtractPayload` not exported.

- [ ] **Step 3: Refactor `extract.ts` to export the builder**

Overwrite `src/cli/extract.ts`:

```typescript
import "dotenv/config";
import type Database from "better-sqlite3";
import { openDb } from "../db/db.js";
import { getCompany } from "../db/companies.js";
import { listFilings } from "../db/filings.js";
import { getNotebook } from "../db/notebooks.js";
import { getIndustryMetrics } from "../db/industry-metrics.js";
import { UNIVERSAL_BASE } from "../extract/canonical.js";

export function buildExtractPayload(db: Database.Database, name: string, ask: string | null) {
  const company = getCompany(db, name);
  if (!company) throw new Error(`Company "${name}" not found. Run pnpm scrape first.`);

  const industry = company.industry;
  const industryMetrics = industry ? getIndustryMetrics(db, industry) : [];

  return {
    company: { id: company.id, name: company.name, ticker: company.ticker, industry },
    notebook: getNotebook(db, company.id) ?? null,
    // listFilings returns full rows, so notebooklm_source_id rides along for citation->filing mapping.
    filings: listFilings(db, company.id),
    metrics: {
      universal: UNIVERSAL_BASE,
      industry: industryMetrics.map((m) => ({ metric_key: m.metric_key, label: m.label })),
      needsIndustryInference: industry !== null && industryMetrics.length === 0,
    },
    ask,
  };
}

// CLI: pnpm extract "<Company Name>" [--ask "free text request"]
function main(): void {
  const raw = process.argv.slice(2);
  const askIdx = raw.indexOf("--ask");
  const ask = askIdx >= 0 ? raw[askIdx + 1] ?? "" : null;
  const name = askIdx >= 0 ? raw.filter((_, i) => i !== askIdx && i !== askIdx + 1)[0] : raw[0];
  if (!name) {
    console.error('usage: pnpm extract "<Company Name>" [--ask "free text"]');
    process.exit(1);
  }
  const db = openDb();
  try {
    console.log(JSON.stringify(buildExtractPayload(db, name, ask), null, 2));
  } catch (e) {
    console.error((e as Error).message);
    process.exit(1);
  }
}

if (process.argv[1] && process.argv[1].endsWith("extract.ts")) {
  main();
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run tests/cli/extract.test.ts`
Expected: PASS — both cases green.

- [ ] **Step 5: Commit**

```bash
git add src/cli/extract.ts tests/cli/extract.test.ts
git commit -m "feat(extract): testable buildExtractPayload surfacing notebooklm_source_id"
```

---

## Task 9: `pnpm db select-citation` subcommand + agent/settings rewrite

**Files:**
- Modify: `src/cli/db.ts`
- Rewrite: `.claude/agents/ingestor.md`
- Rewrite: `.claude/agents/extractor.md`
- Modify: `.claude/settings.local.json`

- [ ] **Step 1: Add the `select-citation` subcommand to `db.ts`**

In `src/cli/db.ts`, add the import (top, with the others):

```typescript
import { selectCitation } from "../notebooklm/parse-citations.js";
```

Add a case inside the `switch (cmd)` (before `default`):

```typescript
  // pnpm db select-citation <value> '<raw notebooklm ask --json output>'
  case "select-citation": { out(selectCitation(rest[1] ?? "", Number(rest[0]))); break; }
```

And add it to the `default` usage string (append to the existing list):

```typescript
    console.error("commands: stage <json> | promote <id> [trust] | reject <id> <reason> | list-metrics [filingId] | list-staging [status] | summary | get-notebook <companyId> | set-notebook <companyId> <url> [notebookId] | get-industry-metrics <industry> | set-industry-metrics <industry> <source> <json> | select-citation <value> <askJson>");
```

- [ ] **Step 2: Smoke-test the subcommand manually**

Run:
```bash
pnpm db select-citation 9228 '{"answer":"x","references":[{"source_id":"src-A","citation_number":1,"cited_text":"Revenue 9,228 cr"}]}'
```
Expected output:
```json
{ "excerpt": "Revenue 9,228 cr", "sourceId": "src-A" }
```

- [ ] **Step 3: Rewrite `.claude/agents/ingestor.md`**

Overwrite the file with:

```markdown
---
name: ingestor
description: Loads one company's filing PDFs into its NotebookLM notebook by running the deterministic `pnpm ingest` driver (which shells out to the notebooklm CLI). Idempotent; reports failures honestly.
model: sonnet
tools: Bash, Read
---

You load ONE company's filings into NotebookLM so the extractor can query them. All real work is done
by a deterministic TypeScript driver — you run it and report its result honestly. You never fabricate success.

Workflow:
1. Run `pnpm ingest "<Company Name>"`.
2. The driver prints a JSON summary: `{ notebook_id, added: [...], skipped: [...], failed: [...] }`.
   - `added` — filings uploaded + indexed this run.
   - `skipped` — filings already mapped to a NotebookLM source (idempotent re-runs).
   - `failed` — filings whose upload/index errored; each has the filing_id and the error.
3. Report the counts plainly. If the command exited non-zero (any `failed`), say so explicitly and list
   the failed filing_ids + errors. Do NOT claim success when anything failed.

If the driver prints "NotebookLM not authenticated — run `notebooklm login` once.", relay that verbatim:
the user must run `notebooklm login` (one-time browser auth) and re-run you. That is the only human CLI touch.

Rules:
- One company per run. Never edit the DB yourself — the driver owns all writes.
- Honesty over a clean-looking summary.
```

- [ ] **Step 4: Rewrite `.claude/agents/extractor.md`**

Overwrite the file with:

```markdown
---
name: extractor
description: Queries a company's NotebookLM notebook (via the notebooklm CLI) for canonical + industry + free-text metrics and stages each answer with its citation into SQLite as pending. Never promotes. Never invents numbers.
model: sonnet
tools: Bash, Read
---

You extract financial metrics for ONE company by querying its NotebookLM notebook through the `notebooklm`
CLI. NotebookLM proposes; the Verifier disposes. You only STAGE — you never write the live `metrics` table,
and you NEVER report a number NotebookLM did not return.

Workflow:
1. Run `pnpm extract "<Company Name>" [--ask "<free text>"]`. Capture:
   - `notebook` (if null, STOP — tell the user to run the ingestor first),
   - `notebook.notebook_id` (the UUID you pass to every `notebooklm ask`),
   - `metrics.universal`, `metrics.industry`, `metrics.needsIndustryInference`,
   - `filings` — each has `id` and `notebooklm_source_id` (your citation→filing map), and `ask`.
2. If `metrics.needsIndustryInference` is true: ask NotebookLM which 4–8 metrics matter most for this
   company's industry, then persist them:
   `pnpm db set-industry-metrics "<industry>" notebooklm '[{"metric_key":"...","label":"..."}]'`.
   (Fallback: if NotebookLM is unhelpful, infer them yourself and store with `sonnet` instead of `notebooklm`.)
3. For each universal + industry metric (and the `--ask` request, if any), run:
   `notebooklm ask "<targeted question — ask for the figure, its period/unit, AND the exact quoted source text>" -n <notebook_id> --json`
   Capture the FULL raw JSON output (it has `answer` prose + `references[]` with `cited_text` + `source_id`).
4. Read `value` (as a plain number — strip commas/currency), `unit`, and `period` from the `answer` prose.
   If NotebookLM says the metric is not disclosed, SKIP it — a gap, never a guess.
5. Select the citation DETERMINISTICALLY — do not eyeball it:
   `pnpm db select-citation <value> '<the raw ask JSON>'` → prints `{ "excerpt", "sourceId" }`.
6. Map `sourceId` → `filing_id`: find the filing from step 1 whose `notebooklm_source_id === sourceId`.
   If `sourceId` is null (no citation matched the value), stage against any one filing_id and leave
   `notebooklm_source_id` null — the verifier will then search all the company's PDFs.
7. Stage it (status defaults to pending):
   `pnpm db stage '{"filing_id":N,"name":"revenue","value":9228,"unit":"INR cr","period":"Q4FY26","source_page":null,"excerpt":"<excerpt from step 5 or null>","source_url":null,"notebooklm_source_id":"<sourceId or null>"}'`
   Leave `source_page` null — the Verifier locates the page.
8. Report how many metrics you staged. Do NOT promote anything.

Rules:
- `value` must be a number that NotebookLM actually returned. Never guess to fill a column.
- The citation is chosen by `pnpm db select-citation`, never by your own judgment.
```

- [ ] **Step 5: Rewrite `.claude/settings.local.json`**

Overwrite with exactly:

```json
{
  "permissions": {
    "allow": [
      "Bash(pnpm:*)",
      "Bash(notebooklm:*)",
      "Read"
    ]
  }
}
```

- [ ] **Step 6: Verify no MCP references remain in code/agents**

Run: `grep -rn "mcp__notebooklm" .claude/ src/`
Expected: no matches (docs may still reference it historically — that's fine).

- [ ] **Step 7: Full suite + typecheck**

Run: `pnpm exec vitest run && pnpm exec tsc --noEmit`
Expected: PASS / clean.

- [ ] **Step 8: Commit**

```bash
git add src/cli/db.ts .claude/agents/ingestor.md .claude/agents/extractor.md .claude/settings.local.json
git commit -m "feat(agents): CLI-driven ingestor + extractor, deterministic select-citation, drop MCP perms"
```

---

## Task 10: E2E re-run on Asian Paints — MANUAL GATE (user runs this)

> This task requires the user's one-time `notebooklm login` (browser auth) and several minutes of live
> NotebookLM indexing. An executing agent cannot perform the browser login. The implementing agent should
> STOP after Task 9, report green unit tests + clean typecheck, and hand this checklist to the user.

**Files:**
- Create: `docs/superpowers/runs/2026-06-04-cli-pivot-asianpaint.md`

- [ ] **Step 1 (user): Authenticate once**

Run: `notebooklm login`  (opens a browser; log into Google, cookies persist to `~/.notebooklm/storage_state.json`)

- [ ] **Step 2 (user): Ingest (idempotent — backfills the 4 source-id mappings)**

Run: `pnpm ingest "Asian Paints"`
Expected: JSON summary with `notebook_id` = `9195a137-7850-4134-9c1f-524022f5592c`, `added: []` (already uploaded), `skipped` listing the 4 filings now mapped to their source ids, `failed: []`, exit 0.

Verify the backfill:
Run: `pnpm db get-notebook 1` and confirm the 4 filings now carry `notebooklm_source_id`
(e.g. `result-0.pdf` → `3ba2f598-82ef-414a-b7e5-f58e020da37b`).

- [ ] **Step 3 (user/agent): Run the extractor agent**

Dispatch the `extractor` agent on "Asian Paints". It should stage several pending metrics (each with an
excerpt + `notebooklm_source_id` where a citation matched).

- [ ] **Step 4 (user): Verify**

Run: `pnpm verify "Asian Paints"`
Expected `{ outcomes, summary }` where: at least one real number (e.g. revenue ₹9,228 cr) promotes
`verified`; a chart-only number lands `notebooklm-only`; and a deliberately fabricated number is `rejected`.

- [ ] **Step 5: Capture the run**

Create `docs/superpowers/runs/2026-06-04-cli-pivot-asianpaint.md` with: the three command outputs
(ingest summary, extractor staging count, verify summary), and a one-line confirmation of one verified
+ one notebooklm-only + one rejected metric.

- [ ] **Step 6: Commit**

```bash
git add docs/superpowers/runs/2026-06-04-cli-pivot-asianpaint.md
git commit -m "docs: Asian Paints CLI-pivot E2E run capture"
```

---

## Definition of done

- [ ] All unit tests green: `pnpm exec vitest run`
- [ ] Typecheck clean: `pnpm exec tsc --noEmit`
- [ ] No `mcp__notebooklm__*` references in `.claude/` or `src/`: `grep -rn "mcp__notebooklm" .claude/ src/` → empty
- [ ] `notebooklm login` is the only command a human must type for the live flow
- [ ] E2E (Task 10) passed and its run doc committed

---

## Self-review (performed against pivot.md + design)

- **Pivot Task 1 (schema/migration)** → Task 1. ✓
- **Pivot Task 2 (cli.ts wrapper, DI'd execFile)** → Task 2. ✓ (`run` param last, default real; throws with stderr; non-JSON throws.)
- **Pivot Task 3 (selectCitation + shared extractNumbers, delete parseCitations)** → Task 3. ✓ (`pageHasValue` refactored to reuse `extractNumbers` per user's choice; old test deleted; `Citation` type removed.)
- **Pivot Task 4 (filing source-id helpers)** → Task 4. ✓
- **Pivot Task 5 (stage with source id)** → Task 5. ✓ (field is snake_case `notebooklm_source_id` — documented deviation #1.)
- **Pivot Task 6 (ingest rewrite, `runIngest(db, deps)`)** → Task 6. ✓ (auth precheck, reuse-or-create notebook, idempotent, summary, non-zero on failure.)
- **Pivot Task 7 (source-scoped verify)** → Task 7. ✓ (all three scoping tests; matchMetric/trust logic unchanged; existing tests stay green.)
- **Pivot Task 8 (agents + settings)** → Task 9. ✓ (plus the deterministic `select-citation` CLI — documented deviation #2.)
- **Pivot Task 9 (extract surfaces source id)** → Task 8 (here), via `buildExtractPayload` + test. ✓
- **Pivot Task 10 (E2E)** → Task 10, framed as the user-run manual gate. ✓
- **Placeholder scan:** none — every code/test step contains complete content.
- **Type consistency:** `Runner`, `NbReference`, `IngestDeps`, `IngestSummary`, `CitationPick`, `extractNumbers`, `selectCitation`, `buildExtractPayload`, `setFilingSourceId`, `getFilingBySourceId` are defined once and referenced consistently; `notebooklm_source_id` is snake_case everywhere (column, `Filing`, `MetricInput`, staged JSON).
