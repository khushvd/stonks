# Briefing Real-Data Adapter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Execution profile:** Sonnet coordinator + Sonnet subagents (one subagent per task, coordinator reviews the diff between tasks and keeps `pnpm test` / `pnpm exec tsc --noEmit` / `pnpm build` green before moving on).
> **Branch:** This plan builds on `claude/wizardly-ritchie-tzvdcn` (PR #1), which contains the briefing UI. Confirm you are on that branch (`git branch --show-current`) before starting — the files this plan modifies (`app/components/briefing/*`) do NOT exist on `main`.

**Goal:** Replace the mock-returning `toBriefingData()` stub with a real, pure mapping from the live `DashboardData` + `ComparisonData` payloads into the `BriefingData` view model, so the scrollytelling briefing renders actual study results.

**Architecture:** The adapter is one pure function composed of eight small, independently unit-tested mapping helpers (`adapter-util`, `-quarters`, `-stats`, `-matrix`, `-brief`, `-commentary`, `-sources`, `-company`). Each helper takes a slice of the real payload and returns a slice of `BriefingData`. The orchestrator (`adapter.ts`) wires them together and seeds cross-cutting fields (subject margin history into `peerMargins`). No React, no DB, no I/O — every helper is a deterministic data transform, so the whole surface is testable with synthetic fixtures and never needs a running app.

**Tech Stack:** TypeScript (ESM), Vitest. No new dependencies. Pure functions only.

---

## Context

The briefing UI (PR #1) is feature-complete on mock data. The single seam to real data is:

```ts
// app/components/briefing/adapter.ts  (current — the stub this plan replaces)
export function toBriefingData(_data?: unknown, _comparison?: unknown): BriefingData {
  return MOCK_BRIEFING;
}
```

`app/page.tsx` already calls it with the right values — `toBriefingData(data, comparison)` where `data: DashboardData` and `comparison: ComparisonData | null` — so once the signature is typed and the body real, the briefing renders live data with no further page wiring.

### Source shapes (read these files while porting — do NOT re-derive from memory)

- `src/dashboard/data.ts` — `DashboardData`, `TrendSeries`, `TrendPoint`, `MetricRow`, `BriefView`, `BriefClaimView`, `CommentaryTrend` (re-exported).
- `src/dashboard/comparison.ts` — `ComparisonData`, `ComparisonMetricRow`, `ComparisonCell`, `PeerCoverage`.
- `src/types.ts` — `Company`, `Filing`, `FilingType`, `Trust`, `IntegritySummary`.
- `src/db/commentary-trends.ts` — `CommentaryTrend`, `CommentaryTone`.

### Target shape (already on the branch)

- `app/components/briefing/types.ts` — `BriefingData`, `MatrixRow`, `Cell`, `Trust`, `Tone`, `SourceType`, `Dir`, `CellFmt`.

### Mapping map (source → target)

| BriefingData field | Source | Notes |
| --- | --- | --- |
| `company.{name,ticker,industry}` | `DashboardData.company` | `ticker ?? ""`, `industry ?? ""` |
| `company.sector` | `DashboardData.company.industry` | No distinct sector field — reuse industry |
| `company.asOf` | latest `DashboardData.filings[].period` | Formatted; `""` if none |
| `ask` | `DashboardData.brief?.ask` | `""` if no brief |
| `about` | **STUB** | Derived placeholder; backend synthesis is out of scope |
| `bottomLine.{worth,watch}` | **STUB** | Derived from `integrity` + contradiction flag; out of scope to synthesize properly |
| `brief.{headline,answer,drivers,guidance,risks}` | `DashboardData.brief.claims[]` grouped by `section` | risk `tone` heuristic = `"cautious"` |
| `quarters[]` | `DashboardData.trends[]` (revenue/ebitda/opm_pct/pat) | Zip by period, last 8 |
| `stats[]` | derived from `quarters[]` | YoY = latest vs index−4 |
| `peers[]` | `ComparisonData.companies` | Keyed by company name; subject first |
| `matrix[]` | `ComparisonData.metrics[]` | `ComparisonCell` → `Cell` trust flags |
| `peerMargins{}` | margin row + subject `quarters[]` | Subject = full series; peers = single latest point (sparkline-safe) |
| `commentary[]` | `DashboardData.commentaryTrends[]` | 1:1 (`keyTopics`→`topics`, `contradictionNote`→`flag`) |
| `sources[]` | `DashboardData.filings[]` | `FilingType`→`SourceType`; `page` defaults to 1 |
| `integrity` | `DashboardData.integrity` | Field rename `notebooklmOnly`→`nlmOnly` |

### Known partial-fidelity decisions (intentional, documented in code comments)

1. **`about` / `bottomLine`** are not produced by the backend. The adapter emits honest placeholders derived from available facts (company name/industry, verified/rejected counts, any contradiction flag). A `// TODO(backend-synthesis):` comment marks each. Producing real prose is a separate brainstorm→spec.
2. **`peerMargins` per-peer history** — `ComparisonData` carries only the *latest* margin per peer, not a 6-quarter series. The subject company gets its full history from `trends`; peers get a single-point sparkline (still renders safely). Full per-peer history would require per-peer `getDashboard` trend fetches — out of scope here.
3. **`sources[].page`** — `Filing` has no page number; defaults to `1`. Real page anchoring is a backend concern.
4. **`CONCALL` source type** is unused — no `FilingType` maps to it (`result` → `RESULT`). Left in the type for the mock; real data never emits it.

---

## File Structure

**Create** (all flat under `app/components/briefing/`, matching the existing `format.ts` / `peers-sort.ts` convention):
- `adapter-util.ts` — shared pure helpers: `periodToOrder`, `shortLabel`, `inferFmt`, `humanizeKey`, `fmtCr`, `fmtPctValue`.
- `adapter-quarters.ts` — `deriveQuarters(trends)`.
- `adapter-stats.ts` — `deriveStats(quarters)`.
- `adapter-matrix.ts` — `mapMatrix(comparison, subjectKey)` → `{ peers, matrix, peerMargins }`; plus `mapCellTrust`.
- `adapter-brief.ts` — `mapBrief(briefView)`.
- `adapter-commentary.ts` — `mapCommentary(trends)`.
- `adapter-sources.ts` — `mapSources(filings)`.
- `adapter-company.ts` — `mapCompany(company, filings)`, `stubAbout(company)`, `stubBottomLine(integrity, hasContradiction)`.
- Tests: `__tests__/adapter-util.test.ts`, `adapter-quarters.test.ts`, `adapter-stats.test.ts`, `adapter-matrix.test.ts`, `adapter-brief.test.ts`, `adapter-commentary.test.ts`, `adapter-sources.test.ts`, `adapter-company.test.ts`, `adapter.test.ts`.

**Modify:**
- `app/components/briefing/adapter.ts` — replace stub body; type the signature.
- `app/components/briefing/chapters/Peers.tsx` — one line: subject detection falls back to `data.peers[0]` so name-keyed columns highlight correctly.
- `CLAUDE.md` — one build-phase note that the adapter is wired.

**Import paths (from flat `app/components/briefing/*.ts` files):**
- `import type { DashboardData, TrendSeries } from "../../../src/dashboard/data.js";`
- `import type { ComparisonData, ComparisonCell } from "../../../src/dashboard/comparison.js";`
- `import type { Company, Filing } from "../../../src/types.js";`
- Sibling briefing types: `import type { BriefingData, Cell } from "./types";` (extensionless).

---

## Task 1: Shared adapter utilities

**Files:**
- Create: `app/components/briefing/adapter-util.ts`
- Test: `app/components/briefing/__tests__/adapter-util.test.ts`

- [ ] **Step 1: Write the failing test** `__tests__/adapter-util.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { periodToOrder, shortLabel, inferFmt, humanizeKey, fmtCr, fmtPctValue } from "../adapter-util";

describe("periodToOrder", () => {
  it("orders by year then month", () => {
    expect(periodToOrder("Mar 2024")).toBeLessThan(periodToOrder("Jun 2024"));
    expect(periodToOrder("Dec 2023")).toBeLessThan(periodToOrder("Mar 2024"));
  });
  it("does not throw on a malformed period", () => {
    expect(() => periodToOrder("garbage")).not.toThrow();
  });
});

describe("shortLabel", () => {
  it("compresses a 'Mon YYYY' period to Mon'YY", () => {
    expect(shortLabel("Mar 2024")).toBe("Mar'24");
  });
  it("returns the input unchanged when it does not match", () => {
    expect(shortLabel("Q4FY25")).toBe("Q4FY25");
  });
});

describe("inferFmt", () => {
  it("treats a percent unit as pct", () => { expect(inferFmt("%")).toBe("pct"); });
  it("treats everything else as int", () => { expect(inferFmt("₹cr")).toBe("int"); });
  it("treats null unit as int", () => { expect(inferFmt(null)).toBe("int"); });
});

describe("humanizeKey", () => {
  it("turns a snake metric key into spaced words", () => {
    expect(humanizeKey("opm_pct")).toBe("opm pct");
  });
});

describe("fmtCr", () => {
  it("formats a crore value with en-IN grouping and suffix", () => {
    expect(fmtCr(2425)).toBe("₹2,425 cr");
  });
});

describe("fmtPctValue", () => {
  it("formats a percent to one decimal with a sign", () => {
    expect(fmtPctValue(1.5)).toBe("+1.5 pts");
    expect(fmtPctValue(-2)).toBe("-2.0 pts");
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails.**

Run: `pnpm test -- adapter-util.test`
Expected: FAIL — `Cannot find module '../adapter-util'`.

- [ ] **Step 3: Write `adapter-util.ts`:**

```ts
import type { CellFmt } from "./types";

const MONTH_IDX: Record<string, number> = {
  Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
  Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
};

/** Chronological sort key for a "Mon YYYY" screener period. Malformed input sorts to 0. */
export function periodToOrder(period: string): number {
  const [month, year] = period.split(" ");
  const y = parseInt(year, 10);
  if (Number.isNaN(y)) return 0;
  return y * 12 + (MONTH_IDX[month] ?? 0);
}

/** "Mar 2024" -> "Mar'24". Anything that doesn't match passes through unchanged. */
export function shortLabel(period: string): string {
  const [month, year] = period.split(" ");
  if (!month || !year || year.length < 4 || !(month in MONTH_IDX)) return period;
  return `${month}'${year.slice(2)}`;
}

/** A "%" unit means the matrix cell renders as a 1-decimal percent; everything else is an integer. */
export function inferFmt(unit: string | null): CellFmt {
  return unit && unit.trim() === "%" ? "pct" : "int";
}

/** "opm_pct" -> "opm pct" — a cheap human label for a snake_case metric key. */
export function humanizeKey(key: string): string {
  return key.replace(/_/g, " ").trim();
}

/** 2425 -> "₹2,425 cr" (en-IN grouping). */
export function fmtCr(value: number): string {
  return `₹${Math.round(value).toLocaleString("en-IN")} cr`;
}

/** 1.5 -> "+1.5 pts", -2 -> "-2.0 pts". */
export function fmtPctValue(delta: number): string {
  const sign = delta >= 0 ? "+" : "-";
  return `${sign}${Math.abs(delta).toFixed(1)} pts`;
}
```

- [ ] **Step 4: Run the test to confirm it passes.**

Run: `pnpm test -- adapter-util.test`
Expected: PASS (10 assertions).

- [ ] **Step 5: Commit.**

```bash
git config user.email noreply@anthropic.com
git config user.name Claude
git add app/components/briefing/adapter-util.ts app/components/briefing/__tests__/adapter-util.test.ts
git commit -m "feat(adapter): shared briefing-adapter utilities"
```

---

## Task 2: Derive quarters from trend series

**Files:**
- Create: `app/components/briefing/adapter-quarters.ts`
- Test: `app/components/briefing/__tests__/adapter-quarters.test.ts`

`DashboardData.trends` is `TrendSeries[]` where each series is `{ name, unit, points: { period, value }[] }`. We want one `quarters[]` row per period, pulling `rev`/`ebitda`/`pat`/`margin` from the `revenue`/`ebitda`/`pat`/`opm_pct` series respectively, in chronological order, capped at the last 8.

- [ ] **Step 1: Write the failing test** `__tests__/adapter-quarters.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { deriveQuarters } from "../adapter-quarters";
import type { TrendSeries } from "../../../src/dashboard/data.js";

const trends: TrendSeries[] = [
  { name: "revenue", unit: "₹cr", points: [{ period: "Dec 2023", value: 2012 }, { period: "Mar 2024", value: 1905 }] },
  { name: "ebitda", unit: "₹cr", points: [{ period: "Dec 2023", value: 765 }, { period: "Mar 2024", value: 657 }] },
  { name: "opm_pct", unit: "%", points: [{ period: "Dec 2023", value: 38 }, { period: "Mar 2024", value: 34.5 }] },
  { name: "pat", unit: "₹cr", points: [{ period: "Dec 2023", value: 452 }, { period: "Mar 2024", value: 418 }] },
];

describe("deriveQuarters", () => {
  it("zips the four series into one row per period, chronologically", () => {
    const q = deriveQuarters(trends);
    expect(q).toHaveLength(2);
    expect(q[0]).toEqual({ period: "Dec 2023", label: "Dec'23", margin: 38, rev: 2012, ebitda: 765, pat: 452 });
    expect(q[1].period).toBe("Mar 2024");
  });
  it("fills missing series values with 0", () => {
    const q = deriveQuarters([{ name: "revenue", unit: "₹cr", points: [{ period: "Mar 2024", value: 1905 }] }]);
    expect(q[0]).toEqual({ period: "Mar 2024", label: "Mar'24", margin: 0, rev: 1905, ebitda: 0, pat: 0 });
  });
  it("keeps only the last 8 periods", () => {
    const many = Array.from({ length: 11 }, (_, i) => ({ period: `Mar ${2015 + i}`, value: i }));
    const q = deriveQuarters([{ name: "revenue", unit: "₹cr", points: many }]);
    expect(q).toHaveLength(8);
    expect(q[0].period).toBe("Mar 2018");
  });
  it("returns an empty array when there are no trends", () => {
    expect(deriveQuarters([])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails.**

Run: `pnpm test -- adapter-quarters.test`
Expected: FAIL — `Cannot find module '../adapter-quarters'`.

- [ ] **Step 3: Write `adapter-quarters.ts`:**

```ts
import type { TrendSeries } from "../../../src/dashboard/data.js";
import type { BriefingData } from "./types";
import { periodToOrder, shortLabel } from "./adapter-util";

type Quarter = BriefingData["quarters"][number];

/** Build a {period}->value lookup for one named series (empty map if absent). */
function seriesMap(trends: TrendSeries[], name: string): Map<string, number> {
  const s = trends.find((t) => t.name === name);
  return new Map((s?.points ?? []).map((p) => [p.period, p.value]));
}

/**
 * Zip the revenue/ebitda/opm_pct/pat trend series into one quarter row per period,
 * chronologically, capped at the last 8. Missing values default to 0.
 */
export function deriveQuarters(trends: TrendSeries[]): Quarter[] {
  if (trends.length === 0) return [];
  const rev = seriesMap(trends, "revenue");
  const ebitda = seriesMap(trends, "ebitda");
  const margin = seriesMap(trends, "opm_pct");
  const pat = seriesMap(trends, "pat");

  const periods = Array.from(new Set([...rev.keys(), ...ebitda.keys(), ...margin.keys(), ...pat.keys()]))
    .sort((a, b) => periodToOrder(a) - periodToOrder(b));

  const rows: Quarter[] = periods.map((period) => ({
    period,
    label: shortLabel(period),
    margin: margin.get(period) ?? 0,
    rev: rev.get(period) ?? 0,
    ebitda: ebitda.get(period) ?? 0,
    pat: pat.get(period) ?? 0,
  }));

  return rows.slice(-8);
}
```

- [ ] **Step 4: Run the test to confirm it passes.**

Run: `pnpm test -- adapter-quarters.test`
Expected: PASS (4 assertions).

- [ ] **Step 5: Commit.**

```bash
git config user.email noreply@anthropic.com
git config user.name Claude
git add app/components/briefing/adapter-quarters.ts app/components/briefing/__tests__/adapter-quarters.test.ts
git commit -m "feat(adapter): derive briefing quarters from trend series"
```

---

## Task 3: Derive stat tiles from quarters

**Files:**
- Create: `app/components/briefing/adapter-stats.ts`
- Test: `app/components/briefing/__tests__/adapter-stats.test.ts`

Four headline tiles (EBITDA margin, Revenue, EBITDA, PAT) computed from the derived quarters. YoY = latest quarter vs the quarter four positions earlier (same season, prior year). Margin delta is in points (`+1.5 pts`); revenue/ebitda/pat deltas are percentages (`+27.3%`).

- [ ] **Step 1: Write the failing test** `__tests__/adapter-stats.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { deriveStats } from "../adapter-stats";
import type { BriefingData } from "../types";

const quarters: BriefingData["quarters"] = [
  { period: "Mar 2024", label: "Mar'24", margin: 34.5, rev: 1905, ebitda: 657, pat: 418 },
  { period: "Jun 2024", label: "Jun'24", margin: 30.0, rev: 1597, ebitda: 479, pat: 248 },
  { period: "Sep 2024", label: "Sep'24", margin: 29.5, rev: 1891, ebitda: 558, pat: 583 },
  { period: "Dec 2024", label: "Dec'24", margin: 39.5, rev: 2533, ebitda: 1001, pat: 582 },
  { period: "Mar 2025", label: "Mar'25", margin: 36.0, rev: 2425, ebitda: 873, pat: 522 },
];

describe("deriveStats", () => {
  it("produces four tiles keyed by metric", () => {
    const stats = deriveStats(quarters);
    expect(stats.map((s) => s.key)).toEqual(["EBITDA margin", "Revenue", "EBITDA", "PAT"]);
  });
  it("computes the margin tile in points vs the year-ago quarter", () => {
    const margin = deriveStats(quarters)[0];
    expect(margin.value).toBe("36.0%");
    expect(margin.delta).toBe("+1.5 pts"); // 36.0 vs 34.5
    expect(margin.dir).toBe("up");
  });
  it("computes the revenue tile as a YoY percent", () => {
    const rev = deriveStats(quarters)[1];
    expect(rev.value).toBe("₹2,425 cr");
    expect(rev.delta).toBe("+27.3%"); // (2425-1905)/1905
    expect(rev.dir).toBe("up");
  });
  it("degrades gracefully with fewer than five quarters", () => {
    const stats = deriveStats(quarters.slice(-1));
    expect(stats[1].delta).toBe("—");
    expect(stats[1].dir).toBe("flat");
  });
  it("returns an empty array when there are no quarters", () => {
    expect(deriveStats([])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails.**

Run: `pnpm test -- adapter-stats.test`
Expected: FAIL — `Cannot find module '../adapter-stats'`.

- [ ] **Step 3: Write `adapter-stats.ts`:**

```ts
import type { BriefingData, Dir } from "./types";
import { fmtCr, fmtPctValue } from "./adapter-util";

type Quarter = BriefingData["quarters"][number];
type Stat = BriefingData["stats"][number];

function dirOf(delta: number): Dir {
  if (delta > 0.05) return "up";
  if (delta < -0.05) return "down";
  return "flat";
}

function pctDelta(curr: number, prior: number): { delta: string; dir: Dir } {
  if (prior === 0) return { delta: "—", dir: "flat" };
  const pct = ((curr - prior) / prior) * 100;
  return { delta: `${pct >= 0 ? "+" : "-"}${Math.abs(pct).toFixed(1)}%`, dir: dirOf(pct) };
}

/**
 * Four headline tiles from the latest quarter, YoY-compared to the quarter four positions
 * earlier (same season, prior year). Margin delta in points; the rest as percentages.
 */
export function deriveStats(quarters: Quarter[]): Stat[] {
  if (quarters.length === 0) return [];
  const latest = quarters[quarters.length - 1];
  const prior = quarters.length >= 5 ? quarters[quarters.length - 5] : null;
  const sub = prior ? `YoY, ${latest.label}` : latest.label;

  const marginTile: Stat = (() => {
    if (!prior) return { key: "EBITDA margin", value: `${latest.margin.toFixed(1)}%`, delta: "—", dir: "flat", sub };
    const d = +(latest.margin - prior.margin).toFixed(1);
    return { key: "EBITDA margin", value: `${latest.margin.toFixed(1)}%`, delta: fmtPctValue(d), dir: dirOf(d), sub };
  })();

  const moneyTile = (key: string, pick: (q: Quarter) => number): Stat => {
    const value = fmtCr(pick(latest));
    if (!prior) return { key, value, delta: "—", dir: "flat", sub };
    const { delta, dir } = pctDelta(pick(latest), pick(prior));
    return { key, value, delta, dir, sub };
  };

  return [
    marginTile,
    moneyTile("Revenue", (q) => q.rev),
    moneyTile("EBITDA", (q) => q.ebitda),
    moneyTile("PAT", (q) => q.pat),
  ];
}
```

- [ ] **Step 4: Run the test to confirm it passes.**

Run: `pnpm test -- adapter-stats.test`
Expected: PASS (5 assertions).

- [ ] **Step 5: Commit.**

```bash
git config user.email noreply@anthropic.com
git config user.name Claude
git add app/components/briefing/adapter-stats.ts app/components/briefing/__tests__/adapter-stats.test.ts
git commit -m "feat(adapter): derive briefing stat tiles with YoY deltas"
```

---

## Task 4: Map the comparison matrix + trust flags

**Files:**
- Create: `app/components/briefing/adapter-matrix.ts`
- Test: `app/components/briefing/__tests__/adapter-matrix.test.ts`
- Modify: `app/components/briefing/chapters/Peers.tsx` (one line — subject detection)

`ComparisonData.metrics` is `ComparisonMetricRow[]` with `cells: Record<companyName, ComparisonCell>`. We map each row to a `MatrixRow` and each `ComparisonCell` to a briefing `Cell`. The margin KPI row is normalized to the exact label `"EBITDA margin"` with `spark: "margin"` so `Peers.tsx` (which keys its rank bars and in-cell sparklines off that exact string) lights up. `peerMargins` is seeded with a single latest-margin point per peer (sparkline-safe); the orchestrator later overrides the subject with its full history.

Trust mapping (`ComparisonCell` → `Cell`):
- `{ state: "value", trust: "verified" | "screener" }` → bare `number` (silent / trust ok).
- `{ state: "value", trust: "notebooklm-only" }` → `{ v, trust: "nlm", note: "NotebookLM-only — not source-verified." }`.
- `{ state: "missing", reason }` → `{ v: null, trust: "missing", note: reason ?? "Not disclosed." }`.
- `{ state: "failed", reason }` → `{ v: null, trust: "missing", note: reason ?? "Extraction failed." }` (briefing has no `failed` trust).
- `{ state: "rejected", reason }` → `{ v: null, trust: "rejected", note: reason ?? "Quarantined." }`.

- [ ] **Step 1: Write the failing test** `__tests__/adapter-matrix.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { mapMatrix, mapCellTrust } from "../adapter-matrix";
import type { ComparisonData } from "../../../src/dashboard/comparison.js";

const okBadge = { label: "VERIFIED", tone: "good", color: "#0f0" } as const;

describe("mapCellTrust", () => {
  it("renders a verified value as a bare number", () => {
    expect(mapCellTrust({ state: "value", value: 35.2, unit: "%", period: "Mar 2025", trust: "verified", badge: okBadge, citationHref: null })).toBe(35.2);
  });
  it("renders a notebooklm-only value as an nlm-flagged cell", () => {
    expect(mapCellTrust({ state: "value", value: 8900, unit: "₹", period: null, trust: "notebooklm-only", badge: okBadge, citationHref: null }))
      .toEqual({ v: 8900, trust: "nlm", note: "NotebookLM-only — not source-verified." });
  });
  it("renders a rejected cell with its reason", () => {
    expect(mapCellTrust({ state: "rejected", reason: "Unit mismatch" }))
      .toEqual({ v: null, trust: "rejected", note: "Unit mismatch" });
  });
  it("renders a missing cell with a fallback note", () => {
    expect(mapCellTrust({ state: "missing", reason: null }))
      .toEqual({ v: null, trust: "missing", note: "Not disclosed." });
  });
  it("maps a failed cell onto missing trust", () => {
    expect(mapCellTrust({ state: "failed", reason: "Extraction failed" }))
      .toEqual({ v: null, trust: "missing", note: "Extraction failed" });
  });
});

const comparison: ComparisonData = {
  companies: ["Indian Hotels Co.", "EIH"],
  coverage: [],
  metrics: [
    { name: "revenue", label: "Revenue", unit: "₹cr", cells: {
      "Indian Hotels Co.": { state: "value", value: 8565, unit: "₹cr", period: null, trust: "verified", badge: okBadge, citationHref: null },
      "EIH": { state: "value", value: 2742, unit: "₹cr", period: null, trust: "verified", badge: okBadge, citationHref: null },
    } },
    { name: "opm_pct", label: "Operating margin", unit: "%", cells: {
      "Indian Hotels Co.": { state: "value", value: 35.2, unit: "%", period: null, trust: "verified", badge: okBadge, citationHref: null },
      "EIH": { state: "value", value: 38.4, unit: "%", period: null, trust: "verified", badge: okBadge, citationHref: null },
    } },
  ],
};

describe("mapMatrix", () => {
  it("carries peer columns through in order", () => {
    expect(mapMatrix(comparison, "Indian Hotels Co.").peers).toEqual(["Indian Hotels Co.", "EIH"]);
  });
  it("normalizes the margin row to 'EBITDA margin' with a margin sparkline key", () => {
    const marginRow = mapMatrix(comparison, "Indian Hotels Co.").matrix.find((r) => r.spark === "margin");
    expect(marginRow?.kpi).toBe("EBITDA margin");
    expect(marginRow?.fmt).toBe("pct");
  });
  it("seeds peerMargins with a single latest point per peer", () => {
    const { peerMargins } = mapMatrix(comparison, "Indian Hotels Co.");
    expect(peerMargins["EIH"]).toEqual([38.4]);
    expect(peerMargins["Indian Hotels Co."]).toEqual([35.2]);
  });
  it("returns empty structures for a null comparison", () => {
    expect(mapMatrix(null, "X")).toEqual({ peers: [], matrix: [], peerMargins: {} });
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails.**

Run: `pnpm test -- adapter-matrix.test`
Expected: FAIL — `Cannot find module '../adapter-matrix'`.

- [ ] **Step 3: Write `adapter-matrix.ts`:**

```ts
import type { ComparisonData, ComparisonCell, ComparisonMetricRow } from "../../../src/dashboard/comparison.js";
import type { Cell, MatrixRow } from "./types";
import { inferFmt } from "./adapter-util";

/** A comparison row is "the margin row" if its metric key or label points at operating margin. */
function isMarginRow(row: ComparisonMetricRow): boolean {
  return row.name === "opm_pct" || /margin/i.test(row.label);
}

/** Map one comparison cell to a briefing matrix cell, carrying trust as a flag. */
export function mapCellTrust(cell: ComparisonCell): Cell {
  switch (cell.state) {
    case "value":
      if (cell.trust === "notebooklm-only") {
        return { v: cell.value, trust: "nlm", note: "NotebookLM-only — not source-verified." };
      }
      return cell.value; // verified | screener → silent
    case "rejected":
      return { v: null, trust: "rejected", note: cell.reason ?? "Quarantined." };
    case "failed":
      return { v: null, trust: "missing", note: cell.reason ?? "Extraction failed." };
    case "missing":
    default:
      return { v: null, trust: "missing", note: cell.reason ?? "Not disclosed." };
  }
}

/**
 * Map ComparisonData into the briefing's peer columns, KPI matrix, and a sparkline-safe
 * peerMargins seed (single latest margin per peer). The orchestrator overrides the subject's
 * series with its full history. Returns empty structures when comparison is null.
 */
export function mapMatrix(
  comparison: ComparisonData | null,
  _subjectKey: string,
): { peers: string[]; matrix: MatrixRow[]; peerMargins: Record<string, number[]> } {
  if (!comparison) return { peers: [], matrix: [], peerMargins: {} };

  const peers = [...comparison.companies];
  const peerMargins: Record<string, number[]> = {};

  const matrix: MatrixRow[] = comparison.metrics.map((row) => {
    const margin = isMarginRow(row);
    const cells: Record<string, Cell> = {};
    for (const peer of peers) {
      const raw = row.cells[peer];
      cells[peer] = raw ? mapCellTrust(raw) : { v: null, trust: "missing", note: "Not disclosed." };
      if (margin) {
        const c = cells[peer];
        const v = typeof c === "number" ? c : c && typeof c === "object" ? c.v : null;
        if (v != null) peerMargins[peer] = [v];
      }
    }
    return {
      kpi: margin ? "EBITDA margin" : row.label,
      unit: row.unit ?? "",
      fmt: inferFmt(row.unit),
      spark: margin ? "margin" : null,
      cells,
    };
  });

  return { peers, matrix, peerMargins };
}
```

- [ ] **Step 4: Run the test to confirm it passes.**

Run: `pnpm test -- adapter-matrix.test`
Expected: PASS (9 assertions).

- [ ] **Step 5: Make `Peers.tsx` subject-detection name-safe.** Real matrix columns are keyed by company *name*, not ticker. Open `app/components/briefing/chapters/Peers.tsx` and change the subject line:

Find:
```tsx
  const subject = data.company.ticker;
```
Replace with:
```tsx
  // Matrix columns are keyed by whatever the adapter used as column keys (peer names for real
  // data, tickers for the mock). The subject is always the first column.
  const subject = data.peers[0] ?? data.company.ticker;
```

- [ ] **Step 6: Typecheck + test.**

Run: `pnpm exec tsc --noEmit && pnpm test -- adapter-matrix.test`
Expected: clean typecheck, tests pass.

- [ ] **Step 7: Commit.**

```bash
git config user.email noreply@anthropic.com
git config user.name Claude
git add app/components/briefing/adapter-matrix.ts app/components/briefing/__tests__/adapter-matrix.test.ts app/components/briefing/chapters/Peers.tsx
git commit -m "feat(adapter): map comparison matrix + trust flags; subject by first column"
```

---

## Task 5: Map the research brief

**Files:**
- Create: `app/components/briefing/adapter-brief.ts`
- Test: `app/components/briefing/__tests__/adapter-brief.test.ts`

`DashboardData.brief` is `BriefView | null` with `claims: BriefClaimView[]`, each `{ text, section, citedText, sourceHref, metric }`. We group claims by `section` into the briefing's `answer` / `drivers` / `guidance` / `risks`. `headline` is the first answer claim (fallback: `ask`, then `""`). Risk tone defaults to `"cautious"` (these are risks-to-watch; the backend does not emit a tone). The `industry_kpi` section is dropped.

- [ ] **Step 1: Write the failing test** `__tests__/adapter-brief.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { mapBrief } from "../adapter-brief";
import type { BriefView } from "../../../src/dashboard/data.js";

const okBadge = { label: "VERIFIED", tone: "good", color: "#0f0" } as const;

const briefView: BriefView = {
  ask: "How have margins trended?",
  industryKpis: [],
  claims: [
    { text: "Margin climbed to 36%.", section: "answer", citedText: null, sourceHref: null, metric: null },
    { text: "ARR up 11% YoY.", section: "drivers", citedText: null, sourceHref: null,
      metric: { name: "arr", value: 13420, unit: "₹", period: null, badge: okBadge } },
    { text: "33-35% band guided.", section: "guidance", citedText: null, sourceHref: null, metric: null },
    { text: "Monsoon seasonality.", section: "risks", citedText: null, sourceHref: null, metric: null },
    { text: "occupancy", section: "industry_kpi", citedText: null, sourceHref: null, metric: null },
  ],
};

describe("mapBrief", () => {
  it("uses the first answer claim as the headline", () => {
    expect(mapBrief(briefView).headline).toBe("Margin climbed to 36%.");
  });
  it("groups claims into answer/drivers/guidance/risks and drops industry_kpi", () => {
    const b = mapBrief(briefView);
    expect(b.answer).toEqual(["Margin climbed to 36%."]);
    expect(b.guidance).toEqual([{ text: "33-35% band guided.", metric: null }]);
    expect(b.risks).toEqual([{ text: "Monsoon seasonality.", tone: "cautious" }]);
  });
  it("formats a driver's metric label and leaves metric-less ones null", () => {
    expect(mapBrief(briefView).drivers).toEqual([{ text: "ARR up 11% YoY.", metric: "arr 13,420" }]);
  });
  it("falls back to the ask, then empty, when there is no answer claim", () => {
    expect(mapBrief({ ...briefView, claims: [] }).headline).toBe("How have margins trended?");
    expect(mapBrief(null).headline).toBe("");
  });
  it("returns empty arrays for a null brief", () => {
    const b = mapBrief(null);
    expect(b.answer).toEqual([]);
    expect(b.risks).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails.**

Run: `pnpm test -- adapter-brief.test`
Expected: FAIL — `Cannot find module '../adapter-brief'`.

- [ ] **Step 3: Write `adapter-brief.ts`:**

```ts
import type { BriefView, BriefClaimView } from "../../../src/dashboard/data.js";
import type { BriefingData } from "./types";
import { humanizeKey } from "./adapter-util";

type BriefingBrief = BriefingData["brief"];

/** "arr"/13420 -> "arr 13,420"; null metric -> null. */
function metricLabel(metric: BriefClaimView["metric"]): string | null {
  if (!metric) return null;
  return `${humanizeKey(metric.name)} ${metric.value.toLocaleString("en-IN")}`.trim();
}

/** Map the stored research brief into the briefing's answer-first sections. */
export function mapBrief(brief: BriefView | null): BriefingBrief {
  if (!brief) {
    return { headline: "", answer: [], drivers: [], guidance: [], risks: [] };
  }
  const bySection = (s: BriefClaimView["section"]) => brief.claims.filter((c) => c.section === s);

  const answer = bySection("answer").map((c) => c.text);
  const headline = answer[0] ?? brief.ask ?? "";

  return {
    headline,
    answer,
    drivers: bySection("drivers").map((c) => ({ text: c.text, metric: metricLabel(c.metric) })),
    guidance: bySection("guidance").map((c) => ({ text: c.text, metric: metricLabel(c.metric) })),
    risks: bySection("risks").map((c) => ({ text: c.text, tone: "cautious" as const })),
  };
}
```

- [ ] **Step 4: Run the test to confirm it passes.**

Run: `pnpm test -- adapter-brief.test`
Expected: PASS (5 assertions).

- [ ] **Step 5: Commit.**

```bash
git config user.email noreply@anthropic.com
git config user.name Claude
git add app/components/briefing/adapter-brief.ts app/components/briefing/__tests__/adapter-brief.test.ts
git commit -m "feat(adapter): map research brief into answer-first sections"
```

---

## Task 6: Map management commentary

**Files:**
- Create: `app/components/briefing/adapter-commentary.ts`
- Test: `app/components/briefing/__tests__/adapter-commentary.test.ts`

`CommentaryTrend` is `{ period, summary, tone, keyTopics, contradictionNote }`. `CommentaryTone` is the identical union to the briefing `Tone` (`cautious | neutral | optimistic | confident`), so this is a near-1:1 rename: `keyTopics`→`topics`, `contradictionNote`→`flag`.

- [ ] **Step 1: Write the failing test** `__tests__/adapter-commentary.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { mapCommentary } from "../adapter-commentary";
import type { CommentaryTrend } from "../../../src/db/commentary-trends.js";

const trends: CommentaryTrend[] = [
  { period: "Q3 FY25", summary: "Record quarter.", tone: "confident", keyTopics: ["record", "pipeline"], contradictionNote: null },
  { period: "Q4 FY25", summary: "Softer read.", tone: "cautious", keyTopics: ["supply"], contradictionNote: "Contradicts Q3." },
];

describe("mapCommentary", () => {
  it("renames keyTopics->topics and contradictionNote->flag", () => {
    expect(mapCommentary(trends)).toEqual([
      { period: "Q3 FY25", tone: "confident", summary: "Record quarter.", topics: ["record", "pipeline"], flag: null },
      { period: "Q4 FY25", tone: "cautious", summary: "Softer read.", topics: ["supply"], flag: "Contradicts Q3." },
    ]);
  });
  it("returns an empty array for no commentary", () => {
    expect(mapCommentary([])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails.**

Run: `pnpm test -- adapter-commentary.test`
Expected: FAIL — `Cannot find module '../adapter-commentary'`.

- [ ] **Step 3: Write `adapter-commentary.ts`:**

```ts
import type { CommentaryTrend } from "../../../src/db/commentary-trends.js";
import type { BriefingData } from "./types";

type Commentary = BriefingData["commentary"][number];

/** CommentaryTrend -> briefing commentary. Tone unions are identical, so this is a field rename. */
export function mapCommentary(trends: CommentaryTrend[]): Commentary[] {
  return trends.map((t) => ({
    period: t.period,
    tone: t.tone,
    summary: t.summary,
    topics: t.keyTopics,
    flag: t.contradictionNote,
  }));
}
```

- [ ] **Step 4: Run the test to confirm it passes.**

Run: `pnpm test -- adapter-commentary.test`
Expected: PASS (2 assertions).

- [ ] **Step 5: Commit.**

```bash
git config user.email noreply@anthropic.com
git config user.name Claude
git add app/components/briefing/adapter-commentary.ts app/components/briefing/__tests__/adapter-commentary.test.ts
git commit -m "feat(adapter): map management commentary trends"
```

---

## Task 7: Map source documents

**Files:**
- Create: `app/components/briefing/adapter-sources.ts`
- Test: `app/components/briefing/__tests__/adapter-sources.test.ts`

`Filing` is `{ id, company_id, type, period, source_url, local_path, notebooklm_source_id }`. Map `FilingType` → `SourceType` (`presentation`→`DECK`, `result`→`RESULT`, `annual_report`→`AR`), build a human label from type + period, default `page` to `1` (filings carry no page), and cap at 8 cards.

- [ ] **Step 1: Write the failing test** `__tests__/adapter-sources.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { mapSources } from "../adapter-sources";
import type { Filing } from "../../../src/types.js";

const f = (id: number, type: Filing["type"], period: string | null): Filing => ({
  id, company_id: 1, type, period, source_url: null, local_path: null, notebooklm_source_id: null,
});

describe("mapSources", () => {
  it("maps filing types to briefing source types with labels", () => {
    expect(mapSources([f(1, "presentation", "Mar 2025"), f(2, "annual_report", null)])).toEqual([
      { type: "DECK", label: "Investor presentation Mar 2025", page: 1 },
      { type: "AR", label: "Annual report", page: 1 },
    ]);
  });
  it("maps result filings to RESULT", () => {
    expect(mapSources([f(3, "result", "Mar 2025")])[0].type).toBe("RESULT");
  });
  it("caps the list at eight cards", () => {
    const many = Array.from({ length: 12 }, (_, i) => f(i, "result", "Mar 2025"));
    expect(mapSources(many)).toHaveLength(8);
  });
  it("returns an empty array for no filings", () => {
    expect(mapSources([])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails.**

Run: `pnpm test -- adapter-sources.test`
Expected: FAIL — `Cannot find module '../adapter-sources'`.

- [ ] **Step 3: Write `adapter-sources.ts`:**

```ts
import type { Filing } from "../../../src/types.js";
import type { BriefingData, SourceType } from "./types";

type Source = BriefingData["sources"][number];

const TYPE_MAP: Record<Filing["type"], { src: SourceType; noun: string }> = {
  presentation: { src: "DECK", noun: "Investor presentation" },
  result: { src: "RESULT", noun: "Result" },
  annual_report: { src: "AR", noun: "Annual report" },
};

/** Filings -> briefing source cards. page defaults to 1 (filings carry no page anchor). */
export function mapSources(filings: Filing[]): Source[] {
  return filings.slice(0, 8).map((f) => {
    const m = TYPE_MAP[f.type];
    const label = f.period ? `${m.noun} ${f.period}` : m.noun;
    return { type: m.src, label, page: 1 };
  });
}
```

- [ ] **Step 4: Run the test to confirm it passes.**

Run: `pnpm test -- adapter-sources.test`
Expected: PASS (4 assertions).

- [ ] **Step 5: Commit.**

```bash
git config user.email noreply@anthropic.com
git config user.name Claude
git add app/components/briefing/adapter-sources.ts app/components/briefing/__tests__/adapter-sources.test.ts
git commit -m "feat(adapter): map source filings into provenance cards"
```

---

## Task 8: Map company identity + about/bottomLine stubs

**Files:**
- Create: `app/components/briefing/adapter-company.ts`
- Test: `app/components/briefing/__tests__/adapter-company.test.ts`

`Company` is `{ id, name, ticker, industry }`. There is no `sector` (reuse `industry`), no `about`, and no `bottomLine` in the backend. `mapCompany` fills identity + `asOf` (from the latest filing period). `stubAbout` and `stubBottomLine` emit honest, fact-derived placeholders marked with `// TODO(backend-synthesis):` so they read as deliberate, not broken.

- [ ] **Step 1: Write the failing test** `__tests__/adapter-company.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { mapCompany, stubAbout, stubBottomLine } from "../adapter-company";
import type { Company, Filing, IntegritySummary } from "../../../src/types.js";

const company: Company = { id: 1, name: "Indian Hotels Co.", ticker: "INDHOTEL", industry: "Hotels" };
const filings: Filing[] = [
  { id: 1, company_id: 1, type: "result", period: "Dec 2024", source_url: null, local_path: null, notebooklm_source_id: null },
  { id: 2, company_id: 1, type: "result", period: "Mar 2025", source_url: null, local_path: null, notebooklm_source_id: null },
];

describe("mapCompany", () => {
  it("fills identity and uses the latest filing period as asOf", () => {
    expect(mapCompany(company, filings)).toEqual({
      name: "Indian Hotels Co.", ticker: "INDHOTEL", industry: "Hotels", sector: "Hotels", asOf: "Mar 2025",
    });
  });
  it("tolerates null ticker/industry and no filings", () => {
    expect(mapCompany({ id: 2, name: "X", ticker: null, industry: null }, [])).toEqual({
      name: "X", ticker: "", industry: "", sector: "", asOf: "",
    });
  });
});

describe("stubAbout", () => {
  it("derives a one-line placeholder from name + industry", () => {
    expect(stubAbout(company)).toContain("Indian Hotels Co.");
    expect(stubAbout(company)).toContain("Hotels");
  });
});

describe("stubBottomLine", () => {
  it("references verified/rejected counts and a contradiction when present", () => {
    const integrity: IntegritySummary = { verified: 47, notebooklmOnly: 3, pending: 2, rejected: 1 };
    const bl = stubBottomLine(integrity, true);
    expect(bl.worth).toContain("47");
    expect(bl.watch).toContain("contradiction");
  });
  it("omits the contradiction clause when there is none", () => {
    const integrity: IntegritySummary = { verified: 10, notebooklmOnly: 0, pending: 0, rejected: 0 };
    expect(stubBottomLine(integrity, false).watch).not.toContain("contradiction");
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails.**

Run: `pnpm test -- adapter-company.test`
Expected: FAIL — `Cannot find module '../adapter-company'`.

- [ ] **Step 3: Write `adapter-company.ts`:**

```ts
import type { Company, Filing, IntegritySummary } from "../../../src/types.js";
import type { BriefingData } from "./types";
import { periodToOrder } from "./adapter-util";

type CompanyBlock = BriefingData["company"];

/** Identity block. asOf = the chronologically latest filing period, or "" if none. */
export function mapCompany(company: Company, filings: Filing[]): CompanyBlock {
  const periods = filings.map((f) => f.period).filter((p): p is string => !!p);
  const asOf = periods.length
    ? periods.reduce((latest, p) => (periodToOrder(p) > periodToOrder(latest) ? p : latest))
    : "";
  const industry = company.industry ?? "";
  return {
    name: company.name,
    ticker: company.ticker ?? "",
    industry,
    sector: industry, // no distinct sector field in the backend
    asOf,
  };
}

// TODO(backend-synthesis): the planner/synthesis does not yet produce a company "about" blurb.
// This is an honest placeholder from the facts we have, not a hallucinated description.
export function stubAbout(company: Company): string {
  return company.industry
    ? `${company.name} — ${company.industry}. (Company overview pending analyst synthesis.)`
    : `${company.name}. (Company overview pending analyst synthesis.)`;
}

// TODO(backend-synthesis): no triage verdict is produced yet. Derive a defensible bottom line
// from pipeline integrity counts + whether a management contradiction was flagged.
export function stubBottomLine(
  integrity: IntegritySummary,
  hasContradiction: boolean,
): BriefingData["bottomLine"] {
  const worth = `Built from ${integrity.verified} source-verified figures. Review the briefing below for the answer-first read.`;
  const watchParts: string[] = [];
  if (hasContradiction) watchParts.push("a flagged management contradiction");
  if (integrity.rejected > 0) watchParts.push(`${integrity.rejected} quarantined figure${integrity.rejected > 1 ? "s" : ""}`);
  if (integrity.notebooklmOnly > 0) watchParts.push(`${integrity.notebooklmOnly} unverified (NLM-only) value${integrity.notebooklmOnly > 1 ? "s" : ""}`);
  const watch = watchParts.length
    ? `Worth a closer look: ${watchParts.join(", ")}.`
    : "No integrity flags raised in this run.";
  return { worth, watch };
}
```

- [ ] **Step 4: Run the test to confirm it passes.**

Run: `pnpm test -- adapter-company.test`
Expected: PASS (6 assertions).

- [ ] **Step 5: Commit.**

```bash
git config user.email noreply@anthropic.com
git config user.name Claude
git add app/components/briefing/adapter-company.ts app/components/briefing/__tests__/adapter-company.test.ts
git commit -m "feat(adapter): map company identity + honest about/bottomLine stubs"
```

---

## Task 9: Wire the orchestrator

**Files:**
- Modify: `app/components/briefing/adapter.ts`
- Test: `app/components/briefing/__tests__/adapter.test.ts`

Compose all eight helpers into `toBriefingData(data: DashboardData, comparison: ComparisonData | null)`. Seed `peerMargins[subject]` with the subject's full margin history from `quarters` (the matrix helper only seeded a single point). The integration test uses a small-but-complete synthetic payload and asserts the cross-cutting wiring (peer margin override, integrity rename, headline) — the per-helper detail is already covered by Tasks 1–8.

- [ ] **Step 1: Write the failing integration test** `__tests__/adapter.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { toBriefingData } from "../adapter";
import type { DashboardData } from "../../../src/dashboard/data.js";
import type { ComparisonData } from "../../../src/dashboard/comparison.js";

const okBadge = { label: "VERIFIED", tone: "good", color: "#0f0" } as const;

const data: DashboardData = {
  company: { id: 1, name: "Indian Hotels Co.", ticker: "INDHOTEL", industry: "Hotels" },
  integrity: { verified: 47, notebooklmOnly: 3, pending: 2, rejected: 1 },
  metrics: [],
  rejects: [],
  filings: [
    { id: 1, company_id: 1, type: "result", period: "Dec 2024", source_url: null, local_path: null, notebooklm_source_id: null },
    { id: 2, company_id: 1, type: "result", period: "Mar 2025", source_url: null, local_path: null, notebooklm_source_id: null },
  ],
  brief: {
    ask: "How have margins trended?",
    industryKpis: [],
    claims: [{ text: "Margin rose to 36%.", section: "answer", citedText: null, sourceHref: null, metric: null }],
  },
  trends: [
    { name: "revenue", unit: "₹cr", points: [{ period: "Dec 2024", value: 2533 }, { period: "Mar 2025", value: 2425 }] },
    { name: "opm_pct", unit: "%", points: [{ period: "Dec 2024", value: 39.5 }, { period: "Mar 2025", value: 36.0 }] },
  ],
  industryKpis: [],
  commentaryTrends: [
    { period: "Q4 FY25", summary: "Softer.", tone: "cautious", keyTopics: ["supply"], contradictionNote: "Contradicts Q3." },
  ],
};

const comparison: ComparisonData = {
  companies: ["Indian Hotels Co.", "EIH"],
  coverage: [],
  metrics: [
    { name: "opm_pct", label: "Operating margin", unit: "%", cells: {
      "Indian Hotels Co.": { state: "value", value: 36.0, unit: "%", period: null, trust: "verified", badge: okBadge, citationHref: null },
      "EIH": { state: "value", value: 38.4, unit: "%", period: null, trust: "verified", badge: okBadge, citationHref: null },
    } },
  ],
};

describe("toBriefingData", () => {
  it("assembles a complete BriefingData from real payloads", () => {
    const b = toBriefingData(data, comparison);
    expect(b.company.ticker).toBe("INDHOTEL");
    expect(b.company.asOf).toBe("Mar 2025");
    expect(b.ask).toBe("How have margins trended?");
    expect(b.brief.headline).toBe("Margin rose to 36%.");
    expect(b.quarters).toHaveLength(2);
    expect(b.stats[0].key).toBe("EBITDA margin");
    expect(b.peers).toEqual(["Indian Hotels Co.", "EIH"]);
    expect(b.integrity).toEqual({ verified: 47, nlmOnly: 3, pending: 2, rejected: 1 });
    expect(b.commentary[0].flag).toBe("Contradicts Q3.");
  });
  it("overrides the subject's peerMargins with its full quarter history", () => {
    const b = toBriefingData(data, comparison);
    expect(b.peerMargins["Indian Hotels Co."]).toEqual([39.5, 36.0]); // full series, not single point
    expect(b.peerMargins["EIH"]).toEqual([38.4]); // peer stays single-point
  });
  it("handles a null comparison (no peers, empty matrix)", () => {
    const b = toBriefingData(data, null);
    expect(b.peers).toEqual([]);
    expect(b.matrix).toEqual([]);
    expect(b.quarters).toHaveLength(2); // quarters still derive from trends
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails.**

Run: `pnpm test -- __tests__/adapter.test`
Expected: FAIL — current stub returns `MOCK_BRIEFING`, so `company.ticker`/`asOf`/`peerMargins` assertions fail.

- [ ] **Step 3: Replace `adapter.ts`:**

```ts
import type { DashboardData } from "../../../src/dashboard/data.js";
import type { ComparisonData } from "../../../src/dashboard/comparison.js";
import type { BriefingData } from "./types";
import { deriveQuarters } from "./adapter-quarters";
import { deriveStats } from "./adapter-stats";
import { mapMatrix } from "./adapter-matrix";
import { mapBrief } from "./adapter-brief";
import { mapCommentary } from "./adapter-commentary";
import { mapSources } from "./adapter-sources";
import { mapCompany, stubAbout, stubBottomLine } from "./adapter-company";

/**
 * Map the live dashboard + peer comparison payloads into the briefing view model.
 * Pure transform — no React, no DB, no I/O. Every sub-mapping is unit-tested in
 * app/components/briefing/__tests__/adapter-*.test.ts.
 *
 * Known partial fidelity (see the plan's "partial-fidelity decisions"):
 *   - about / bottomLine are honest stubs (backend does not synthesize them yet)
 *   - peer sparkline history is single-point (comparison carries only the latest margin);
 *     the subject company gets its full series from trends
 *   - source page anchors default to 1
 */
export function toBriefingData(data: DashboardData, comparison: ComparisonData | null): BriefingData {
  const subjectKey = comparison?.companies[0] ?? data.company.name;

  const quarters = deriveQuarters(data.trends);
  const stats = deriveStats(quarters);
  const { peers, matrix, peerMargins } = mapMatrix(comparison, subjectKey);

  // The matrix helper seeds peerMargins with a single latest point per peer. Replace the
  // subject's entry with its full quarter-by-quarter margin history for a real sparkline.
  if (quarters.length > 0) {
    peerMargins[subjectKey] = quarters.map((q) => q.margin);
  }

  const commentary = mapCommentary(data.commentaryTrends);
  const hasContradiction = commentary.some((c) => c.flag != null);

  return {
    company: mapCompany(data.company, data.filings),
    ask: data.brief?.ask ?? "",
    about: stubAbout(data.company),
    bottomLine: stubBottomLine(data.integrity, hasContradiction),
    brief: mapBrief(data.brief),
    quarters,
    stats,
    peers,
    matrix,
    peerMargins,
    commentary,
    sources: mapSources(data.filings),
    integrity: {
      verified: data.integrity.verified,
      nlmOnly: data.integrity.notebooklmOnly,
      pending: data.integrity.pending,
      rejected: data.integrity.rejected,
    },
  };
}
```

> Note: `mock.ts` and `MOCK_BRIEFING` stay in the repo — the briefing tests and any future Storybook/QA use them. The adapter simply no longer imports them.

- [ ] **Step 4: Run the integration test to confirm it passes.**

Run: `pnpm test -- __tests__/adapter.test`
Expected: PASS (3 assertions across the suite).

- [ ] **Step 5: Typecheck.**

Run: `pnpm exec tsc --noEmit`
Expected: clean. (If `page.tsx` previously relied on the `unknown` signature it now type-checks against `DashboardData`/`ComparisonData | null` — confirm no error there.)

- [ ] **Step 6: Commit.**

```bash
git config user.email noreply@anthropic.com
git config user.name Claude
git add app/components/briefing/adapter.ts app/components/briefing/__tests__/adapter.test.ts
git commit -m "feat(adapter): wire real DashboardData/ComparisonData -> BriefingData"
```

---

## Task 10: Full gate, page sanity, docs

**Files:**
- Verify: `app/page.tsx` (no code change expected — confirm it compiles against the typed adapter)
- Modify: `CLAUDE.md`

- [ ] **Step 1: Confirm `page.tsx` needs no change.** Read `app/page.tsx` and verify it calls `toBriefingData(data, comparison)` where `data: DashboardData` and `comparison: ComparisonData | null`. The typed adapter accepts exactly that. If `page.tsx` instead calls `toBriefingData()` with no args (the old QA path), that path was removed in the briefing plan's Task 10 — confirm it's gone. No edit unless tsc reports an error.

- [ ] **Step 2: Full gate.**

Run: `pnpm test && pnpm exec tsc --noEmit && pnpm build`
Expected: all green — the 8 new adapter test files plus the existing suite; typecheck clean; production build passes. Fix any regression before continuing.

- [ ] **Step 3: Manual smoke against a real study (optional but recommended).** If a hotel study already exists in `data/stonks.db`, run the app and confirm the briefing shows real numbers:

```bash
lsof -ti tcp:4317 | xargs kill 2>/dev/null; pnpm dev
```
Open `http://localhost:4317`, run/load a study, and confirm the Overview headline, Margins line chart, Financials bars, Peers matrix, Management tone path, and Provenance cards reflect the DB — not the Indian Hotels mock. (If no study exists, skip; the integration test already proves the mapping.)

- [ ] **Step 4: Update `CLAUDE.md`.** Find the briefing build-phase bullet added by the previous plan ("Scrollytelling Company Briefing dashboard: DONE ... real-data adapter ... wire-up deferred") and update it to:

> - **Briefing real-data adapter: DONE (2026-06-09).** `app/components/briefing/adapter.ts` now maps live `getDashboard()` + `getComparisonData()` output into `BriefingData` via eight unit-tested pure helpers (`adapter-{util,quarters,stats,matrix,brief,commentary,sources,company}.ts`). Known stubs pending backend synthesis: company `about`, `bottomLine` triage verdict, per-peer sparkline history (single-point), source page anchors (default 1).

- [ ] **Step 5: Commit + push.**

```bash
git config user.email noreply@anthropic.com
git config user.name Claude
git add CLAUDE.md
git commit -m "docs: mark briefing real-data adapter wired"
git push
```

---

## Verification Summary

- **Unit tests (vitest):** one focused suite per helper — `adapter-util`, `adapter-quarters`, `adapter-stats`, `adapter-matrix`, `adapter-brief`, `adapter-commentary`, `adapter-sources`, `adapter-company` — plus the `adapter.test.ts` integration test for cross-cutting wiring. Run `pnpm test`.
- **Type + build gates:** `pnpm exec tsc --noEmit` and `pnpm build` after Tasks 9 and 10.
- **Behavioral acceptance:** the briefing renders live study data (Overview/Margins/Financials/Peers/Management/Provenance all sourced from `DashboardData`/`ComparisonData`), with trust flags preserved end-to-end (NLM-only → ◌, rejected → ✕, missing → ·).

## Out of Scope (explicit — follow-up work)

- **Backend synthesis of `about` and `bottomLine`** (a real triage verdict). Tracked in the handoff's "New work identified." Needs its own brainstorm→spec; until then the honest stubs ship.
- **Full per-peer sparkline history.** Requires per-peer trend fetches (`getDashboard` per peer or a new query); the comparison payload only carries the latest margin. Subject company already gets full history.
- **Real source page anchors** in `sources[]` (filings carry no page today).
- **NotebookLM metric-key normalization** (e.g. `revpar_revenue_per_available_room` → `revpar`) — carry-forward from the prior handoff; affects which matrix rows appear but is upstream of this adapter.
