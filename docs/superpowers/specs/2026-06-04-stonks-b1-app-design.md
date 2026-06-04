# Stonks B1 — Web App + Live Coordinator (design)

**Date:** 2026-06-04
**Status:** Approved (brainstorm), pending implementation plan
**Supersedes UI portion of:** `2026-06-03-investment-analysis-agents-design.md`
**Audience:** the agent building Phase-2's remaining UI work.

## Goal

A local, single-analyst web app where the user never touches a terminal. The user opens the
app (one double-click), types a **company + a plain-text ask**, hits **Run**, and watches the
agent pipeline work live, then reads a trustworthy dashboard. This is the **B1 slice** of the
full chat+dashboard vision (called "B"): a single-turn trigger with live streaming, not yet a
multi-turn conversation.

## North star — why this is NOT a reverse-engineered screener

screener.in already shows numbers. If all this app did was re-scrape and re-display them, it
would be strictly worse than screener. The product only earns its existence through two things
screener cannot do, and **both must be visible in the UI**:

1. **A verification/trust layer.** Every number carries a trust level — `verified` (confirmed on
   its source PDF page by the deterministic pdfjs gate) vs `notebooklm-only` (proposed by
   NotebookLM, e.g. read off a chart image, but not text-confirmable). Rejected numbers are
   quarantined and shown *as quarantined*, with the reason. Screener gives you a number; stonks
   tells you **whether to trust it and why**. This is the headline feature, not a footnote.
2. **Cross-document narrative synthesis (future, B-full).** NotebookLM can answer "what did
   management say about pricing across the last 4 concalls?" — narrative, multi-document Q&A that
   a metrics table cannot express. B1 lays the rails (the `ask` field, the coordinator) but the
   conversational synthesis lands in B-full.

**Design implication for B1:** the trust UX is the centerpiece, not the metrics table. If a
reviewer can't tell at a glance which numbers are confirmed and which aren't, B1 has failed its
reason to exist.

## Constraints (inherited, non-negotiable)

- **Subscription-only billing.** Agents run as `claude -p` headless sessions on the Max
  subscription. No raw Agent SDK, no pay-as-you-go API credits.
- **No terminal for the user.** The only launch action is double-clicking `Stonks.command`.
- **Cheap models only.** Haiku/Sonnet. No Opus.
- **Data integrity is non-negotiable.** No number reaches the live `metrics` table without
  passing the Verifier against its source PDF. Quarantine in `metrics_staging` by default.

## Scope — B1

### In scope

- A double-clickable launcher with a plain-English preflight check.
- A single-page web app (Layout A: left control rail, right dashboard).
- A **single-turn** run: `{company, ask}` → **Run** → live progress feed → dashboard.
- Live streaming of coordinator/agent progress to the browser.
- A read-only dashboard: company header, integrity summary tile, metrics table with
  **verified / notebooklm-only** badges, source-page citation links, and a rejects/quarantine panel.
- The coordinator runs a **fixed chain** (scrape → ingest → extract → verify → summarize). The
  `ask` shapes the closing summary; it does not yet freely choose which agents run.

### Out of scope (YAGNI for B1; most are B-full)

- Multi-turn chat, follow-ups, refine/re-ask (B-full).
- Teacher agent (industry tutoring / brainstorm).
- Multi-company or industry comparison dashboards.
- Free interpretation of arbitrary asks into dynamic agent plans.
- Menu-bar / fully-windowless app wrapper (the small background Terminal window is accepted for B1).
- Auth, multi-user, hosting/deploy (local only).
- Rich chart grids (see "Charts" below — table-first, ≤1 chart).

## Substrate / stack

- **Next.js (App Router), Node runtime only.** `better-sqlite3` is synchronous and native — it
  cannot run on the edge runtime. All DB access is in route handlers / server components marked
  Node.
- **SQLite** via existing `src/db` helpers. No raw SQL in the app layer.
- **Streaming: Server-Sent Events** (a Next route handler returning a `ReadableStream`), not
  WebSockets. Progress is one-directional (agent → browser); SSE is the simpler correct tool.
  WebSockets would be overkill and add reconnect/handshake complexity for no benefit in B1.
- **NotebookLM** via the standalone `notebooklm` CLI (already wired in the extractor; the app
  never calls it directly — the coordinator/agents do).
- **Charts: Observable Plot**, used sparingly (see below).
- ESM TypeScript, pnpm, Vitest. Consistent with the existing repo.

## Architecture — six isolated units

Each unit has one purpose, a defined interface, and is testable in isolation.

### 1. Launcher — `scripts/stonks.command`
- macOS double-clickable shell script.
- **Preflight** (plain-English failures, no stack traces): `claude` on PATH? `notebooklm` auth
  file present (`~/.notebooklm/storage_state.json`)? deps installed (`node_modules`)? If any fail,
  print a one-line human instruction and stop.
- On success: start the Next server and open `http://localhost:<port>` in the default browser.
- A small background Terminal window remains visible while running — accepted for B1.

### 2. `/api/run` — spawn + stream the coordinator
- `POST { company, ask }`.
- Spawns `claude -p "<coordinator prompt>" --output-format stream-json` as a child process via
  the spawn wrapper (unit 4).
