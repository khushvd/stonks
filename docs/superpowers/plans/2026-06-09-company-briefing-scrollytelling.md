# Stonks Company Briefing — Scrollytelling Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current stacked-panel dashboard with the high-fidelity 7-chapter scrollytelling "Company Briefing" from `Stonks_extracted/design_handoff_company_briefing`, ported faithfully into the real Next.js + TypeScript app and driven (for now) by typed mock data.

**Architecture:** Port the prototype's standalone browser JSX (React-via-Babel, `window` globals, static `STONKS`) into idiomatic Next App Router TSX modules under `app/components/briefing/`. Charts are hand-rolled SVG (ported verbatim from `charts.jsx`). The warm-gold IBM Plex theme replaces the app-wide tokens in `globals.css`. Data flows through a single seam — `toBriefingData()` — which returns mock now and will be wired to the real `getDashboard()` output in a later plan.

**Tech Stack:** Next.js 15 (App Router), React 18, TypeScript (ESM), plain CSS custom properties + inline styles (no Tailwind), hand-rolled SVG charts (no new chart deps), Vitest for unit tests.

---

## Context

The design handoff in `Stonks_extracted/design_handoff_company_briefing/` is a **hifi, final** redesign of how a completed analysis is presented: an "answer-first" equity-research briefing read top-to-bottom as 7 chapters (Overview → Margins → Financials → Peers → Management → Risks → Provenance) with a fixed chapter rail, scroll progress bar, scroll-spy, keyboard nav, per-chapter detail drawers, and a strict **"trust = flag problems only"** rule (verified data is silent; only NLM-only / rejected / missing / contradiction get color).

It supersedes the current `app/components/Dashboard.tsx` stacked panels (BriefPanel, ComparisonPanel, TrendsPanel, CommentaryPanel, IntegrityTile, MetricsTable, MarginChart, ReviewerPanel, RejectsPanel).

**Decisions locked with the requester (2026-06-09):**
1. **Replace** the dashboard — the briefing becomes THE post-run view.
2. **Mock now, wire later** — build the full UI against a typed port of the prototype's `STONKS` object; defer real-data wiring (a `getDashboard → BriefingData` adapter) to a follow-up plan. Leave a clean single-function seam.
3. **Hand-rolled SVG charts** — port `charts.jsx` verbatim (interactive crosshair / peak label / hover chips; no Observable Plot for the briefing).
4. **Warm-gold theme app-wide** — replace `globals.css` tokens with the design palette and load IBM Plex Sans + Mono; the control/plan UI inherits the new theme too.

**Canonical source of truth** (in-repo, read these while porting — do NOT re-derive from memory):
- `Stonks_extracted/design_handoff_company_briefing/Stonks Briefing.html` — the `<style>` block is authoritative for all shell/global CSS.
- `charts.jsx`, `ui.jsx`, `data.js`, `briefing.jsx` — read fully below; ports are spelled out.
- `briefing-sections.jsx` (chapters 01–03 + shared `Chapter` frame) and `briefing-sections2.jsx` (chapters 04–07) — **read these two files during Tasks 6–7**; they are not inlined here. Port each component with the transformation recipe in those tasks.
- `screenshots/01-overview.png` … `07-provenance.png` — the visual acceptance reference (collapsed state).
- `README.md` — the full design spec (tokens, interactions, per-chapter content).

---

## File Structure

**Create** (all under `app/components/briefing/`):
- `types.ts` — `BriefingData` + nested types (the typed schema mirroring `STONKS`).
- `mock.ts` — `MOCK_BRIEFING: BriefingData` (typed port of `data.js`).
- `format.ts` — `fmtNum`, `cellInfo` (ported from `ui.jsx`), pure & unit-tested.
- `atoms.tsx` — `Flag`, `Delta`, `ToneBadge`, `Eyebrow`, `SourcePill` + `TRUST_META`/`TONE_META`/`SRC_COLOR`.
- `charts.tsx` — `useElementWidth`, `niceBounds`, `LineChart`, `MiniBars`, `Sparkline` (ported from `charts.jsx`).
- `Chapter.tsx` — shared chapter frame (eyebrow/title/dek, watermark, expand button + detail drawer, double-click toggle).
- `chapters/Overview.tsx`, `Margins.tsx`, `Financials.tsx`, `Peers.tsx`, `Management.tsx`, `Risks.tsx`, `Provenance.tsx`.
- `BriefingApp.tsx` — the shell (rail, progress bar, scroll-spy, keyboard nav, entrance animation) + an `onExit` affordance.
- `adapter.ts` — `toBriefingData(data, comparison): BriefingData` — the real-data seam (returns `MOCK_BRIEFING` for now).
- Tests: `format.test.ts`, `charts.test.ts`, `peers-sort.test.ts` under `app/components/briefing/__tests__/` (or co-located per repo convention — check existing test locations first).

**Modify:**
- `app/globals.css` — replace `:root` tokens + add the full briefing shell CSS (ported from the HTML `<style>`).
- `app/layout.tsx` — add IBM Plex Sans + Mono font `<link>`s.
- `app/page.tsx` — render `BriefingApp` full-screen when `data` is present; keep the two-pane control layout for plan/run/empty; wire `onExit` to return to controls.
- `app/components/Dashboard.tsx` — retire (or reduce to the empty-state message only); the briefing replaces its body.

