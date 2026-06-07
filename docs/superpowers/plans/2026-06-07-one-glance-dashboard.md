# One-Glance Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a management commentary trend panel powered by a single NotebookLM query, fix quarterly financial trends display, and reorder the dashboard so peers → trends → commentary → brief → evidence.

**Architecture:** Three independent layers — (1) a new DB table + helper for commentary rows, (2) a new `pnpm commentary-trends` CLI script that queries the existing company notebook and inserts rows, and (3) frontend changes: a new `CommentaryPanel`, an upgraded `TrendsPanel` that deduplicates quarterly/annual Screener data and prioritises key metrics, and a reordered `Dashboard`. The executor gains one non-fatal step between `synthesize:main` and `peer-kpis`.

**Tech Stack:** TypeScript + better-sqlite3 + Next.js React + `notebooklm` CLI binary (existing injectable `Runner` pattern) + Observable Plot (existing).

---

## File Map

| Action | File | Responsibility |
|---|---|---|
| Create | `src/db/commentary-trends.ts` | `CommentaryTrend` type, `insertCommentaryTrends`, `getCommentaryTrends` |
| Modify | `src/db/migrate.ts` | Add `commentary_trends` table guard |
| Create | `src/cli/commentary-trends.ts` | `runCommentaryTrends` + main CLI entry |
| Modify | `package.json` | Add `"commentary-trends"` script |
| Modify | `src/dashboard/data.ts` | Add `commentaryTrends` to `DashboardData`, fix quarterly dedup + sort |
| Modify | `src/executor/run.ts` | Add `commentary-trends:main` step (non-fatal) |
| Create | `app/components/CommentaryPanel.tsx` | Latest-Q prominent + 3-col prior grid |
| Modify | `app/components/TrendsPanel.tsx` | Priority metrics first, period labels short |
| Modify | `app/components/Dashboard.tsx` | Reorder panels, wire `CommentaryPanel` |
| Create | `tests/cli/commentary-trends.test.ts` | Unit: runCommentaryTrends inserts rows |
| Modify | `tests/dashboard/data.test.ts` | Add: commentaryTrends returned correctly |
| Modify | `tests/executor/run.test.ts` | Update expected step ids |

---

## Task 1: DB — commentary_trends table + helper

**Files:**
- Modify: `src/db/migrate.ts`
- Create: `src/db/commentary-trends.ts`

- [ ] **Step 1: Add the table migration**

In `src/db/migrate.ts`, add before the final closing brace of `migrate()`:

```ts
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
```

- [ ] **Step 2: Create the DB helper**

Create `src/db/commentary-trends.ts`:

```ts
import type Database from "better-sqlite3";

export type CommentaryTone = "cautious" | "neutral" | "optimistic" | "confident";

export interface CommentaryTrend {
  period: string;
  summary: string;
  tone: CommentaryTone;
  keyTopics: string[];
  contradictionNote: string | null;
}

export function insertCommentaryTrends(
  db: Database.Database,
  companyId: number,
  trends: CommentaryTrend[],
): void {
  const del = db.prepare("DELETE FROM commentary_trends WHERE company_id = ?");
  const ins = db.prepare(
    "INSERT INTO commentary_trends (company_id, period, summary, tone, key_topics, contradiction_note) VALUES (?, ?, ?, ?, ?, ?)",
  );
  db.transaction(() => {
    del.run(companyId);
    for (const t of trends) {
      ins.run(companyId, t.period, t.summary, t.tone, JSON.stringify(t.keyTopics), t.contradictionNote ?? null);
    }
  })();
}

export function getCommentaryTrends(db: Database.Database, companyId: number): CommentaryTrend[] {
  const rows = db
    .prepare(
      "SELECT period, summary, tone, key_topics, contradiction_note FROM commentary_trends WHERE company_id = ? ORDER BY id ASC",
    )
    .all(companyId) as {
    period: string;
    summary: string;
    tone: CommentaryTone;
    key_topics: string;
    contradiction_note: string | null;
  }[];
  return rows.map((r) => ({
    period: r.period,
    summary: r.summary,
    tone: r.tone,
    keyTopics: JSON.parse(r.key_topics) as string[],
    contradictionNote: r.contradiction_note,
  }));
}
```

- [ ] **Step 3: Write the failing test**

