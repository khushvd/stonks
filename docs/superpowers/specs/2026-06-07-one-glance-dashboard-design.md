# stonks — One-Glance Dashboard

> **Status:** Design approved in brainstorm on 2026-06-07.
> **Builds on:** peer notebook briefing pack (`2026-06-06-peer-notebook-briefing-pack-design.md`),
> bounded autonomous analyst refactor, quarterly Screener financial data (already scraped).

## Product Intent

The current dashboard surfaces data bottom-up: evidence first, narrative second. The upgraded
dashboard inverts this: numbers first, then narrative, then evidence. At one scroll the user sees
where the company stands vs peers, how its financials have trended over the last 4 quarters, what
management has been saying quarter by quarter, and whether anything they said contradicts a prior
position. The research brief and integrity evidence sit below the fold for those who want to go
deeper.

## Locked Design Decisions

- **Dashboard section order (top → bottom):** CompanyHeader → ComparisonPanel → TrendsPanel →
  CommentaryPanel → BriefPanel → Evidence (IntegrityTile, MetricsTable, ReviewerPanel, RejectsPanel).
- **Financial trends source:** Screener quarterly data only. Already scraped (Revenue, EBITDA,
  OPM%, PAT, EPS, ROCE%). No new extraction pipeline needed — display fix only.
- **Commentary extraction:** single cross-quarter NotebookLM query per company notebook. One
  `pnpm commentary-trends` script, one new executor step, one new DB table. Concall transcripts
  are already in the default source scope (`--per-type 4`); no scraper changes needed.
- **Commentary panel layout:** latest quarter prominent (full-width card, full paragraph), prior
  3 quarters compressed in a 3-column grid beneath it.
- **CommentaryPanel is main-company only.** Peers do not get commentary trend analysis.
- **Contradiction detection:** done by the NotebookLM reasoning step inside the single query, not
  by post-processing code. The prompt explicitly asks for contradiction notes vs the prior quarter.
- **Commentary failure is non-fatal.** If `pnpm commentary-trends` fails, the dashboard renders
  "Commentary unavailable" and the run does not fail.

## What Changes

### 1. Dashboard layout (frontend only)

Reorder panels in `app/components/Dashboard.tsx`:

```
CompanyHeader
ComparisonPanel        ← promoted from middle
TrendsPanel            ← upgraded (see below)
CommentaryPanel        ← new
BriefPanel             ← demoted
── Evidence heading ──
IntegrityTile
MetricsTable
ReviewerPanel
RejectsPanel
```

### 2. TrendsPanel upgrade (display fix)

Screener quarterly rows are already stored in `metrics` with `trust = "screener"` and a period
label (e.g. "Mar 2024", "Dec 2023"). The current `TrendsPanel` already groups by metric name and
plots points — it just doesn't distinguish quarterly vs annual period labels.

Required changes:
- `src/dashboard/data.ts`: separate quarterly series (period labels containing a month name or
  "Q\d") from annual series. Surface quarterly as the primary trend; annual as fallback if fewer
  than 2 quarterly points exist.
- `TrendsPanel.tsx`: display quarterly series as a proper multi-Q chart. Show 4 priority metrics
  above the fold: Revenue, EBITDA, OPM%, PAT. Remaining metrics (EPS, ROCE%) collapse below.
- Period labels on the x-axis: short format — "Q3 FY24" derived from the raw Screener period
  string.

### 3. Commentary trends extraction (new pipeline step)

**Script:** `src/cli/commentary-trends.ts` → `pnpm commentary-trends "<Company>"`

Queries the company's existing NotebookLM notebook with a single structured prompt:

> "For each of the last 4 quarterly concall or results documents in this notebook (oldest to
> newest), provide a JSON array where each element contains:
> - `period`: the quarter label (e.g. 'Q3 FY24')
> - `summary`: 2–3 sentences summarising management's key messages
> - `tone`: one of 'cautious', 'neutral', 'optimistic', 'confident'
> - `keyTopics`: an array of 3–5 short topic tags that management emphasised (e.g. 'margins',
>   'rural demand', 'competition', 'capex guidance')
> - `contradictionNote`: a sentence describing any contradiction or notable shift from the prior
>   quarter's stated position, or null if none.
> Return only the JSON array, no prose."