**Delete (in the finishing task, after parity confirmed):** the now-unused panel components if nothing else imports them — verify with grep before deleting.

**Conventions to follow (verified in current code):**
- Sibling imports are **extensionless** (e.g. `import { LineChart } from "./charts"`) — Next resolves `.tsx`. Match existing `Dashboard.tsx` import style.
- Components needing hooks/browser APIs must start with `"use client"`.
- Styling is **inline `React.CSSProperties`** + global classNames from `globals.css`. Keep the prototype's classNames (`chapter`, `card`, `rail`, `tile-grid`, `data-table`, etc.) verbatim so the ported shell CSS applies.

---

## Task 1: Apply the warm-gold theme + IBM Plex fonts

**Files:**
- Modify: `app/globals.css`
- Modify: `app/layout.tsx`

- [ ] **Step 1: Load IBM Plex fonts.** In `app/layout.tsx`, add the font links inside `<head>` (add a `<head>` to the `<html>` if absent):

```tsx
<head>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
  <link
    href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600;700&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap"
    rel="stylesheet"
  />
</head>
```

- [ ] **Step 2: Replace the theme tokens + global base** in `app/globals.css`. Replace the existing `:root{…}` and base element rules with the prototype's tokens (from `Stonks Briefing.html` lines 11–35) verbatim:

```css
:root {
  --bg: #17140f;
  --panel: #201c15;
  --panel-2: #28231a;
  --border: #36301f;
  --text: #ece5d8;
  --text-2: #cbc2b1;
  --muted: #948b78;
  --faint: #6c6452;
  --accent: #e8b04b;
  --teal: #5cb9b1;
  --violet: #b09be0;
  --up: #7bb25e;
  --bad: #e0664f;
  --warn: #e0903a;
  --grid: rgba(255,255,255,0.055);
  --mono: 'IBM Plex Mono', ui-monospace, Menlo, monospace;
  --sans: 'IBM Plex Sans', system-ui, sans-serif;
  --rail-w: 208px;
  --maxw: 1080px;
}
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; height: 100%; }
body { font-family: var(--sans); background: var(--bg); color: var(--text); -webkit-font-smoothing: antialiased; }
button { font: inherit; cursor: pointer; }
a { color: var(--accent); }
::selection { background: color-mix(in srgb, var(--accent) 35%, transparent); }
```

- [ ] **Step 3: Append the full briefing shell CSS** to `app/globals.css` — copy lines 37–134 of `Stonks Briefing.html` verbatim (the `html` scroll/snap rules, `.progress-bar`, `.rail*`, `.chapters`, `.chapter`, `.watermark`, `.ch-head/.ch-index/.ch-title/.ch-dek`, `.expand-btn`, `.detail*`, the `.briefing.anim` entrance rules + `prefers-reduced-motion` blocks, `.scroll-hint` + `@keyframes bob`, `.tile-grid/.stat-*/.card/.data-table`, and the `@media (max-width:900px)` rail collapse).

> ⚠️ The `html { scroll-snap-type: y proximity; scroll-behavior: smooth }` rule makes the **document** scroll. This is intended for the briefing view. The two-pane control layout in `page.tsx` uses its own `height:100vh` + inner `overflow:auto`, so document snap is harmless there (no tall body). Do not remove it.

- [ ] **Step 4: Verify the build compiles with the new theme.**

Run: `pnpm build`
Expected: build succeeds (no CSS/JS errors). The control UI will now render in warm-gold tones.

- [ ] **Step 5: Commit.**

```bash
git add app/globals.css app/layout.tsx
git commit -m "feat(briefing): apply warm-gold IBM Plex theme app-wide"
```

---

## Task 2: Typed data model, mock data, and formatters

**Files:**
- Create: `app/components/briefing/types.ts`
- Create: `app/components/briefing/format.ts`
- Create: `app/components/briefing/mock.ts`
- Test: `app/components/briefing/__tests__/format.test.ts`

- [ ] **Step 1: Write `types.ts`** — the schema mirroring `STONKS` (`data.js`):

```ts
export type Trust = "ok" | "nlm" | "rejected" | "missing";
export type Tone = "cautious" | "neutral" | "optimistic" | "confident";
export type SourceType = "RESULT" | "DECK" | "AR" | "CONCALL";
export type Dir = "up" | "down" | "flat";
export type CellFmt = "pct" | "int";

/** A matrix cell: a bare number (verified/silent) OR a flagged object. null = no value. */
export type Cell =
  | number
  | null
  | { v: number | null; trust: Exclude<Trust, "ok">; note: string };

export interface MatrixRow {
  kpi: string;
  unit: string;
  fmt: CellFmt;
  spark: string | null; // peerMargins key, or null
  cells: Record<string, Cell>;
}

export interface BriefingData {
  company: { name: string; ticker: string; industry: string; sector: string; asOf: string };
  ask: string;
  about: string;
  bottomLine: { worth: string; watch: string };
  brief: {
    headline: string;
    answer: string[];
    drivers: { text: string; metric: string | null }[];
    guidance: { text: string; metric: string | null }[];
    risks: { text: string; tone: Tone }[];
  };
  quarters: { period: string; label: string; margin: number; rev: number; ebitda: number; pat: number }[];
  stats: { key: string; value: string; delta: string; dir: Dir; sub: string }[];
  peers: string[];
  matrix: MatrixRow[];
  peerMargins: Record<string, number[]>;
  commentary: { period: string; tone: Tone; summary: string; topics: string[]; flag: string | null }[];
  sources: { type: SourceType; label: string; page: number }[];
  integrity: { verified: number; nlmOnly: number; pending: number; rejected: number };
}
```

