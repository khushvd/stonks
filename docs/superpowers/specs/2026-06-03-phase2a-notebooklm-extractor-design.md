# Phase 2a — NotebookLM Extractor (Design)

**Date:** 2026-06-03
**Status:** Approved (brainstorm complete; ready for writing-plans)
**Scope:** Sub-project 1 of Phase 2 only. The Next.js app, streaming `claude -p`
coordinator, and Observable Plot dashboards are **out of scope** — each gets its
own spec → plan cycle later.

## Goal

Replace Phase 1's raw-pdfjs-text extraction with a NotebookLM-driven flow:
NotebookLM proposes numbers from the company's filings; the existing pdfjs Verifier
disposes (confirms against the cited source page). All CLI-driven and validated
end-to-end on Asian Paints before any UI is built.

## Why NotebookLM

pdfjs (and markitdown) extract investor decks as jumbled text — the numbers live in
chart images. NotebookLM OCRs/RAGs large + graphical docs (annual reports, investor
presentations) far better. It is the **proposer**; the Verifier stays the **disposer**.
No number reaches the live `metrics` table without passing the integrity gate.

## NotebookLM MCP — known constraints

Server: `github.com/PleasePrompto/notebooklm-mcp` (`claude mcp add notebooklm -- npx notebooklm-mcp@latest`).
Tools used: `add_notebook`, `list_notebooks`, `select_notebook`, `add_source`, `ask_question`.

- **No file upload.** `add_source` accepts only `type=url` (web crawl) or `type=text`
  (pasted). It cannot ingest a local PDF file. → We feed the **public BSE PDF URL**
  (`type=url`). Saves tokens and preserves chart OCR. Local PDF copies are retained
  for the Verifier only.
- **Notebooks registered by share-URL.** `add_notebook` takes a NotebookLM share-URL;
  there is no documented `create_notebook`. The ingestion agent attempts to auto-create
  a per-company notebook; if it cannot, it reports back and the user creates an empty
  notebook in the NotebookLM UI once and pastes the share-URL.
- **One-time auth.** First-ever run needs a visible-Chrome `setup_auth` Google login;
  cookies persist, subsequent runs are headless. Acceptable (one-time, not normal operation).
- **Citations.** `ask_question` with `source_format=json` returns structured citations
  (title + excerpt, optional URL). May not include a page number — the Verifier searches
  the local PDF pages for the cited excerpt/number to locate the page.

Risk accepted (locked 2026-06-03): build directly on the MCP, no upfront spike; fix
headless-auth / crawl / limit issues as they surface.

## Architecture

Three stages, all CLI-driven, each independently re-runnable:

```
[scraper]       deterministic Playwright script (Phase 1, UNCHANGED)
                  → downloads PDFs to data/<ticker>/, captures public BSE source_url

[ingest agent]  claude -p, NotebookLM MCP
                  → find/create company notebook (notebooks table, idempotent)
                  → add_source type=url for each filing's source_url
                  → on failure: report failed URLs, ask for manual add; non-zero exit

[extract agent] claude -p, NotebookLM MCP
                  → resolve industry-relevant metrics (NotebookLM-inferred, cached) +
                    universal base set + optional free-text request
                  → ask_question source_format=json → numbers + citation excerpts
                  → stage into metrics_staging (status=pending)

[verifier]      pdfjs on LOCAL pdf (Phase 1 gate, UNCHANGED disposer)
                  → cited excerpt/number found on a page → promote, trust='verified'
                  → number from NLM but not text-confirmable (chart image) → trust='notebooklm-only'
                  → not found at all → reject (quarantine in metrics_staging)
```

## Components / units

