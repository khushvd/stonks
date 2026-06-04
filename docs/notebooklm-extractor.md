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

# 4. Verify — deterministic, token-free gate (runs in TS; no PDF text touches an LLM)
pnpm verify "Asian Paints"
# (or via the agent wrapper, which just runs pnpm verify and reports: claude -p --agent verifier 'verify "Asian Paints"')

# 5. Read results
pnpm db summary                 # { verified, notebooklmOnly, pending, rejected }
pnpm db list-metrics            # the live, trusted table
```

The CLI helpers (`pnpm ingest`, `pnpm extract`) just print what the agents need; the agents do the
NotebookLM work. Verification is pure TS (`pnpm verify`) — no agent or tokens required. You can run any
helper directly to inspect state.

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