- [ ] **Step 2: Write the failing formatter test** `__tests__/format.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { fmtNum, cellInfo } from "../format";

describe("fmtNum", () => {
  it("renders null as em dash", () => { expect(fmtNum(null, "int")).toBe("—"); });
  it("formats pct to one decimal", () => { expect(fmtNum(36, "pct")).toBe("36.0"); });
  it("formats integers with en-IN grouping", () => { expect(fmtNum(13420, "int")).toBe("13,420"); });
});

describe("cellInfo", () => {
  it("treats a bare number as trust ok", () => {
    expect(cellInfo(35.2)).toEqual({ v: 35.2, trust: "ok", note: null });
  });
  it("passes through a flagged object", () => {
    expect(cellInfo({ v: 33.5, trust: "rejected", note: "x" })).toEqual({ v: 33.5, trust: "rejected", note: "x" });
  });
  it("treats null as trust ok with null value", () => {
    expect(cellInfo(null)).toEqual({ v: null, trust: "ok", note: null });
  });
});
```

- [ ] **Step 3: Run the test to confirm it fails.**

Run: `pnpm test -- format.test`
Expected: FAIL — `Cannot find module '../format'`.

- [ ] **Step 4: Write `format.ts`** (ported from `ui.jsx` lines 5–15, typed):

```ts
import type { Cell, CellFmt, Trust } from "./types";

export function fmtNum(v: number | null, fmt: CellFmt): string {
  if (v == null) return "—";
  if (fmt === "pct") return v.toFixed(1);
  return v.toLocaleString("en-IN");
}

export function cellInfo(raw: Cell): { v: number | null; trust: Trust; note: string | null } {
  if (raw && typeof raw === "object") return { v: raw.v, trust: raw.trust, note: raw.note };
  return { v: raw as number | null, trust: "ok", note: null };
}
```

- [ ] **Step 5: Run the test to confirm it passes.**

Run: `pnpm test -- format.test`
Expected: PASS (6 assertions).

- [ ] **Step 6: Write `mock.ts`** — a typed port of the `STONKS` object from `data.js` (lines 6–146). Copy every field verbatim, annotate `const MOCK_BRIEFING: BriefingData = { … }`, and `export { MOCK_BRIEFING }`. Ensure `risks` tones and `commentary` tones are valid `Tone` values and matrix flagged cells match the `Cell` shape. Confirm `pnpm exec tsc --noEmit` reports no type errors against `BriefingData`.

- [ ] **Step 7: Commit.**

```bash
git add app/components/briefing/types.ts app/components/briefing/format.ts app/components/briefing/mock.ts app/components/briefing/__tests__/format.test.ts
git commit -m "feat(briefing): typed BriefingData model, mock data, and formatters"
```

---

## Task 3: Shared atoms (Flag / Delta / ToneBadge / Eyebrow / SourcePill)

**Files:**
- Create: `app/components/briefing/atoms.tsx`

- [ ] **Step 1: Write `atoms.tsx`** — port `ui.jsx` lines 17–86 to typed TSX. Drop the `window` assignment; use named exports. Keep all inline styles verbatim:

```tsx
import type { ReactNode } from "react";
import type { Tone, SourceType } from "./types";

export const TRUST_META = {
  nlm: { label: "NLM-ONLY", color: "var(--warn)", glyph: "◌" },
  rejected: { label: "REJECTED", color: "var(--bad)", glyph: "✕" },
  missing: { label: "MISSING", color: "var(--muted)", glyph: "·" },
} as const;

export function Flag({ trust }: { trust: string }) {
  const m = (TRUST_META as Record<string, { label: string; color: string }>)[trust];
  if (!m) return null; // ok / verified is silent
  return (
    <span style={{
      fontFamily: "var(--mono)", fontSize: 9, fontWeight: 600, letterSpacing: ".04em",
      color: m.color, border: `1px solid ${m.color}`, borderRadius: 3, padding: "0 4px",
      verticalAlign: "middle", whiteSpace: "nowrap", opacity: 0.92,
    }}>{m.label}</span>
  );
}

export const TONE_META: Record<Tone, { color: string; arrow: string; label: string }> = {
  cautious: { color: "var(--warn)", arrow: "▼", label: "cautious" },
  neutral: { color: "var(--muted)", arrow: "▶", label: "neutral" },
  optimistic: { color: "var(--teal)", arrow: "▲", label: "optimistic" },
  confident: { color: "var(--up)", arrow: "▲", label: "confident" },
};

export function ToneBadge({ tone }: { tone: Tone }) {
  const m = TONE_META[tone] || TONE_META.neutral;
  return (
    <span style={{
      fontFamily: "var(--mono)", fontSize: 10, color: m.color,
      border: `1px solid color-mix(in srgb, ${m.color} 45%, transparent)`,
      borderRadius: 3, padding: "1px 6px", whiteSpace: "nowrap",
    }}>{m.arrow} {m.label}</span>
  );
}

export const SRC_COLOR: Record<SourceType, string> = {
  RESULT: "var(--teal)", DECK: "var(--accent)", AR: "var(--up)", CONCALL: "var(--violet)",
};

export function SourcePill({ type, label, page }: { type: SourceType; label: string; page?: number | null }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: "var(--mono)", fontSize: 10.5, color: "var(--muted)" }}>
      <span style={{ width: 6, height: 6, borderRadius: 1, background: SRC_COLOR[type] || "var(--muted)" }} />
      <span style={{ color: "var(--text-2)" }}>{label}</span>
      {page != null && <span style={{ opacity: 0.65 }}>p{page}</span>}
    </span>
  );
}

export function Delta({ dir, children }: { dir: "up" | "down" | "flat"; children: ReactNode }) {
  const color = dir === "up" ? "var(--up)" : dir === "down" ? "var(--bad)" : "var(--muted)";
  const arrow = dir === "up" ? "▲" : dir === "down" ? "▼" : "";
  return <span style={{ color, fontFamily: "var(--mono)", fontSize: 12, fontWeight: 600 }}>{arrow} {children}</span>;
}

export function Eyebrow({ children, accent }: { children: ReactNode; accent?: boolean }) {
  return (
    <div style={{
      fontFamily: "var(--mono)", fontSize: 10.5, letterSpacing: ".14em", textTransform: "uppercase",
      color: accent ? "var(--accent)" : "var(--muted)", display: "flex", alignItems: "center", gap: 8,
    }}>{children}</div>
  );
}
```