Create `tests/cli/commentary-trends.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { openDb } from "../../src/db/db.js";
import { upsertCompany } from "../../src/db/companies.js";
import { upsertNotebook } from "../../src/db/notebooks.js";
import { getCommentaryTrends } from "../../src/db/commentary-trends.js";
import { runCommentaryTrends } from "../../src/cli/commentary-trends.js";

function seed() {
  const db = openDb(":memory:");
  const companyId = upsertCompany(db, { name: "Acme", ticker: null, industry: "Paints" });
  upsertNotebook(db, companyId, "url", "nb-1");
  return { db, companyId };
}

const fakeNbAsk = async (_nb: string, _q: string) => ({
  answer: JSON.stringify([
    { period: "Q1 FY24", summary: "Cautious on margins.", tone: "cautious", keyTopics: ["margins"], contradictionNote: null },
    { period: "Q2 FY24", summary: "RM stabilising.", tone: "neutral", keyTopics: ["raw materials"], contradictionNote: null },
    { period: "Q3 FY24", summary: "Recovery on track.", tone: "optimistic", keyTopics: ["margins", "volume"], contradictionNote: null },
    { period: "Q4 FY24", summary: "Best margins restored.", tone: "confident", keyTopics: ["margins", "competition"], contradictionNote: "Competition flagged in Q4 after dismissive Q3 stance." },
  ]),
  references: [],
});

describe("runCommentaryTrends", () => {
  it("inserts 4 rows oldest→newest and returns them", async () => {
    const { db, companyId } = seed();
    const trends = await runCommentaryTrends(db, "Acme", { nbAsk: fakeNbAsk });
    expect(trends).toHaveLength(4);
    expect(trends[0].period).toBe("Q1 FY24");
    expect(trends[3].tone).toBe("confident");
    expect(trends[3].contradictionNote).toMatch(/Competition/);
    const stored = getCommentaryTrends(db, companyId);
    expect(stored).toHaveLength(4);
    expect(stored[0].keyTopics).toEqual(["margins"]);
  });

  it("replaces previous rows on re-run", async () => {
    const { db, companyId } = seed();
    await runCommentaryTrends(db, "Acme", { nbAsk: fakeNbAsk });
    await runCommentaryTrends(db, "Acme", { nbAsk: fakeNbAsk });
    expect(getCommentaryTrends(db, companyId)).toHaveLength(4);
  });

  it("throws a clear error if the company has no notebook", async () => {
    const db = openDb(":memory:");
    upsertCompany(db, { name: "NoNb", ticker: null, industry: null });
    await expect(runCommentaryTrends(db, "NoNb", { nbAsk: fakeNbAsk })).rejects.toThrow(/notebook/i);
  });

  it("handles NLM answer wrapped in a fenced code block", async () => {
    const { db } = seed();
    const wrapped = async (_nb: string, _q: string) => ({
      answer: "```json\n" + JSON.stringify([
        { period: "Q1 FY24", summary: "ok", tone: "neutral", keyTopics: ["a"], contradictionNote: null },
      ]) + "\n```",
      references: [],
    });
    const trends = await runCommentaryTrends(db, "Acme", { nbAsk: wrapped });
    expect(trends).toHaveLength(1);
  });
});
```

- [ ] **Step 4: Run the test — expect FAIL (module not found)**

```bash
pnpm test tests/cli/commentary-trends.test.ts
```

Expected: FAIL with "Cannot find module … commentary-trends"

- [ ] **Step 5: Commit migration + DB helper (tests still red)**

```bash
git add src/db/migrate.ts src/db/commentary-trends.ts tests/cli/commentary-trends.test.ts
git commit -m "feat: commentary_trends table + DB helper + failing test"
```

---

## Task 2: CLI — commentary-trends script

**Files:**
- Create: `src/cli/commentary-trends.ts`
- Modify: `package.json`

- [ ] **Step 1: Create the CLI script**

Create `src/cli/commentary-trends.ts`:

```ts
import "dotenv/config";
import type Database from "better-sqlite3";
import { openDb } from "../db/db.js";
import { getCompany } from "../db/companies.js";
import { getNotebook } from "../db/notebooks.js";
import { nbAsk } from "../notebooklm/cli.js";
import { insertCommentaryTrends, type CommentaryTrend, type CommentaryTone } from "../db/commentary-trends.js";