- Returns an **SSE stream** of typed `AgentEvent`s to the browser.
- On subprocess error / non-zero exit: emit a terminal `error` event naming the failed step; do
  **not** blank the dashboard.

### 3. `src/coordinator/stream.ts` — stream-json parser (pure)
- Pure function(s): one raw `stream-json` line → a typed `AgentEvent`
  (`{ kind: 'step'|'tool'|'text'|'error'|'done', ... }`).
- No I/O, no subprocess. **Unit-tested against captured stream-json fixtures.** This is the
  fiddliest logic in B1, so it is isolated from spawning entirely.

### 4. `src/coordinator/run.ts` — spawn wrapper
- Wraps child-process spawning behind an **injectable `Spawner`** interface (mirrors the
  `notebooklm` `Runner` pattern). Returns an async iterator of `AgentEvent`s (uses unit 3 to parse).
- Tests inject a fake spawner emitting canned stream-json lines and assert the event sequence —
  no real `claude -p` call in unit tests.

### 5. `/api/dashboard` — read-only dashboard data
- `GET ?company=<name>`.
- Reuses `getCompany`, `listFilings`, `listMetrics`, `listStaging`, `integritySummary` from
  `src/db`. No raw SQL.
- Returns `{ company, integrity, metrics[], rejects[], filings[] }`.

### 6. UI components
- `ControlRail` — company input, ask textarea, **Run** button, and the live progress feed
  (consumes the SSE stream, renders `AgentEvent`s as a checklist: scrape → ingest → extract → verify).
- `Dashboard` — `CompanyHeader`, `IntegrityTile` (verified / notebooklm-only / pending / rejected
  counts), `MetricsTable`, `RejectsPanel`.
- `MetricsTable` — rows with a **TrustBadge** (`verified` green vs `notebooklm-only` amber, never
  visually equal) and a `Citation` link.
- `RejectsPanel` — quarantined rows with `reject_reason` + `excerpt` (the integrity story).
- `Citation` — opens the source PDF at the cited page (`local_path#page=N`).

## Data flow

```
company + ask
  → POST /api/run
    → spawn  claude -p <coordinator> --output-format stream-json   (unit 4)
      → coordinator runs scrape → ingest → extract → verify → summarize   (existing agents)
         (writes metrics_staging, promotes to metrics in stonks.db)
    → stream.ts parses each line → AgentEvent                        (unit 3)
  → SSE → ControlRail progress feed updates live
  → on 'done' → browser GET /api/dashboard?company=…                 (unit 5)
    → Dashboard renders integrity tile + metrics (trust badges) + rejects
```

## Error handling & integrity

- **Preflight** (launcher) catches the common "it won't start" causes in plain English.
- **Subprocess failure:** surface `run failed at step X` in the feed; keep the last good
  dashboard rendered (never blank on error).
- **Scrape/network failures:** the existing scrape script retries with backoff; the coordinator
  surfaces "couldn't fetch X" rather than leaving silent gaps.
- **Integrity gate unchanged:** nothing leaves `metrics_staging` for `metrics` without the
  Verifier confirming the number on its source page. `notebooklm-only` rows are stored but visibly
  flagged. Rejected rows never reach `metrics`.

## Testing strategy

- `stream.ts`: unit tests over **real captured stream-json fixtures** (happy path + a tool-use
  line + an error line + the final done line).
- `run.ts`: inject a fake `Spawner`; assert the emitted `AgentEvent` sequence end to end without
  shelling out.
- `/api/dashboard`: seed an `:memory:` SQLite DB; assert the JSON shape and that the trust split
  (verified vs notebooklm-only vs rejected) is correct.
- UI components: assert `verified` and `notebooklm-only` **render differently** (badge/color),
  integrity tile counts match, rejects panel shows reason + excerpt.
- All **71 existing tests stay green**; `pnpm exec tsc --noEmit` clean.
- **Manual E2E (golden path):** double-click `Stonks.command` → app opens → Run "Asian Paints"
  with a sample ask → progress feed streams the four steps → dashboard renders the 3 existing
  verified metrics (revenue, pat, ebitda_margin, all p28) with VERIFIED badges and working
  p28 citation links.

## Charts

Observable Plot, used sparingly. For B1 the **metrics table + integrity tile are the core**.
Ship **at most one** chart (e.g. a margin-trend line) and only when the ask warrants it — not a
chart grid. Charts are polish; the trust table is the product. Richer visualization is a B-full /
Phase-3 concern.

## Future scope (explicitly out of B1)

- **B-full:** multi-turn conversational chat that refines, re-asks, adds companies mid-conversation,
  and surfaces NotebookLM **cross-document narrative synthesis** (the second pillar of the north
  star). B1's `ask` field + coordinator are the rails this builds on.
- **Teacher agent:** on-demand industry-metric tutoring + brainstorm.
- **Multi-company / industry comparison** dashboards and small-multiples.
- **Menu-bar app wrapper** to remove the background Terminal window.

## Open questions

None blocking. Resolved during brainstorm: target = full B (B1 first); one-click launcher with a
visible background window accepted; coordinator runs a fixed chain for B1; charts table-first
(≤1 chart); Layout A (two-pane) chosen.