- [ ] **Step 2: Typecheck.**

Run: `pnpm exec tsc --noEmit`
Expected: PASS (no errors).

- [ ] **Step 3: Commit.**

```bash
git add app/components/briefing/atoms.tsx
git commit -m "feat(briefing): shared atoms — Flag, Delta, ToneBadge, Eyebrow, SourcePill"
```

---

## Task 4: SVG charts (LineChart / MiniBars / Sparkline)

**Files:**
- Create: `app/components/briefing/charts.tsx`
- Test: `app/components/briefing/__tests__/charts.test.ts`

- [ ] **Step 1: Write the failing test** for the one pure helper worth extracting, `niceBounds`, in `__tests__/charts.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { niceBounds } from "../charts";

describe("niceBounds", () => {
  it("pads a range symmetrically by the default fraction", () => {
    const [lo, hi] = niceBounds(0, 100);
    expect(lo).toBeCloseTo(-12);
    expect(hi).toBeCloseTo(112);
  });
  it("handles a zero-span range without dividing by zero", () => {
    const [lo, hi] = niceBounds(5, 5);
    expect(lo).toBeLessThan(5);
    expect(hi).toBeGreaterThan(5);
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails.**

Run: `pnpm test -- charts.test`
Expected: FAIL — `Cannot find module '../charts'`.

- [ ] **Step 3: Write `charts.tsx`.** Port `charts.jsx` verbatim to TSX with these mechanical changes: add `"use client";` at the top; replace the `const { useRef, … } = React;` destructure with `import { useRef, useState, useEffect, useLayoutEffect, useCallback } from "react";` (drop unused `useEffect` if tsc flags it); **`export`** `useElementWidth`, `niceBounds`, `LineChart`, `MiniBars`, `Sparkline`; delete the trailing `Object.assign(window, …)`; add prop types. The function bodies (SVG markup, math, hover state) are copied **unchanged** from `charts.jsx` lines 7–202. Prop type signatures:

```ts
// useElementWidth(fallback?: number): [React.RefObject<HTMLDivElement>, number]
// niceBounds(min: number, max: number, padFrac?: number): [number, number]

interface SeriesPoint { x?: number | string; label: string; y: number; }
interface LineSeries { key: string; label: string; color: string; points: SeriesPoint[]; }
interface LineChartProps {
  series: LineSeries[]; height?: number; yUnit?: string;
  yFmt?: (v: number) => string | number; highlightPeak?: boolean; area?: boolean;
}
interface MiniBarsProps {
  data: { label: string; y: number }[]; height?: number; color?: string;
  yFmt?: (v: number) => string | number; unit?: string;
}
interface SparklineProps { values: number[]; color?: string; width?: number; height?: number; strokeWidth?: number; }
```

Keep `useElementWidth`'s `ref` typed as `useRef<HTMLDivElement>(null)` and cast where the prototype reads `ref.current.clientWidth`.

- [ ] **Step 4: Run the test to confirm it passes.**

Run: `pnpm test -- charts.test`
Expected: PASS (2 assertions).

- [ ] **Step 5: Typecheck.**

Run: `pnpm exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit.**

```bash
git add app/components/briefing/charts.tsx app/components/briefing/__tests__/charts.test.ts
git commit -m "feat(briefing): hand-rolled SVG charts — LineChart, MiniBars, Sparkline"
```

---

## Task 5: Shared Chapter frame

**Files:**
- Create: `app/components/briefing/Chapter.tsx`

The `Chapter` component is defined inside `briefing-sections.jsx`. **Read that file first** and port its `Chapter` (and any `ExpandButton`/`Detail` helpers) into a standalone `Chapter.tsx`.

- [ ] **Step 1: Read** `Stonks_extracted/design_handoff_company_briefing/briefing-sections.jsx` and locate the `Chapter` frame component (the reusable wrapper used by `ChOverview/ChMargins/ChFinancials`).