const COMMENTARY_PROMPT = `For each of the last 4 quarterly concall or results documents in this notebook (oldest to newest), provide a JSON array where each element contains:
- "period": the quarter label (e.g. "Q3 FY24")
- "summary": 2-3 sentences summarising management's key messages
- "tone": one of "cautious", "neutral", "optimistic", "confident"
- "keyTopics": an array of 3-5 short topic tags that management emphasised (e.g. "margins", "rural demand", "competition", "capex guidance")
- "contradictionNote": a sentence describing any contradiction or notable shift from the prior quarter's stated position, or null if none.
Return only the JSON array, no prose.`;

const VALID_TONES = new Set<string>(["cautious", "neutral", "optimistic", "confident"]);

function parseResponse(answer: string): CommentaryTrend[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(answer);
  } catch {
    const fence = answer.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fence) {
      try {
        parsed = JSON.parse(fence[1]);
      } catch { /* fall through */ }
    }
    if (!parsed) {
      const arr = answer.match(/\[[\s\S]*\]/);
      if (arr) {
        try {
          parsed = JSON.parse(arr[0]);
        } catch { /* fall through */ }
      }
    }
  }
  if (!Array.isArray(parsed)) {
    throw new Error(`Could not parse CommentaryTrend[] from NLM answer: ${answer.slice(0, 300)}`);
  }
  return (parsed as unknown[]).map((item, i) => {
    if (typeof item !== "object" || item === null) throw new Error(`Item ${i} is not an object`);
    const r = item as Record<string, unknown>;
    const tone = String(r.tone ?? "");
    if (!VALID_TONES.has(tone)) throw new Error(`Item ${i} has invalid tone: "${tone}"`);
    return {
      period: String(r.period ?? ""),
      summary: String(r.summary ?? ""),
      tone: tone as CommentaryTone,
      keyTopics: Array.isArray(r.keyTopics) ? (r.keyTopics as unknown[]).map(String) : [],
      contradictionNote: r.contradictionNote != null ? String(r.contradictionNote) : null,
    };
  });
}

export interface CommentaryTrendsDeps {
  nbAsk: typeof nbAsk;
}

export async function runCommentaryTrends(
  db: Database.Database,
  companyName: string,
  deps: CommentaryTrendsDeps,
): Promise<CommentaryTrend[]> {
  const company = getCompany(db, companyName);
  if (!company) throw new Error(`Company "${companyName}" not found. Run pnpm scrape first.`);
  const notebook = getNotebook(db, company.id);
  if (!notebook?.notebook_id) throw new Error(`No NotebookLM notebook for "${companyName}". Run pnpm ingest first.`);
  const { answer } = await deps.nbAsk(notebook.notebook_id, COMMENTARY_PROMPT);
  const trends = parseResponse(answer);
  insertCommentaryTrends(db, company.id, trends);
  return trends;
}

function main(): void {
  const name = process.argv[2];
  if (!name) {
    console.error('usage: pnpm commentary-trends "<Company Name>"');
    process.exit(1);
  }
  const db = openDb();
  runCommentaryTrends(db, name, { nbAsk })
    .then((trends) => console.log(`Inserted ${trends.length} commentary trend rows for ${name}`))
    .catch((e) => {
      console.error((e as Error).message);
      process.exit(1);
    });
}

if (process.argv[1] && process.argv[1].endsWith("commentary-trends.ts")) {
  main();
}
```

- [ ] **Step 2: Add pnpm script**

In `package.json`, add to the `"scripts"` block alongside the other CLI scripts:

```json
"commentary-trends": "tsx src/cli/commentary-trends.ts",
```

- [ ] **Step 3: Run the tests — expect PASS**

```bash
pnpm test tests/cli/commentary-trends.test.ts
```

Expected: all 4 tests PASS.

- [ ] **Step 4: Run full suite — expect green**

```bash
pnpm test
```

Expected: all existing tests still pass.

- [ ] **Step 5: Commit**

```bash
git add src/cli/commentary-trends.ts package.json
git commit -m "feat: pnpm commentary-trends CLI script"
```

---

## Task 3: Dashboard data layer — commentaryTrends + quarterly series fix

**Files:**
- Modify: `src/dashboard/data.ts`
- Modify: `tests/dashboard/data.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `tests/dashboard/data.test.ts` (after the existing `describe` block):