Output validated as `CommentaryTrend[]`. Rows inserted into `commentary_trends` for this run.

**Executor step** (added after `synthesize`, before `extract`):
```
step 5b: pnpm -s commentary-trends "<Company>"
```
Non-fatal: a failure emits a warning event and continues.

### 4. Data model

**New table:**
```sql
CREATE TABLE commentary_trends (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id      INTEGER NOT NULL REFERENCES companies(id),
  run_id          INTEGER NOT NULL REFERENCES runs(id),
  period          TEXT NOT NULL,
  summary         TEXT NOT NULL,
  tone            TEXT NOT NULL CHECK(tone IN ('cautious','neutral','optimistic','confident')),
  key_topics      TEXT NOT NULL,   -- JSON array of strings
  contradiction_note TEXT,         -- null if no contradiction
  created_at      TEXT DEFAULT (datetime('now'))
);
```

**TypeScript type** (`src/dashboard/data.ts`):
```ts
export interface CommentaryTrend {
  period: string;
  summary: string;
  tone: 'cautious' | 'neutral' | 'optimistic' | 'confident';
  keyTopics: string[];
  contradictionNote: string | null;
}
```

`getDashboard` gains `commentaryTrends: CommentaryTrend[]` sourced from the latest run's rows
for this company, ordered oldest → newest.

### 5. CommentaryPanel component (new)

`app/components/CommentaryPanel.tsx`

Layout: latest quarter (last in array) gets a full-width prominent card. Prior 3 quarters render
in a 3-column compressed grid below it.

**Latest quarter card:**
- Quarter label + tone badge (colour-coded: cautious=red, neutral=amber, optimistic=green,
  confident=dark green)
- Contradiction badge ("⚠ contradicts [prior Q]") if `contradictionNote` is set — amber/red
- Full `summary` paragraph
- `keyTopics` as small tag chips; all chips rendered in warning colour when `contradictionNote`
  is non-null (whole card is flagged, no fragile per-topic string matching)

**Prior quarter cards (3-col grid):**
- Quarter label + tone indicator (arrow + word)
- Shortened summary (first sentence or 100 chars)
- `keyTopics` chips (smaller)
- Contradiction badge inline if set

**Empty / unavailable state:** "Management commentary unavailable for this run." in muted text.

## Tone Colour System

| Tone | Border accent | Badge background | Badge text |
|---|---|---|---|
| cautious | `#c08080` | `#fde8d8` | `#8a3030` |
| neutral | `#c8b87a` | `#fff9d8` | `#8a7a30` |
| optimistic | `#a0b8a0` | `#e8f7e8` | `#2a5c3a` |
| confident | `#4a8c5c` | `#d4f0e0` | `#1a4c2a` |

## Migration

`src/db/migrate.ts` gains a guarded `CREATE TABLE IF NOT EXISTS commentary_trends` block.
No changes to existing tables.

## Testing

- Unit: `commentary-trends` script with a mock `notebooklm` runner returning a valid 4-element
  JSON array — verify rows inserted correctly.
- Unit: `getDashboard` returns `commentaryTrends` in correct order when rows exist; returns `[]`
  when none.
- Unit: `CommentaryPanel` renders latest Q prominent, prior 3 in grid, contradiction badge
  visible when `contradictionNote` is set.
- Integration: full executor run (with fake NLM binary) includes the `commentary-trends` step
  and the dashboard data includes the commentary array.
- Existing tests must stay green — no regressions to current pipeline or dashboard panels.

## Out of Scope

- Per-peer commentary trends (peers show financials and sector KPIs only).
- Commentary trend for more than 4 quarters (can expand later).
- Quarterly sector KPI trends from NotebookLM (Screener quarterly data covers standard financials;
  sector KPI quarterly trends are a future addition).
- Any UI for re-running commentary extraction independently.