- [ ] **Step 2: Write `Chapter.tsx`** as a typed `"use client"` component exposing this contract (match the prototype's actual prop names once read; the spec below is from README §"Chapter frame"):

```tsx
"use client";
import { useState, type ReactNode } from "react";

interface ChapterProps {
  id: string;            // section id for scroll-spy/anchor
  num: number;           // 1..7 — drives eyebrow index + watermark
  eyebrow: string;       // e.g. "Overview" → renders "01 / 07 · Overview"
  title: string;
  dek?: string;
  alt?: boolean;         // adds .alt gradient background
  children: ReactNode;   // collapsed (always-visible) content
  detail?: ReactNode;    // optional drawer content; renders Expand button when present
}
```

Requirements (verbatim from README §"Chapter frame", confirm against the source file):
- Renders `<section id={id} className={"chapter" + (alt ? " alt" : "")}>` with a `.watermark` showing the 2-digit `num`, an `.chapter-inner` wrapper, a `.ch-head` block (`.ch-index` = `` `${String(num).padStart(2,"0")} / 07 · ${eyebrow}` ``, `.ch-title`, optional `.ch-dek`), then `children`.
- When `detail` is provided: an `.expand-btn` (label "Expand detail", gold `.chev` `▾` that rotates when open) toggling local `open` state, and a `.detail`/`.detail.open` drawer (`grid-template-rows` animation) wrapping `<div className="detail-inner"><div className="detail-pad">{detail}</div></div>`.
- **Double-clicking the section** toggles the drawer (`onDoubleClick` on the `<section>`), guarded so it ignores double-clicks originating on buttons/links/inputs (mirror the keyboard guard pattern from `briefing.jsx`).
- Entrance animation is driven by the `.briefing.anim .chapter.in-view` CSS from Task 1 (no JS here beyond the IntersectionObserver in `BriefingApp`). Do **not** add per-element opacity inline — let the global CSS gate it.

- [ ] **Step 3: Typecheck.**

Run: `pnpm exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit.**

```bash
git add app/components/briefing/Chapter.tsx
git commit -m "feat(briefing): shared Chapter frame with detail drawer"
```

---

## Task 6: Chapters 01–03 (Overview, Margins, Financials)

**Files:**
- Create: `app/components/briefing/chapters/Overview.tsx`
- Create: `app/components/briefing/chapters/Margins.tsx`
- Create: `app/components/briefing/chapters/Financials.tsx`

**Source:** `briefing-sections.jsx` (`ChOverview`, `ChMargins`, `ChFinancials`).

**Port recipe (apply to each):**
1. **Read** `briefing-sections.jsx` for the component body.
2. Convert each `Ch*` to a typed function component taking `{ data }: { data: BriefingData }` (replace every `STONKS.x` reference with `data.x`).
3. Replace `window` global references with imports: `Chapter` from `../Chapter`; `LineChart`/`MiniBars`/`Sparkline` from `../charts`; `Flag`/`Delta`/`ToneBadge`/`Eyebrow`/`SourcePill` from `../atoms`; `fmtNum`/`cellInfo` from `../format`.
4. Add `"use client";` to any chapter that uses chart hover state or the LineChart/MiniBars (all three here do, indirectly via charts — charts are already client; chapters that only pass props can stay server, but for simplicity mark all chapter files `"use client"`).
5. Keep **all** inline styles and classNames verbatim. Do not "improve" spacing/colors — fidelity is the bar.

- [ ] **Step 1: Port `Overview.tsx`.** Content (README §01): company title + `about` dek; identity row (gold-outlined ticker chip + industry + asOf); "The ask" card (3px gold left border, the italic `data.ask`, the big `data.brief.headline`); 4-tile `tile-grid` from `data.stats` (each: `.stat-key`, `.stat-val`, `Delta` + `.stat-sub`); bottom-line pair (green "WHY IT MIGHT BE WORTH YOUR TIME" = `data.bottomLine.worth`, amber "WHAT TO CHECK FIRST" = `data.bottomLine.watch`); trust strip ("Built from N sources ·" + green ✓ verified, amber ◌ unverified, red ✕ rejected from `data.integrity`). Has the scroll hint (rendered by `BriefingApp` on chapter 01, or here — match source). `alt` chapter.

- [ ] **Step 2: Port `Margins.tsx`.** Content (README §02): a `.card` holding a single-series `LineChart` ("EBITDA margin %", gold, points from `data.quarters` mapping `{ label, y: margin }`, `yFmt` to 1 decimal, `height: 300`, area + peak on). Detail drawer: 2-col — left `data-table` Quarter/Margin/QoQ (QoQ delta colored), right "WHAT MOVED THE NUMBERS" driver cards from `data.brief.drivers` (optional gold metric chip + text). Eyebrow "Margins · the answer".

- [ ] **Step 3: Port `Financials.tsx`.** Content (README §03): 2-col grid of two `.card`s, each a `MiniBars` (left Revenue ₹cr teal from `data.quarters` `{label, y: rev}`; right EBITDA ₹cr gold `{label, y: ebitda}`, height 190). Detail drawer: wide `data-table` Quarter/Revenue/EBITDA/PAT/OPM% (OPM column gold, `toLocaleString("en-IN")`). `alt` chapter. Eyebrow "Financials".

- [ ] **Step 4: Typecheck + build.**

Run: `pnpm exec tsc --noEmit && pnpm build`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add app/components/briefing/chapters/Overview.tsx app/components/briefing/chapters/Margins.tsx app/components/briefing/chapters/Financials.tsx
git commit -m "feat(briefing): chapters 01-03 — Overview, Margins, Financials"
```

---

## Task 7: Chapters 04–07 (Peers, Management, Risks, Provenance)

**Files:**
- Create: `app/components/briefing/chapters/Peers.tsx`
- Create: `app/components/briefing/chapters/Management.tsx`
- Create: `app/components/briefing/chapters/Risks.tsx`
- Create: `app/components/briefing/chapters/Provenance.tsx`
- Create: `app/components/briefing/peers-sort.ts` (extracted pure sort helper for the peer matrix)
- Test: `app/components/briefing/__tests__/peers-sort.test.ts`

**Source:** `briefing-sections2.jsx` (`ChPeers`, `ChManagement`, `ChRisks`, `ChSources`). Same port recipe as Task 6.

- [ ] **Step 1: Write the failing peer-sort test** `__tests__/peers-sort.test.ts` (the matrix "click a KPI row to sort peer columns" logic — README §04 & §State):

```ts
import { describe, it, expect } from "vitest";
import { sortPeers } from "../peers-sort";
import type { MatrixRow } from "../types";

const row: MatrixRow = {
  kpi: "EBITDA margin", unit: "%", fmt: "pct", spark: "margin",
  cells: { A: 35.2, B: 42.1, C: { v: null, trust: "missing", note: "x" }, D: 38.4 },
};

describe("sortPeers", () => {
  it("sorts peers descending by the row's cell values", () => {
    expect(sortPeers(["A", "B", "C", "D"], row)).toEqual(["B", "D", "A", "C"]);
  });
  it("pushes null/missing values last", () => {
    const out = sortPeers(["A", "B", "C", "D"], row);
    expect(out[out.length - 1]).toBe("C");
  });
  it("returns the input order when row is null", () => {
    expect(sortPeers(["A", "B", "C"], null)).toEqual(["A", "B", "C"]);
  });
});
```

- [ ] **Step 2: Run to confirm it fails.**

Run: `pnpm test -- peers-sort.test`
Expected: FAIL — `Cannot find module '../peers-sort'`.

- [ ] **Step 3: Write `peers-sort.ts`:**

```ts
import { cellInfo } from "./format";
import type { MatrixRow } from "./types";

/** Sort peer column keys descending by a KPI row's values; nulls/missing last. null row = identity. */
export function sortPeers(peers: string[], row: MatrixRow | null): string[] {
  if (!row) return [...peers];
  return [...peers].sort((a, b) => {
    const va = cellInfo(row.cells[a]).v;
    const vb = cellInfo(row.cells[b]).v;
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    return vb - va;
  });
}
```

- [ ] **Step 4: Run to confirm it passes.**

Run: `pnpm test -- peers-sort.test`
Expected: PASS (3 assertions).

- [ ] **Step 5: Port `Peers.tsx`** (README §04). Collapsed: `.card` "EBITDA MARGIN % · RANKED" horizontal rank bars — one row per peer (`108px / 1fr / 46px` grid), subject `INDHOTEL` gold+bold, others 70% teal, sorted descending, rejected/missing excluded. Detail drawer: the **full KPI matrix** sortable table — rows = `data.matrix`, columns = `data.peers`; subject column gold-tinted; clicking a KPI row label calls `sortPeers` (local `sortBy` state, toggle to clear); the EBITDA-margin row renders a `Sparkline` per cell from `data.peerMargins`; flagged cells render `<Flag>` + dimmed value + `title` tooltip with the note; a mono caption explains flags. Use `cellInfo`/`fmtNum`. Eyebrow "Peers · Hotels".

- [ ] **Step 6: Port `Management.tsx`** (README §05). Collapsed: `.card` with a **tone path** SVG — `data.commentary` nodes plotted on a 4-level y-axis (cautious=1…confident=4) connected by a gold line; the flagged node (non-null `flag`) is larger, `--warn`, with a ⚠; tone label above, period below. Below: a contradiction callout (amber card) for the flagged entry. Detail drawer: one card per call — period, `ToneBadge`, summary, topic chips; flagged card gets amber border/tint + "⚠ CONTRADICTION" pill + `flag` text. `alt` chapter; this is the chapter whose rail item shows the flag dot. Eyebrow "Management commentary".

- [ ] **Step 7: Port `Risks.tsx`** (README §06). Collapsed: vertical stack of risk cards from `data.brief.risks` — each a 3px left accent border + glyph colored by tone (`cautious` = `--warn` ▼, else `--muted` ▶) + 15px text. Detail drawer: a single "guidance context" card built from `data.brief.guidance`, emphasizing "pace, not direction." Eyebrow "Risks & what to watch".

- [ ] **Step 8: Port `Provenance.tsx`** (README §07). Collapsed: 2-col grid of source cards from `data.sources` (square dot colored by `SRC_COLOR[type]`, type label, `label`, right-aligned `p{page}`); an integrity row (3 tiles: green verified, amber nlmOnly, red rejected from `data.integrity`). Detail drawer: one card per flagged matrix cell (derive by scanning `data.matrix` for non-`ok` cells) — `Flag` badge + left accent + the `note`. `alt` chapter. Eyebrow "Provenance".

- [ ] **Step 9: Typecheck + build.**

Run: `pnpm exec tsc --noEmit && pnpm build`
Expected: PASS.

- [ ] **Step 10: Commit.**

```bash
git add app/components/briefing/chapters/Peers.tsx app/components/briefing/chapters/Management.tsx app/components/briefing/chapters/Risks.tsx app/components/briefing/chapters/Provenance.tsx app/components/briefing/peers-sort.ts app/components/briefing/__tests__/peers-sort.test.ts
git commit -m "feat(briefing): chapters 04-07 — Peers, Management, Risks, Provenance"
```

---

## Task 8: BriefingApp shell + data adapter seam

**Files:**
- Create: `app/components/briefing/BriefingApp.tsx`
- Create: `app/components/briefing/adapter.ts`

- [ ] **Step 1: Write `adapter.ts`** — the single real-data seam (returns mock for now):

```ts
import { MOCK_BRIEFING } from "./mock";
import type { BriefingData } from "./types";

/**
 * Maps the live dashboard payload to the briefing view model.
 * MOCK NOW, WIRE LATER: returns mock data regardless of input. The follow-up plan
 * replaces this body with a real getDashboard()/ComparisonData → BriefingData mapping
 * (derive quarters[] from trends, stat deltas from YoY, peerMargins from per-peer trends,
 * source labels from filings; carry trust/flag fields end-to-end).
 */
export function toBriefingData(_data?: unknown, _comparison?: unknown): BriefingData {
  return MOCK_BRIEFING;
}
```

- [ ] **Step 2: Write `BriefingApp.tsx`** — port `briefing.jsx` (lines 1–115) to a typed `"use client"` component. Mechanical changes: replace the `useStateApp/useEffectApp/useRefApp` aliases with plain `useState/useEffect/useRef`; render the seven chapter components (imported from `./chapters/*`) instead of `window.StonksChapters*`; pass `data` to each chapter; read brand/foot fields from `data.company`; add an `onExit` prop and a "← new analysis" button in `.rail-foot`. Signature:

```tsx
"use client";
import { useState, useEffect, useRef } from "react";
import type { BriefingData } from "./types";
import Overview from "./chapters/Overview";
// …import the other six…

const CHAPTERS = [
  { id: "overview", num: 1, label: "Overview" },
  { id: "margins", num: 2, label: "Margins" },
  { id: "financials", num: 3, label: "Financials" },
  { id: "peers", num: 4, label: "Peers" },
  { id: "management", num: 5, label: "Management", flag: "var(--warn)" },
  { id: "risks", num: 6, label: "Risks" },
  { id: "sources", num: 7, label: "Provenance" },
];

export default function BriefingApp({ data, onExit }: { data: BriefingData; onExit?: () => void }) { /* … */ }
```

Port verbatim: the IntersectionObserver scroll-spy (threshold .45, adds `.in-view`, sets `active`), the `prefers-reduced-motion` gate that adds `.anim`, the passive scroll→`pct` progress handler, the `jump(idx)` smooth-scroll, and the keyboard nav (`↓/PageDown/Space` next, `↑/PageUp` prev, suppressed inside button/a/input/textarea). The returned JSX = `.progress-bar`, `.rail` (brand, nav list with active state + flag-dot, foot with ticker/asOf + the new exit button), and `.briefing > .chapters` containing the seven chapters in order.

> Decide chapter export style consistently — this plan assumes **default exports** for chapter components (`export default function Overview(...)`). Ensure Tasks 6–7 match.

- [ ] **Step 3: Typecheck + build.**

Run: `pnpm exec tsc --noEmit && pnpm build`
Expected: PASS.

- [ ] **Step 4: Commit.**

```bash
git add app/components/briefing/BriefingApp.tsx app/components/briefing/adapter.ts
git commit -m "feat(briefing): app shell (rail, scroll-spy, keyboard, progress) + adapter seam"
```

---

## Task 9: Integrate into the page — briefing replaces the dashboard

**Files:**
- Modify: `app/page.tsx`
- Modify: `app/components/Dashboard.tsx` (retire body)

- [ ] **Step 1: Render the briefing full-screen when a study is loaded.** In `app/page.tsx`, when the dashboard `data` is present, render the briefing as a full-bleed view (its own fixed rail + document scroll) instead of the two-pane control layout. Keep the two-pane (ControlRail + empty/plan/run state) when `data` is null. Wire the briefing's `onExit` to clear `data` (return to controls). Sketch:

```tsx
import BriefingApp from "./components/briefing/BriefingApp";
import { toBriefingData } from "./components/briefing/adapter";
// …

if (data) {
  return <BriefingApp data={toBriefingData(data, comparison)} onExit={() => setData(null)} />;
}
return (
  <main style={{ display: "grid", gridTemplateColumns: "minmax(300px, 360px) 1fr", height: "100vh" }}>
    {/* existing ControlRail aside + empty/plan/run section */}
  </main>
);
```

(Adapt to the actual state variable names in `page.tsx` — confirm whether `data`/`setData` live in `page.tsx` or are lifted from `ControlRail`'s `onComplete`. If `ControlRail` owns completion, hoist a `data` state into `page.tsx` set by `onComplete`.)

- [ ] **Step 2: Retire `Dashboard.tsx`.** Reduce it to the empty-state only (or delete it and inline the empty state in `page.tsx`). Remove its imports of the old panels. **Do not delete the panel component files yet** — that happens in Task 10 after parity is confirmed.

- [ ] **Step 3: Add a temporary QA escape hatch** so the briefing can be reviewed without running a full (LLM + NotebookLM) analysis. In `page.tsx`, if `typeof window !== "undefined"` and `new URLSearchParams(window.location.search).get("briefing") === "mock"`, render `<BriefingApp data={toBriefingData()} onExit={…} />`. **Mark with a `// TODO(remove before merge): QA-only mock route` comment** — removed in Task 10.

- [ ] **Step 4: Build.**

Run: `pnpm exec tsc --noEmit && pnpm build`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add app/page.tsx app/components/Dashboard.tsx
git commit -m "feat(briefing): render briefing full-screen as the post-run dashboard"
```

---

## Task 10: End-to-end verification, cleanup, and finishing

**Files:**
- Modify: `app/page.tsx` (remove QA hatch)
- Delete: unused old panel components (only if no remaining importers)
- Modify: `CLAUDE.md` (update the dashboard description + build-phase log)

- [ ] **Step 1: Full test suite + typecheck + build.**

Run: `pnpm test && pnpm exec tsc --noEmit && pnpm build`
Expected: all green (existing suite + the 3 new test files). Fix any regressions before proceeding.

- [ ] **Step 2: Visual fidelity QA against the screenshots.** Kill stray servers (`lsof -ti tcp:4317 | xargs kill`), run `pnpm dev`, open `http://localhost:4317/?briefing=mock`, and compare each chapter to its reference capture:
  - 01 `screenshots/01-overview.png` — title, ask card (gold left border), 4 stat tiles, green/amber bottom-line pair, trust strip.
  - 02 `02-margins.png` — gold LineChart, peak dot label, hover crosshair + value chip.
  - 03 `03-financials.png` — teal Revenue + gold EBITDA MiniBars.
  - 04 `04-peers.png` — ranked margin bars (INDHOTEL gold); open drawer → sortable matrix, in-cell sparklines, flag badges.
  - 05 `05-management.png` — tone path SVG with the warn-colored Q4 node + ⚠; contradiction callout.
  - 06 `06-risks.png` — risk cards with tone glyphs/accents.
  - 07 `07-provenance.png` — source cards (type-colored dots) + integrity row.
  - Shell: fixed rail with active highlight + chapter-05 flag dot, top progress bar tracks scroll, click-to-jump, ↓/↑ keyboard nav, "Expand detail" + double-click drawers, gentle scroll-snap, entrance fade-in (and that it's disabled under OS "reduce motion").

Record the result honestly (which chapters match, any deviations). Fix deviations against the canonical CSS/source before claiming done.

- [ ] **Step 3: Remove the QA escape hatch** added in Task 9 Step 3 (the `?briefing=mock` branch + its TODO comment).

- [ ] **Step 4: Delete dead panel components.** For each of `BriefPanel`, `ComparisonPanel`, `TrendsPanel`, `CommentaryPanel`, `IntegrityTile`, `MetricsTable`, `MarginChart`, `ReviewerPanel`, `RejectsPanel`, `CompanyHeader`: run `grep -rn "ComponentName" app/ src/` and delete the file only if it has no remaining importer. Leave anything still referenced. (The `src/dashboard/*` data layer stays — it feeds the future adapter.)

- [ ] **Step 5: Update `CLAUDE.md`** — change the architecture one-liner + `app/components/*.tsx` description to reflect the briefing as the dashboard, and add a build-phase note: "Scrollytelling Company Briefing dashboard: DONE (mock-data; real-data adapter `app/components/briefing/adapter.ts` is the open seam, wire-up deferred)."

- [ ] **Step 6: Final build + typecheck after cleanup.**

Run: `pnpm exec tsc --noEmit && pnpm build && pnpm test`
Expected: all green; no references to deleted components.

- [ ] **Step 7: Commit.**

```bash
git add -A
git commit -m "chore(briefing): remove QA hatch, delete dead panels, update docs"
```

---

## Verification Summary

- **Unit tests (vitest):** `format.test.ts` (fmtNum/cellInfo), `charts.test.ts` (niceBounds), `peers-sort.test.ts` (matrix sort). Run `pnpm test`.
- **Type + build gates:** `pnpm exec tsc --noEmit` and `pnpm build` after every task.
- **Visual acceptance:** the 7 reference screenshots in `Stonks_extracted/design_handoff_company_briefing/screenshots/` are the bar; QA each chapter + the shell interactions in the running dev app (`?briefing=mock`).
- **Interaction acceptance:** scroll-spy, progress bar, click-to-jump, keyboard nav, expand/double-click drawers, matrix column sort, chart hover, reduced-motion gating.

## Out of Scope (explicit — follow-up plan)

- The real `getDashboard()/ComparisonData → BriefingData` mapping inside `adapter.ts` (deriving `quarters[]`, stat `delta/dir`, `peerMargins`, source labels; carrying trust/flag fields). This plan ships the UI on mock data behind that seam.
- Backend synthesis of `about` and `bottomLine{worth,watch}` (not produced by the current planner/synthesis).
- A mobile hamburger to reveal the collapsed rail at ≤900px (prototype has none; add later if mobile becomes in-scope).
