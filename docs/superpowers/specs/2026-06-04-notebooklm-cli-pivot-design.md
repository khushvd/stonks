# NotebookLM CLI Pivot — Design

**Date:** 2026-06-04
**Status:** Approved (brainstorm complete; ready for writing-plans)
**Supersedes:** the NotebookLM-MCP integration assumptions in
`docs/superpowers/specs/2026-06-03-phase2a-notebooklm-extractor-design.md`.
Everything else in that Phase 2a spec (trust model, verifier-as-disposer, canonical
metric set, staging-by-default) stands unchanged.

## Why pivot

Phase 2a was built on the **NotebookLM MCP** (`github.com/PleasePrompto/notebooklm-mcp`).
A live E2E on Asian Paints (2026-06-04) exposed three hard limits that make it the wrong
foundation:

1. **Cannot create notebooks.** Forces a manual "create it in the UI and paste the
   share-URL" step — unacceptable for a hands-off flow.
2. **Cannot upload local files.** `add_source` is URL-only. The public BSE PDF URLs do
   not crawl cleanly, and chart-heavy decks need the real PDF for good OCR.
3. **Flaky browser automation.** `add_source` repeatedly failed to open NotebookLM's
   "Add source" dialog, even for sources it had added moments earlier.

The standalone **`notebooklm` Python CLI (v0.3.4)** — already proven in the `tcc-council`
project — does all three cleanly. It was validated by hand here:

- `notebooklm create "Asian Paints"` → notebook `9195a137-7850-4134-9c1f-524022f5592c`
- `notebooklm source add data/ASIANPAINT/<file>.pdf --type file -n <id>` → all 4 PDFs uploaded
- `notebooklm source wait <source_id> -n <id>` → all indexed `ready`
- `notebooklm ask "...revenue..." -n <id> --json` → answer **₹9,228 cr (Q4 FY26), +10.8% YoY
  vs ₹8,330 cr**, with structured `references[]` carrying `cited_text` + `source_id`.

The integrity loop is intact: NotebookLM proposes the number with a cited excerpt; the
deterministic pdfjs verifier disposes against the local PDF.

## Non-negotiable: the CLI is internal plumbing

The user **never** runs a CLI. Interaction stays natural-language — the extractor agent
today, the web UI later. `notebooklm` and the `pnpm` scripts are what the agents/app shell
out to behind the scenes. This preserves the project's "no terminal for the user" constraint;
the only human-facing CLI touch is the **one-time `notebooklm login`** (browser auth), which
is the same accepted exception as the old MCP `setup_auth`.

## Architecture

Three stages, all driven by the `notebooklm` CLI through deterministic TypeScript; agents stay thin.

```
[scraper]   unchanged (Phase 1 Playwright). Downloads PDFs to data/<TICKER>/, captures source_url.

[ingest]    pnpm ingest "Company"   — DETERMINISTIC TypeScript, no LLM
              1. auth precheck: `notebooklm list` succeeds, else fail fast → "run notebooklm login once"
              2. notebook: reuse notebooks.notebook_id if present, else `notebooklm create "<Company>"`
                 → persist notebook_id + notebook_url (upsertNotebook)
              3. per filing with a local_path and no notebooklm_source_id yet:
                   `notebooklm source add <local_path> --type file -n <notebook_id> --json`
                   → persist returned source.id onto the filing row (notebooklm_source_id)
              4. per just-added source: `notebooklm source wait <source_id> -n <notebook_id>`
              Idempotent: already-mapped filings are skipped; re-runnable.
            ingestor.md = thin Sonnet agent that runs `pnpm ingest "<Company>"` and reports honestly.

[extract]   extractor.md agent (Sonnet)
              1. `pnpm extract "<Company>" [--ask "<free text>"]` → company, notebook, filings,
                 canonical metric list (universal + industry + needsIndustryInference), ask.
              2. for EACH metric: `notebooklm ask "<targeted question>" -n <notebook_id> --json`
              3. read the prose answer → value, unit, period.
              4. selectCitation(askJson, value) → the reference whose cited_text contains that
                 number → { excerpt, sourceId }. No matching reference → excerpt=null, sourceId=null.
              5. map sourceId → filing_id (the filing whose notebooklm_source_id == sourceId).
                 No mapping → fall back to a representative filing_id (documented; verifier will
                 then search all pages).
              6. `pnpm db stage '<json>'` with {filing_id, name, value, unit, period, excerpt,
                 notebooklm_source_id} status=pending. NEVER promotes.

[verify]    pnpm verify "Company"   — DETERMINISTIC pdfjs, integrity gate UNCHANGED + source-scoped
              for each pending staged metric:
                - if notebooklm_source_id maps to a filing → search ONLY that filing's PDF pages
                - else → search all of the company's PDF pages (back-compat fallback)
                - numeric-equality match (existing matchMetric, boundary regex) on the page text
                - found  → promote, trust='verified', source_page set
                - present in NLM answer but not text-confirmable (chart image) → trust='notebooklm-only'
                - absent → reject (quarantine in metrics_staging with reason)
            verifier.md = thin Haiku agent that runs `pnpm verify` and reports the trust breakdown.
```

## Components / units

