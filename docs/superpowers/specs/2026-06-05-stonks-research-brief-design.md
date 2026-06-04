# stonks — Cited Research Brief (Phase 1 of "the full thing")

> **Status:** Design approved 2026-06-05. Supersedes the earlier "multi-quarter trends first"
> framing (see "Why this replaced the trends-first plan" below).
> **Builds on:** B1 app (`docs/superpowers/specs/2026-06-04-stonks-b1-app-design.md`) — reuses its
> coordinator, SSE stream, NotebookLM extraction rails, verifier, and dashboard shell.

## The product in one line

Ask about a company → get a **cited research brief** (the read of the concall + filings you don't
have time to do), with a **light evidence dashboard** underneath. The brief is the headline; the
numbers are supporting evidence, pulled cheap from screener. **We do not rebuild screener.**

## Why this replaced the trends-first plan

The first pass scoped "multi-quarter trends" (small multiples of screener's tables) as Phase A.
Khush correctly killed it: rendering screener's own tables as charts is a *worse screener* and
augments nothing — he already has screener for numbers. The painful, hours-long job is **reading
the 80-page annual report and 40-page concall transcript** and extracting the story: management
guidance, why margins moved, risks, industry-specific KPIs. That read is the augmentation. Numbers
are context for the read, not the deliverable.

So the output is: **a synthesized, cited answer up top + an evidence dashboard below** (browsable,
but supporting). The numbers become a thin sidebar; the build's real work is the document synthesis
— which B1 already built most of the rails for.

## Decomposition (the full vision, sequenced)

| Phase | Capability | Status |
|---|---|---|
| **1 (this spec)** | Single-company cited research brief + evidence dashboard | designing now |
| 2 | Competitor benchmarking — multi-company synthesis + side-by-side comparison | future spec |
| 3 | Multi-turn chat + industry/Teacher tutoring ("learning") | future spec |

Each phase gets its own spec → plan → build. Phase 1 delivers the augmentation end-to-end for one
company; do not pull Phase 2/3 work forward.

## Hard constraints (inherited, unchanged unless noted)

- **Subscription-only.** Agents run as `claude -p` headless sessions on Max. No raw Agent SDK, no
  pay-as-you-go API credits.
- **No terminal for the user.** All interaction through the local Next.js web UI (localhost:4317).
- **Cheap models only.** Haiku/Sonnet. No Opus.
- **Data integrity is non-negotiable for numbers.** No *number* reaches the live `metrics` table
  without passing the Verifier against its source PDF page. (New, below: how this applies to numbers
  *embedded in narrative claims*, and the deterministic `screener` trust tier for context numbers.)

## Architecture

Reuses B1's spine. The coordinator's fixed pnpm chain gains **one synthesis step**; the dashboard
gains a **brief panel** as its lead and **demotes the metrics grid to evidence**.

```
Next.js (localhost:4317)
  → /api/run spawns ONE claude -p Coordinator
      Fixed chain (Bash pnpm calls, streamed as SSE):
        1. pnpm scrape   <company>              # already pulls concall transcripts + presentations (+AR opt)
        2. pnpm ingest   <company>              # filing PDFs → NotebookLM notebook (idempotent)
        3. pnpm synthesize <company> "<ask>"    # NEW — the headline: cited narrative brief
        4. pnpm extract  <company> "<ask>"      # numbers referenced by the brief → staging
        5. pnpm verify                          # disposer: confirm each staged number vs cited PDF page
        6. pnpm db summary
  → read-only UI: BRIEF (cited claims, trust-marked) + EVIDENCE dashboard (referenced metrics only)
```

The order matters: **synthesis runs before extract** so the brief decides *which* numbers are worth
extracting and verifying. The brief names the metrics it cites; extract chases exactly those (plus
the universal core for the evidence tiles), keeping extraction focused and token-cheap.

## Components & contracts

Each unit is independently testable; NotebookLM access stays behind the existing injectable `Runner`.

### 1. Synthesis prompt builder — `src/synthesis/prompt.ts` (NEW)
- **Does:** builds the headless prompt that asks NotebookLM the user's `ask` **plus a fixed analyst
  frame** over all ingested docs: (a) direct answer to the ask, (b) management guidance/outlook,
  (c) what moved margins / key financial drivers this period, (d) key risks & red flags, (e) the
  3–5 industry-specific KPIs for this company's sector and their recent values.
- **Injection-guarded** the same way `src/coordinator/prompt.ts` is: company name flag-smuggling
  guard, `ask` fenced as DATA between `<ask>…</ask>` markers, code-fence/marker neutralisation.
- **Requests structured JSON output** (see schema below) so the parser is deterministic.
- **Depends on:** nothing but its string inputs. Pure function. Easy to unit-test.

### 2. Brief schema + parser — `src/synthesis/brief.ts` (NEW)
- **Does:** defines the `Brief` shape and parses NotebookLM's `--json` answer into it, defensively
  (NotebookLM prose around JSON, missing fields → typed nulls, never throws on a soft-missing field).
- **`Brief` shape:**
  ```ts
  type Claim = {
    text: string;              // one synthesized sentence/point
    section: 'answer' | 'guidance' | 'drivers' | 'risks' | 'industry_kpi';
    citation: CitationRef | null;   // source doc + page (reuses src/dashboard/citation.ts resolver)
    metric?: { name: string; value: string; unit?: string; period?: string }; // if the claim asserts a number
  };
  type Brief = { ask: string; claims: Claim[]; industryKpis: string[]; generatedFrom: string[] };
  ```
- **Depends on:** `selectCitation`/citation types already in `src/notebooklm/parse-citations.ts` +
  `src/dashboard/citation.ts`.

### 3. Synthesis CLI — `src/cli/synthesize.ts` (NEW)
- **Does:** `pnpm synthesize "<Company>" "<ask>"` → loads company/notebook from SQLite, calls
  `notebooklm ask … --json` via the typed `Runner`, parses to a `Brief`, prints it as JSON to stdout
  (use `-s` banner suppression convention like extract). Stores the brief (see persistence below).
- **Depends on:** `src/synthesis/{prompt,brief}.ts`, `src/notebooklm/cli.ts`, `src/db`.

### 4. Number disposition for claims — extends `src/cli/extract.ts` + `src/verifier`
- **Does:** any `Claim.metric` (a number embedded in narrative) is staged into `metrics_staging`
  exactly like today's universal metrics, then **`pnpm verify` disposes it against the cited PDF
  page** → promoted `verified` (green) or kept `notebooklm-only` (amber). The brief renders the
  claim's number with that trust badge. **Pure-narrative claims** (no number) carry no metric trust
  — they show as *NotebookLM-grounded* with a clickable citation the user verifies themselves.
- **No new verifier logic** — reuses `src/verifier/{match,verify}.ts` source-scoped gate.

### 5. Context numbers (the evidence tiles) — `screener` trust tier
- **Does:** the universal-core metrics shown as evidence tiles come straight from screener's tables
  during scrape (deterministic), written with **`trust='screener'`** + source URL + scrape timestamp.
- **Constraint refinement (explicit):** screener numbers **skip the PDF gate**. The gate exists to
  catch RAG/OCR guesswork; a deterministic scrape of screener's own table has none. This adds a
  third trust value — `'verified' | 'notebooklm-only' | 'screener'` — via a guarded ALTER in
  `src/db/migrate.ts`. **This modifies a documented invariant in CLAUDE.md and must be written into
  CLAUDE.md as part of the build.** Numbers *inside brief claims* still go through the full gate
  (they're NotebookLM-proposed, not screener-scraped).
- **Scope guard:** evidence tiles show **only the metrics the brief references** + the universal
  core. No exhaustive trend grid. A "Full financials on screener →" deep-link covers everything else.

### 6. Coordinator — `src/coordinator/{prompt,stream}.ts`
- **prompt.ts:** insert step 3 (`pnpm synthesize`) ahead of extract in the fixed chain; closing
  summary instruction now points at the brief, not raw metrics.
- **stream.ts:** add a step-label regex for `pnpm synthesize *` so the live feed ticks it green.
  (Tech-debt #2 note from HANDOFF: keep the regexes specific.)

### 7. Dashboard — `src/dashboard/data.ts` + `app/components/*`
- **data.ts:** `getDashboard` shaping gains the `Brief` (loaded from persistence) and filters
  evidence metrics to those the brief references ∪ universal core. (Addresses HANDOFF tech-debt #1:
  scope the metrics query instead of full-scan-then-filter.)
- **UI:** new `BriefPanel` is the lead — claims grouped by section (answer / guidance / drivers /
  risks / industry KPIs), each claim citation-linked, numbers trust-badged. The existing
  `MetricsTable`/`IntegrityTile`/`MarginChart` move **below** as the evidence block, scoped to
  referenced metrics, with the screener deep-link. `RejectsPanel` (quarantine) stays.

### Persistence of the brief
The brief is JSON. Store it in a new `briefs` table (`company_id`, `ask`, `json`, `created_at`) via a
guarded migration, so the read-only dashboard route can load the latest brief without re-running the
coordinator. (Mirrors how metrics are written by the chain and read by the app — app stays read-only.)

## Data flow & trust summary

| Output | Source | Trust treatment |
|---|---|---|
| Brief narrative claim (no number) | NotebookLM over ingested docs | NotebookLM-grounded + clickable citation |
| Number inside a brief claim | NotebookLM, **disposed by Verifier** | green `verified` / amber `notebooklm-only` |
| Evidence tile (universal core) | screener table scrape (deterministic) | `screener` tier (source URL + timestamp) |
| Rejected number | failed verifier | red Quarantine panel (reason + excerpt) |

## Error handling

- NotebookLM returns no/garbage JSON → brief parser yields an empty-but-typed `Brief`; UI shows
  "couldn't synthesize — sources may still be indexing" rather than a crash. (NotebookLM indexes
  sources async; the existing ingest step already waits, but synthesis must degrade gracefully.)
- A claim cites a page the verifier can't confirm → number stays `notebooklm-only` (amber), claim
  still shown. Never silently upgrade.
- screener scrape misses a metric → tile shows "—", not a fabricated value.
- Coordinator step fails → existing SSE error path; dashboard clears on failed refresh (B1 behavior).

## Testing (TDD)

All deterministic; NotebookLM mocked via injectable `Runner`; no PDF text enters agent context.

- `src/synthesis/prompt.ts`: injection guards (flag-smuggle company, `<ask>` forgery, code fences),
  fixed analyst frame present, JSON-output instruction present.
- `src/synthesis/brief.ts`: parses well-formed JSON; tolerates prose-wrapped JSON; missing fields →
  typed nulls; a claim with a number populates `metric`.
- extract/verify path: a claim-number stages then promotes `verified` on match, `notebooklm-only`
  on miss (reuse verifier fixtures).
- `screener` tier: migrate adds the third trust value idempotently; screener scrape writes
  `trust='screener'` with source + timestamp.
- `getDashboard`: returns the brief; evidence metrics filtered to referenced ∪ universal core.
- `BriefPanel`: renders claims grouped by section with correct citation links + trust badges;
  empty brief renders the graceful-degradation message.
- Gates: `pnpm test` green, `pnpm exec tsc --noEmit` clean, `pnpm build` clean.
- Manual golden-path E2E on one company (billable — human-gated): Run → live feed → brief with
  cited claims + evidence tiles. (Use `CLAUDE_BIN=/tmp/fakebin/claude` for all UI dev.)

## Out of scope for Phase 1

Multi-company / competitor benchmarking (Phase 2), multi-turn conversational chat (Phase 3), the
full Teacher/industry tutor (Phase 3), exhaustive metric trend grids (screener already does this),
the menu-bar launcher wrapper (deferred).

## CLAUDE.md updates required by this build

1. Document the `screener` trust tier and that screener-scraped context numbers skip the PDF gate
   (with the rationale: deterministic scrape has no RAG/OCR guesswork to catch).
2. Add `pnpm synthesize` to the Commands list and the synthesis step to the coordinator chain.
3. Note the `briefs` table and `src/synthesis/` to the Code map.