```ts
import { insertCommentaryTrends } from "../../src/db/commentary-trends.js";

// …inside a new describe block at the bottom of the file:

describe("getDashboard — commentaryTrends", () => {
  it("returns commentaryTrends ordered oldest→newest", () => {
    const db = openDb(":memory:");
    const companyId = upsertCompany(db, { name: "Acme", ticker: null, industry: null });
    insertCommentaryTrends(db, companyId, [
      { period: "Q1 FY24", summary: "Cautious.", tone: "cautious", keyTopics: ["margins"], contradictionNote: null },
      { period: "Q4 FY24", summary: "Confident.", tone: "confident", keyTopics: ["volume"], contradictionNote: "shifted" },
    ]);
    const d = getDashboard(db, "Acme");
    expect(d!.commentaryTrends).toHaveLength(2);
    expect(d!.commentaryTrends[0].period).toBe("Q1 FY24");
    expect(d!.commentaryTrends[1].contradictionNote).toBe("shifted");
  });

  it("returns empty array when no commentary rows exist", () => {
    const db = openDb(":memory:");
    upsertCompany(db, { name: "Empty Co", ticker: null, industry: null });
    const d = getDashboard(db, "Empty Co");
    expect(d!.commentaryTrends).toEqual([]);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
pnpm test tests/dashboard/data.test.ts
```

Expected: FAIL — `commentaryTrends` does not exist on `DashboardData`.

- [ ] **Step 3: Update `src/dashboard/data.ts`**

Add the import at the top of `src/dashboard/data.ts`:

```ts
import { getCommentaryTrends, type CommentaryTrend } from "../db/commentary-trends.js";
```

Add `CommentaryTrend` to the exports (re-export for dashboard consumers):

```ts
export type { CommentaryTrend };
```

Add `commentaryTrends` field to `DashboardData`:

```ts
export interface DashboardData {
  company: Company;
  integrity: IntegritySummary;
  metrics: MetricRow[];
  rejects: RejectRow[];
  filings: Filing[];
  brief: BriefView | null;
  trends: TrendSeries[];
  industryKpis: string[];
  commentaryTrends: CommentaryTrend[];   // ← add this line
}
```

Replace the `trends` block inside `getDashboard` (the section labelled `// --- Multi-period trend series from screener metrics ---`) with:

```ts
  // --- Multi-period trend series from screener metrics ---
  // Screener stores both quarterly and annual rows in the same table. Deduplicate by
  // (name, period) keeping the first occurrence — quarterly rows are inserted first
  // (scrape-company iterates quarterly then annual) so quarterly wins for overlapping periods.
  const MONTH_IDX: Record<string, number> = {
    Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
    Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
  };
  function periodToOrder(period: string): number {
    const [month, year] = period.split(" ");
    return parseInt(year, 10) * 12 + (MONTH_IDX[month] ?? 0);
  }

  const screenerMetrics = allMetrics.filter((m) => m.trust === "screener" && m.period);
  const seenKeys = new Set<string>();
  const trendsByName = new Map<string, TrendSeries>();
  for (const m of screenerMetrics) {
    const dedupeKey = `${m.name}|${m.period}`;
    if (seenKeys.has(dedupeKey)) continue;
    seenKeys.add(dedupeKey);
    let series = trendsByName.get(m.name);
    if (!series) {
      series = { name: m.name, unit: m.unit, points: [] };
      trendsByName.set(m.name, series);
    }
    series.points.push({ period: m.period as string, value: m.value });
  }

  // Sort each series chronologically and keep only series with ≥2 points.
  // Priority order for display: revenue, ebitda, opm_pct, pat, then others alphabetically.
  const PRIORITY = ["revenue", "ebitda", "opm_pct", "pat"];
  const allTrends = Array.from(trendsByName.values())
    .filter((s) => s.points.length >= 2)
    .map((s) => ({
      ...s,
      points: [...s.points].sort((a, b) => periodToOrder(a.period) - periodToOrder(b.period)),
    }));
  const trends = [
    ...PRIORITY.map((name) => allTrends.find((s) => s.name === name)).filter((s): s is TrendSeries => !!s),
    ...allTrends.filter((s) => !PRIORITY.includes(s.name)).sort((a, b) => a.name.localeCompare(b.name)),
  ];
```

Add `commentaryTrends` to the return statement at the bottom of `getDashboard`:

```ts
  const commentaryTrends = getCommentaryTrends(db, company.id);

  return { company, integrity, metrics, rejects, filings, brief, trends, industryKpis, commentaryTrends };
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
pnpm test tests/dashboard/data.test.ts
```

Expected: all tests PASS (existing + new).

- [ ] **Step 5: Run full suite**

```bash
pnpm test
```

Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add src/dashboard/data.ts tests/dashboard/data.test.ts
git commit -m "feat: add commentaryTrends to dashboard data + deduplicate quarterly screener series"
```

---

## Task 4: Executor — add commentary-trends:main step

**Files:**
- Modify: `src/executor/run.ts`
- Modify: `tests/executor/run.test.ts`

- [ ] **Step 1: Update the executor step id test**

In `tests/executor/run.test.ts`, find the test `"assigns stable command ids for every deterministic step"`. Update its `expect(ids).toEqual([...])` to include `"commentary-trends:main"` between `"synthesize:main"` and `"peer-kpis"`:

```ts
expect(ids).toEqual([
  "scrape:main",
  "scrape:peer:BERGEPAINT",
  "scrape:peer:KANSAINER",
  "scrape:peer:INDIGOPNTS",
  "ingest:main",
  "ingest:peer:BERGEPAINT",
  "ingest:peer:KANSAINER",
  "ingest:peer:INDIGOPNTS",
  "synthesize:main",
  "commentary-trends:main",   // ← new
  "peer-kpis",
  "verify:ASIANPAINT",
  "verify:BERGEPAINT",
  "verify:KANSAINER",
  "verify:INDIGOPNTS",
  "db:summary",
]);
```

Also update the `"keeps the peer notebook analysis chain deterministic and ordered"` labels test to include `"Extract management commentary trends"` between `"Synthesize cited brief"` and `"Extract peer sector KPI pack"`:

```ts
expect(labels).toEqual([
  "Scrape Asian Paints",
  "Scrape peer Berger Paints",
  "Scrape peer Kansai Nerolac",
  "Scrape peer Indigo Paints",
  "Ingest Asian Paints into NotebookLM",
  "Ingest peer Berger Paints into NotebookLM",
  "Ingest peer Kansai Nerolac into NotebookLM",
  "Ingest peer Indigo Paints into NotebookLM",
  "Synthesize cited brief",
  "Extract management commentary trends",   // ← new
  "Extract peer sector KPI pack",
  "Verify staged metrics for Asian Paints",
  "Verify staged metrics for Berger Paints",
  "Verify staged metrics for Kansai Nerolac",
  "Verify staged metrics for Indigo Paints",
  "Summarize database",
]);
```

- [ ] **Step 2: Run executor tests — expect FAIL**

```bash
pnpm test tests/executor/run.test.ts
```

Expected: FAIL — expected arrays don't match.

- [ ] **Step 3: Add the step to `buildExecutionCommands` in `src/executor/run.ts`**

In the `commands` array inside `buildExecutionCommands`, insert the new entry between the `synthesize:main` entry and the `peer-kpis` entry:

```ts
  const commands = [
    scrapeCommand(plan.company, `Scrape ${plan.company.name}`, "scrape:main"),
    ...peerCommands,
    { id: "ingest:main", label: `Ingest ${plan.company.name} into NotebookLM`, cmd: "pnpm", args: ["ingest", plan.company.name] },
    ...peerIngestCommands,
    { id: "synthesize:main", label: "Synthesize cited brief", cmd: "pnpm", args: ["synthesize", plan.company.name, ask] },
    { id: "commentary-trends:main", label: "Extract management commentary trends", cmd: "pnpm", args: ["-s", "commentary-trends", plan.company.name] },  // ← add this line
    { id: "peer-kpis", label: "Extract peer sector KPI pack", cmd: "pnpm", args: ["peer-kpis", plan.company.name, "--ask", ask, "--companies", companyNames] },
    ...verifyCommands,
    { id: "db:summary", label: "Summarize database", cmd: "pnpm", args: ["db", "summary"] },
  ];
```

Then make the step non-fatal in `runExecution`. In the existing loop body the structure is:

```
const code = await current.exitCode;
await drained;
if (signal?.aborted) return;
if (code !== 0) { ... yield error ... return; }
yield { kind: "step-complete", ... };
```

Insert the non-fatal guard AFTER `if (signal?.aborted) return;` and BEFORE the existing `if (code !== 0)` block:

```ts
      // commentary-trends failure is non-fatal: emit a warning and continue.
      if (code !== 0 && command.id === "commentary-trends:main") {
        yield { kind: "text", text: "⚠ commentary-trends failed — skipping (dashboard will show commentary unavailable)" };
        yield { kind: "step-complete", id: command.id, label: command.label };
        current = null;
        continue;
      }
