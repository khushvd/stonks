# Investment Analysis Agent System — Design

**Date:** 2026-06-03
**Status:** Approved (brainstorm), pending implementation plan

## Goal

A local, single-analyst tool for investment research. You plug in companies / industries
plus a plain-text request; a coordinator agent dispatches specialized agents to extract
data from screener.in, verify it against source, store it, and present it as dashboards.
A teacher agent is invokable on demand to get you up to speed on an industry's metrics and
to brainstorm.

## Constraints

- **Subscription-only billing.** No pay-as-you-go API credits. Achieved by running agents
  as Claude Code headless sessions (`claude -p`) on the Max subscription, not the raw Agent SDK.
- **No terminal use.** Interaction is through a local web UI.
- **Data integrity over speed.** Investment decisions can't ride on hallucinated numbers;
  verification is a first-class step, not optional.
- **Cheap models.** Haiku/Sonnet only, no Opus.

## Substrate

- **Local Next.js app** on `localhost`. Chat panel + dashboard panels.
- Backend API routes spawn a **single `claude -p` coordinator session** as a subprocess and
  stream its output (`--output-format stream-json`) to the browser.
- The coordinator uses Claude Code's **native Task dispatch** to spawn the other agents as
  subagents — the app does NOT spawn separate subprocesses per agent.
- Each agent is a definition file in `.claude/agents/*.md` with its model set in frontmatter.

## Agents

| Agent        | Model  | Responsibility |
|--------------|--------|----------------|
| Coordinator  | Sonnet | Parse request + targets (companies/industries), plan, dispatch agents, assemble the answer |
| Extractor    | Haiku  | Scrape screener.in, download presentations/results PDFs, parse, stage structured metrics, push docs to NotebookLM |
| Verifier     | Sonnet | Re-check every staged number against the source PDF/page; promote verified rows, reject the rest |
| Dashboarder  | Sonnet | Read SQLite, decide which charts/comparisons matter, emit a dashboard spec (JSON) |
| Teacher      | Sonnet | On-demand. Tutor on an industry's key metrics + brainstorm; query NotebookLM + SQLite + web |

## Data layer

- **SQLite** — structured metrics. Tables (sketch):
  - `companies` (id, name, ticker, industry)
  - `filings` (id, company_id, type [presentation|result|annual_report], period, source_url, local_path)
  - `metrics` (id, filing_id, name, value, unit, period, source_page) — **verified data only**
  - `metrics_staging` (same shape as `metrics` + status [pending|rejected], reject_reason) — verifier promotes from here
- **NotebookLM** (via existing MCP) — document corpus for narrative cross-document Q&A
  ("ask across all of company X's last 4 concalls").
- **Filesystem** — raw downloaded PDFs. The verifier's source of truth.

## Data flow

```
your request (targets + plain text)
  → Coordinator (plan)
    → Extractor   (scrape screener → download PDFs → parse → metrics_staging + NotebookLM)
    → Verifier    (each staged number vs source PDF → promote to metrics, or reject)
    → Dashboarder (read SQLite → emit dashboard spec JSON)
  → App renders charts from spec + SQLite
```

## Error handling & integrity

- **Quarantine by default.** Nothing reaches the live `metrics` table until verified.
  Rejected numbers stay in `metrics_staging` flagged for re-extraction or manual review.
- **Scraping failures** retry with backoff; surface "couldn't fetch X" rather than leaving silent gaps.
- **Per-run integrity summary.** Verifier reports N verified / M rejected so a dashboard is
  never trusted blindly.

## Out of scope (v1, YAGNI)

- Multi-user / auth
- Hosting / deployment (local only)
- Real-time alerts or scheduled refresh
- Portfolio tracking / position management

Solo-analyst local tool first. Validate, then expand.

## Open questions / deferred

- Scope default (e.g. "Indian listed equities") vs fully request-driven — currently left
  request-driven; coordinator infers from targets.
- screener.in login: a dedicated account will be created if scraping requires auth.
- Dashboard chart library choice — deferred to the dashboard implementation task.
