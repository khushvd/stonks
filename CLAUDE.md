# stonks — Investment Analysis Agent System

Local, single-analyst investment research tool. Plug in companies/industries + a plain-text
request; a coordinator agent dispatches specialized agents to extract data from screener.in,
verify it, store it, and present dashboards.

Full design: `docs/superpowers/specs/2026-06-03-investment-analysis-agents-design.md`

## Hard constraints

- **Subscription-only.** Agents run as Claude Code headless sessions (`claude -p`) on the Max
  subscription. Do NOT introduce the raw Agent SDK or anything that bills pay-as-you-go API credits.
- **No terminal for the user.** All interaction is through the local Next.js web UI.
- **Cheap models only.** Haiku/Sonnet. No Opus.
- **Data integrity is non-negotiable.** No number reaches the live `metrics` table without
  passing the Verifier against its source PDF. Quarantine in `metrics_staging` by default.

## Architecture (one-liner)

Next.js app (localhost) → spawns one `claude -p` Coordinator → Coordinator uses native Task
dispatch to run Extractor (Haiku), Verifier, Dashboarder, Teacher (Sonnet). Data: SQLite
(structured metrics) + NotebookLM MCP (document corpus) + filesystem (raw PDFs).

## Stack

Next.js + SQLite (local). NotebookLM via MCP. Agents defined in `.claude/agents/*.md`.

## Build phases

1. **Pipeline-first (DONE):** Playwright scraper + SQLite + pdfjs + agent defs, CLI-driven.
   Scrape → extract → verify → store proven end-to-end on Asian Paints. 10 tests green.
2. **NotebookLM-driven extraction + app + dashboards:** the extractor stops parsing raw PDF text
   and instead queries the **NotebookLM MCP** (it OCRs/RAGs large + graphical docs — ARs,
   investor decks — far better than pdfjs). NotebookLM is the *proposer*; the **Verifier stays
   the disposer**: it pulls the cited page (pdfjs) and confirms the number. Then the Next.js app
   + streaming `claude -p` coordinator + Observable Plot dashboards.
3. **Teacher + polish:** on-demand Teacher agent (industry metrics tutoring + brainstorm), refinement.

### Phase 2 design decisions (locked 2026-06-03)
- **Verification trust levels:** add a `verified` flag to metrics. Source-confirmed (number found
  on cited page) = `verified`. NotebookLM-only / chart-image numbers that can't be text-confirmed =
  `notebooklm-only` — STORED but shown differently on the dashboard. Never silently trust NotebookLM.
- **NotebookLM MCP:** build the extractor directly on it (no upfront spike); fix integration issues
  as they surface. Risk accepted: MCP auth in headless runs, per-notebook source limits, latency.
- pdfjs (page-aware) is retained for the verifier's source-page rechecks — integrity-critical.
- **markitdown:** NOT used in Phase 1 (loses page boundaries the integrity gate needs; only ~19%
  more text on decks). Reserve for Office formats (pptx/xlsx/docx) if needed later.

Scraping is a deterministic Playwright script invoked by the Extractor via Bash (reproducible,
testable, token-cheap) — agents orchestrate, the script fetches.