```

- [ ] **Step 4: Run executor tests — expect PASS**

```bash
pnpm test tests/executor/run.test.ts
```

Expected: all PASS.

- [ ] **Step 5: Run full suite**

```bash
pnpm test
```

Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add src/executor/run.ts tests/executor/run.test.ts
git commit -m "feat: add commentary-trends:main executor step (non-fatal)"
```

---

## Task 5: CommentaryPanel component

**Files:**
- Create: `app/components/CommentaryPanel.tsx`

- [ ] **Step 1: Create the component**

Create `app/components/CommentaryPanel.tsx`:

```tsx
import type { CommentaryTrend } from "../../src/dashboard/data.js";

type Tone = CommentaryTrend["tone"];

const TONE_STYLE: Record<Tone, { border: string; badgeBg: string; badgeFg: string; arrow: string }> = {
  cautious:   { border: "#c08080", badgeBg: "#fde8d8", badgeFg: "#8a3030", arrow: "↓" },
  neutral:    { border: "#c8b87a", badgeBg: "#fff9d8", badgeFg: "#8a7a30", arrow: "→" },
  optimistic: { border: "#a0b8a0", badgeBg: "#e8f7e8", badgeFg: "#2a5c3a", arrow: "↗" },
  confident:  { border: "#4a8c5c", badgeBg: "#d4f0e0", badgeFg: "#1a4c2a", arrow: "✓" },
};

function ToneBadge({ tone }: { tone: Tone }) {
  const s = TONE_STYLE[tone];
  return (
    <span style={{ fontSize: 11, background: s.badgeBg, color: s.badgeFg, borderRadius: 4, padding: "2px 7px" }}>
      {s.arrow} {tone}
    </span>
  );
}

function TopicChip({ label, warn }: { label: string; warn: boolean }) {
  return (
    <span
      style={{
        fontSize: 10,
        background: warn ? "#fde8d8" : "rgba(0,0,0,0.06)",
        color: warn ? "#8a3030" : "var(--muted)",
        borderRadius: 3,
        padding: "2px 6px",
      }}
    >
      {label}
    </span>
  );
}

function LatestCard({ trend, priorPeriod }: { trend: CommentaryTrend; priorPeriod: string | undefined }) {
  const s = TONE_STYLE[trend.tone];
  const flagged = !!trend.contradictionNote;
  return (
    <div
      style={{
        background: "rgba(255,255,255,0.5)",
        border: `1px solid ${flagged ? "#e8a080" : "#d6c8ac"}`,
        borderLeft: `3px solid ${s.border}`,
        borderRadius: 8,
        padding: "12px 14px",
        marginBottom: 10,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
        <span style={{ fontWeight: 700, fontSize: 13, color: "var(--text)" }}>{trend.period}</span>
        <ToneBadge tone={trend.tone} />
        {flagged && (
          <span style={{ fontSize: 11, background: "#fde8d8", color: "#8a3030", borderRadius: 4, padding: "2px 7px" }}>
            ⚠ contradicts {priorPeriod ?? "prior Q"}
          </span>
        )}
      </div>
      <p style={{ fontSize: 13, color: "var(--text)", lineHeight: 1.55, margin: "0 0 8px" }}>{trend.summary}</p>
      {trend.contradictionNote && (
        <p style={{ fontSize: 11, color: "#8a3030", fontStyle: "italic", margin: "0 0 8px", lineHeight: 1.4 }}>
          {trend.contradictionNote}
        </p>
      )}
      <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
        {trend.keyTopics.map((t) => (
          <TopicChip key={t} label={t} warn={flagged} />
        ))}
      </div>
    </div>
  );
}

function PriorCard({ trend }: { trend: CommentaryTrend }) {
  const s = TONE_STYLE[trend.tone];
  const flagged = !!trend.contradictionNote;
  const shortSummary =
    trend.summary.length > 100 ? trend.summary.slice(0, 100).replace(/\s\w+$/, "") + "…" : trend.summary;
  return (
    <div
      style={{
        background: "rgba(255,255,255,0.38)",
        border: `1px solid ${flagged ? "#e8a080" : "#e0d8c8"}`,
        borderLeft: `2px solid ${s.border}`,
        borderRadius: 6,
        padding: "9px 11px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5, flexWrap: "wrap" }}>
        <span style={{ fontWeight: 600, fontSize: 11, color: "var(--text)" }}>{trend.period}</span>
        <span style={{ fontSize: 10, color: s.badgeFg }}>
          {s.arrow} {trend.tone}
        </span>
        {flagged && (
          <span style={{ fontSize: 9, background: "#fde8d8", color: "#8a3030", borderRadius: 3, padding: "1px 5px" }}>
            ⚠
          </span>
        )}
      </div>
      <p style={{ fontSize: 11, color: "var(--muted)", lineHeight: 1.4, margin: "0 0 6px" }}>{shortSummary}</p>
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
        {trend.keyTopics.map((t) => (
          <TopicChip key={t} label={t} warn={false} />
        ))}
      </div>
    </div>
  );
}

export function CommentaryPanel({ trends }: { trends: CommentaryTrend[] }) {
  if (!trends || trends.length === 0) {
    return (
      <section style={{ marginTop: 20, marginBottom: 20 }}>
        <h2 style={{ fontSize: 14, textTransform: "uppercase", letterSpacing: 0.5, color: "var(--muted)", margin: "0 0 10px" }}>
          Management Commentary
        </h2>
        <p style={{ color: "var(--muted)", fontSize: 13 }}>Management commentary unavailable for this run.</p>
      </section>
    );
  }

  const latest = trends[trends.length - 1];
  const priorPeriod = trends.length >= 2 ? trends[trends.length - 2].period : undefined;
  const prior = trends.slice(0, trends.length - 1);

  return (
    <section style={{ marginTop: 20, marginBottom: 20 }}>
      <h2 style={{ fontSize: 14, textTransform: "uppercase", letterSpacing: 0.5, color: "var(--muted)", margin: "0 0 12px" }}>
        Management Commentary — Last {trends.length} Quarters
      </h2>
      <LatestCard trend={latest} priorPeriod={priorPeriod} />
      {prior.length > 0 && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${Math.min(prior.length, 3)}, 1fr)`,
            gap: 8,
          }}
        >
          {prior.map((t) => (
            <PriorCard key={t.period} trend={t} />
          ))}
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm exec tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/components/CommentaryPanel.tsx
git commit -m "feat: CommentaryPanel component"
```

---

## Task 6: TrendsPanel upgrade — period labels + section heading

**Files:**
- Modify: `app/components/TrendsPanel.tsx`

The data layer now sorts and prioritises series (Task 3). The component needs to:
1. Show a short period label on the x-axis ("Jun'24" format from "Jun 2024")
2. Update the section heading to "Financial Trends"

- [ ] **Step 1: Update `TrendsPanel.tsx`**

Replace the full contents of `app/components/TrendsPanel.tsx` with:

```tsx
"use client";
import { useEffect, useRef } from "react";
import * as Plot from "@observablehq/plot";
import type { TrendSeries } from "../../src/dashboard/data.js";

