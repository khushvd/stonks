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

1. **Pipeline-first (current):** agent pipeline + Playwright scraper + SQLite, CLI-driven.
   Prove scrape → extract → verify → store on ONE company end-to-end. No UI yet.
2. **App + dashboards:** Next.js app, streaming `claude -p` coordinator, Observable Plot dashboards.
3. **NotebookLM + Teacher:** wire the NotebookLM MCP for the document corpus (narrative Q&A)
   and add the on-demand Teacher agent. NotebookLM is deliberately deferred to here — the core
   numeric pipeline must be proven first.

Scraping is a deterministic Playwright script invoked by the Extractor via Bash (reproducible,
testable, token-cheap) — agents orchestrate, the script fetches.