- `src/scraper/screener.ts` — unchanged. Already yields `source_url` + `local_path`.
- `src/db/notebooks.ts` — `upsertNotebook(companyId, url, notebookId)`, `getNotebook(companyId)`.
  Makes ingestion idempotent (don't re-create / re-add sources).
- `src/db/industry-metrics.ts` — `getIndustryMetrics(industry)`, `setIndustryMetrics(industry, metrics, source)`.
  Caches the inferred per-industry metric list; hand-editable.
- `src/db/metrics.ts` — extend `promoteMetric` to set `trust`. New listing reads expose `trust`.
- `src/notebooklm/parse-citations.ts` — parse `ask_question` `source_format=json` output into
  `{ value, unit, period, name, excerpt, sourceUrl? }[]`. Pure, unit-tested.
- `src/verifier/match.ts` — given a staged metric's excerpt/value and the local PDF page texts,
  decide verified | notebooklm-only | reject and the `source_page`. Pure, unit-tested.
- `.claude/agents/ingestor.md` — new agent (Sonnet; tools: NotebookLM MCP, Bash, Read).
- `.claude/agents/extractor.md` — rewritten to query NotebookLM instead of parsing PDF text.
- `.claude/agents/verifier.md` — unchanged behaviour; reads cited page via pdfjs.
- CLI: `src/cli/ingest.ts`, `src/cli/extract.ts` (canonical default; `--ask "free text"`).

## Data / schema changes

```sql
-- metrics + metrics_staging: trust level (explicit enum reads better on the dashboard)
ALTER TABLE metrics ADD COLUMN trust TEXT NOT NULL DEFAULT 'verified'
  CHECK(trust IN ('verified','notebooklm-only'));

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

Note: schema.sql is applied idempotently on `openDb`; the new tables use
`CREATE TABLE IF NOT EXISTS`. The `metrics.trust` column is added via a guarded
migration step (check `PRAGMA table_info` before `ALTER`) since `ALTER … ADD COLUMN`
is not idempotent.

## Metric resolution (canonical set)

1. **Universal base** (always, every company): revenue, PAT, EBITDA, EBITDA margin,
   EPS, total debt, PAT margin, debt/equity, market cap, ev/ebitda, ev. Stable dashboard columns, comparable across companies.
2. **Industry-specific** (e.g. hotels → occupancy / ARR; cement → logistics cost /
   realisation; BFSI → NPA / NIM): **NotebookLM infers** the decision-relevant metrics
   for the company's industry (it has the docs in context). Cached in `industry_metrics`
   on first sight of an industry, reused for peers, hand-editable.
3. **Free-text** (optional, `--ask`): ad-hoc request passed straight to NotebookLM.

## Error handling

- **Ingestion URL crawl fails:** log which `source_url`s failed, exit non-zero with a
  "manually add these to notebook X" message. Already-added sources are skipped (idempotent).
- **Notebook auto-create not possible:** report; user creates empty notebook in NotebookLM
  UI once and pastes the share-URL; ingestion proceeds.
- **NotebookLM unreachable / metric inference fails:** documented fallback — use Sonnet to
  infer the industry-metric list (stored with `source='sonnet'`). Flagged in the manual.
- **Verifier:** unchanged integrity gate. Not text-confirmable → `notebooklm-only` (stored,
  shown differently) or reject. Never silently trusted.

## Testing

- **Unit (Vitest, in-memory SQLite):** `trust` promote paths; `industry_metrics` cache
  get/set; `notebooks` upsert idempotency; `parse-citations` against a sample
  `source_format=json` payload; `verifier/match` (verified vs notebooklm-only vs reject).
- **E2E (manual, CLI-driven):** Asian Paints — `setup_auth` once → scrape → ingest →
  extract → verify. Confirm a real metric promotes as `verified`, a chart-only number
  lands as `notebooklm-only`, and a fabricated number is rejected. Mirrors the Phase 1
  proof run (`docs/superpowers/runs/2026-06-03-phase1-asianpaint.md`).

## Deliverable manual

`docs/notebooklm-extractor.md` — how to query the extractor:
one-time `setup_auth` → `scrape` → `ingest` → `extract` (canonical / `--ask`) → how to
read `verified` vs `notebooklm-only` in the output → the Sonnet-fallback note.

## YAGNI / out of scope

- Next.js app, streaming coordinator, Observable Plot dashboards — later sub-projects.
- Teacher agent — Phase 3.
- markitdown — not used (loses page boundaries); reserved for Office formats later.
- Annual reports — excluded by default (`--annual` opts in), as in Phase 1.