function shortPeriod(period: string): string {
  // "Jun 2024" → "Jun'24", "Mar 2023" → "Mar'23"
  const parts = period.split(" ");
  if (parts.length === 2) return `${parts[0]}'${parts[1].slice(-2)}`;
  return period;
}

function Sparkline({ series }: { series: TrendSeries }) {
  const ref = useRef<HTMLDivElement>(null);
  const points = series.points.map((p) => ({ ...p, label: shortPeriod(p.period) }));
  useEffect(() => {
    if (!ref.current) return;
    const chart = Plot.plot({
      marks: [
        Plot.lineY(points, { x: "label", y: "value", stroke: "var(--text)", strokeWidth: 1.5 }),
        Plot.dot(points, { x: "label", y: "value", fill: "var(--text)", r: 2 }),
      ],
      x: { tickRotate: -30, tickSize: 3 },
      y: { label: series.unit ?? undefined, grid: false },
      style: { background: "transparent", color: "var(--muted)", fontSize: "10px" },
      width: 220,
      height: 90,
      marginLeft: 36,
      marginBottom: 24,
    });
    ref.current.append(chart);
    return () => chart.remove();
  }, [series]);

  return (
    <div style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-start", marginRight: 20, marginBottom: 12 }}>
      <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 2 }}>
        {series.name.replace(/_/g, " ")} {series.unit ? `(${series.unit})` : ""}
      </div>
      <div ref={ref} />
    </div>
  );
}