- `src/notebooklm/cli.ts` — **new.** Thin typed wrappers over the `notebooklm` CLI via
  `execFile`: `nbCreate(title)`, `nbSourceAdd(notebookId, filePath)`, `nbSourceWait(notebookId, sourceId)`,
  `nbAsk(notebookId, question)`, `nbList()` (auth precheck). Each returns parsed JSON or throws a
  typed error. Single chokepoint for the CLI — keeps the rest of the code CLI-agnostic and testable
  (mock this module in unit tests).
- `src/notebooklm/parse-citations.ts` — **repurposed.** Replace the MCP-shaped `parseCitations`
  with `selectCitation(askJsonRaw: string, value: number): { excerpt: string|null, sourceId: string|null }`.
  Pure. Parses `notebooklm ask --json` output (`{ answer, references: [{source_id, cited_text, ...}] }`),
  returns the reference whose `cited_text` contains the value (numeric-equality, reusing the verifier's
  number tokenizer so "9,228"/"₹9,228 crore"/"9228" all match), else nulls. Drops nothing silently —
  a null excerpt is an honest "uncited", which the verifier handles.
- `src/cli/ingest.ts` — **rewritten.** From a thin preview helper to the deterministic ingest driver
  described above (calls `cli.ts` + db modules). Still exits non-zero on failure with a clear message.
- `src/db/filings.ts` + `schema.sql` — add `notebooklm_source_id TEXT` to `filings`. New helpers:
  `setFilingSourceId(db, filingId, sourceId)`, `getFilingBySourceId(db, companyId, sourceId)`.
- `src/db/metrics.ts` + `schema.sql` — add `notebooklm_source_id TEXT` to `metrics_staging`
  (keep `source_url`/`excerpt`). `stageMetric` persists it.
- `src/verifier/verify.ts` — source-scoping: resolve `notebooklm_source_id` → filing → pages;
  fall back to all company pages when unmapped. `matchMetric` itself is untouched.
- `src/db/migrate.ts` — two guarded `ALTER TABLE ... ADD COLUMN` steps (filings + metrics_staging),
  same `PRAGMA table_info` pattern already in place for `metrics.trust`.
- `.claude/agents/ingestor.md` — rewrite: drop all `mcp__notebooklm__*`; tools = `Bash, Read`;
  body runs `pnpm ingest "<Company>"`.
- `.claude/agents/extractor.md` — rewrite: drop `mcp__notebooklm__*`; tools = `Bash, Read`;
  body queries via `notebooklm ask --json` (through the agent's Bash) per metric, stages each.
- `.claude/agents/verifier.md` — unchanged behaviour (already a thin `pnpm verify` wrapper).
- `.claude/settings.local.json` — add `Bash(notebooklm:*)` and `Bash(pnpm:*)`; **remove** the dead
  `mcp__notebooklm__*` allow entries.

## Data / schema changes

```sql
ALTER TABLE filings         ADD COLUMN notebooklm_source_id TEXT;   -- guarded migration
ALTER TABLE metrics_staging ADD COLUMN notebooklm_source_id TEXT;   -- guarded migration
```

`notebooks` and `industry_metrics` are unchanged. `notebooks.notebook_id` now holds the CLI's
notebook UUID (already does after the manual E2E).

## Error handling

- **Auth expired / not logged in:** any CLI call fails → scripts detect via the `nbList()` precheck
  and exit non-zero with: "NotebookLM not authenticated — run `notebooklm login` once." This is the
  single human-facing CLI touch, framed as one-time setup.
- **Source upload fails / indexing stuck:** `nbSourceAdd`/`nbSourceWait` throws → `pnpm ingest`
  reports which filing failed and exits non-zero; already-mapped filings are skipped on re-run.
- **`ask` returns no usable number:** extractor stages nothing for that metric (a gap, not a guess).
- **No citation matches the value:** stage with `excerpt=null, notebooklm_source_id=null`; verifier
  falls back to all-pages search; if still unconfirmed → `notebooklm-only` or reject. Never silently trusted.
- **Verifier:** unchanged integrity gate, now source-scoped.

## Testing

- **Unit (Vitest, mock `src/notebooklm/cli.ts`):**
  - `selectCitation`: picks the right reference by value; "9,228"/"₹9,228 crore"/"9228" all match;
    returns nulls when no reference contains the value; ignores references for a different number.
  - ingest: persists `notebooklm_source_id` onto the correct filing; idempotent (skips mapped filings);
    reuses an existing notebook_id instead of creating a second notebook.
  - `getFilingBySourceId` round-trip.
  - verifier source-scoping: a number present only in PDF-A is `verified` when cited to A's source_id,
    and is **rejected** when cited to B's source_id (proves scoping tightens integrity); unmapped →
    all-pages fallback still works.
  - existing `matchMetric` / trust-promote tests stay green.
- **E2E (already proven by hand; re-run through the real scripts):** Asian Paints —
  `notebooklm login` once → scrape → `pnpm ingest` → extractor agent → `pnpm verify`. Confirm a real
  number promotes `verified`, a chart-only number lands `notebooklm-only`, a fabricated number is rejected.

## YAGNI / out of scope

- Next.js app, streaming coordinator, Observable Plot dashboards — later sub-projects (unchanged).
- The NotebookLM MCP server config in `~/.claude.json` — leave it installed but unused; not worth
  touching. No code references it after this pivot.
- No new metrics, no new trust levels — pure plumbing swap.
```