export function TrendsPanel({ trends }: { trends: TrendSeries[] }) {
  if (!trends || trends.length === 0) return null;
  return (
    <section style={{ marginTop: 24, marginBottom: 16 }}>
      <h2 style={{ fontSize: 14, textTransform: "uppercase", letterSpacing: 0.5, color: "var(--muted)", margin: "0 0 12px" }}>
        Financial Trends
      </h2>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 0 }}>
        {trends.map((s) => (
          <Sparkline key={s.name} series={s} />
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm exec tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/components/TrendsPanel.tsx
git commit -m "feat: TrendsPanel short period labels + Financial Trends heading"
```

---

## Task 7: Dashboard reorder + wire CommentaryPanel

**Files:**
- Modify: `app/components/Dashboard.tsx`

The dashboard API route passes `DashboardData` to `<Dashboard>`. Since `commentaryTrends` is now on `DashboardData`, no API changes are needed — the field flows through automatically.

- [ ] **Step 1: Update `Dashboard.tsx`**

Replace the full contents of `app/components/Dashboard.tsx` with:

```tsx
import type { DashboardData } from "../../src/dashboard/data.js";
import type { ComparisonData } from "../../src/dashboard/comparison.js";
import type { ReviewerFinding } from "../../src/reviewer/review.js";
import { CompanyHeader } from "./CompanyHeader.js";
import { BriefPanel } from "./BriefPanel.js";
import { ReviewerPanel } from "./ReviewerPanel.js";
import { IntegrityTile } from "./IntegrityTile.js";
import { MetricsTable } from "./MetricsTable.js";
import { MarginChart } from "./MarginChart.js";
import { TrendsPanel } from "./TrendsPanel.js";
import { ComparisonPanel } from "./ComparisonPanel.js";
import { RejectsPanel } from "./RejectsPanel.js";
import { CommentaryPanel } from "./CommentaryPanel.js";

export function Dashboard({
  data,
  comparison,
  reviewerFindings = [],
}: {
  data: DashboardData | null;
  comparison?: ComparisonData | null;
  reviewerFindings?: ReviewerFinding[];
}) {
  if (!data) {
    return <p style={{ color: "var(--muted)" }}>Run an analysis to populate the dashboard.</p>;
  }
  return (
    <div>
      <CompanyHeader company={data.company} />
      {comparison && <ComparisonPanel data={comparison} />}
      <TrendsPanel trends={data.trends} />
      <CommentaryPanel trends={data.commentaryTrends} />
      <BriefPanel brief={data.brief} />
      <h2 style={{ fontSize: 14, textTransform: "uppercase", letterSpacing: 0.5, color: "var(--muted)", margin: "8px 0 12px" }}>Evidence</h2>
      <ReviewerPanel findings={reviewerFindings} />
      <IntegrityTile summary={data.integrity} />
      <MetricsTable rows={data.metrics} />
      <MarginChart rows={data.metrics} />
      <RejectsPanel rows={data.rejects} />
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm exec tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Build**

```bash
pnpm build
```

Expected: clean build, no errors.

- [ ] **Step 4: Run full test suite**

```bash
pnpm test
```

Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add app/components/Dashboard.tsx
git commit -m "feat: reorder dashboard — peers → trends → commentary → brief → evidence"
```

---

## Task 8: Final verification

- [ ] **Step 1: Full test suite**

```bash
pnpm test
```

Expected: all tests green. If any fail, fix before proceeding.

- [ ] **Step 2: Typecheck**

```bash
pnpm exec tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Production build**

```bash
pnpm build
```

Expected: clean. Fix any build-time errors before declaring done.

- [ ] **Step 4: Smoke test the dev server**

```bash
pnpm dev
```

Open `http://localhost:4317`. If a prior analysis run exists in the DB, the dashboard should show panels in the new order: comparison → financial trends → management commentary (or "unavailable") → brief → evidence. If no run exists, the empty state renders correctly.

- [ ] **Step 5: Final commit if needed**

```bash
git add -p   # stage any remaining changes
git commit -m "chore: one-glance dashboard complete"
```
