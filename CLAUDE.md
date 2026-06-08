# stonks — Investment Analysis Agent System

Local, single-analyst investment research tool. Plug in a company + a plain-text request; a
bounded planner proposes the analysis shape, the user confirms peers, and a deterministic
executor scrapes, verifies, stores, reviews, and presents dashboards.

Full design: `docs/superpowers/specs/2026-06-03-investment-analysis-agents-design.md`

## Hard constraints

- **Subscription-only.** The only LLM call in the current bounded app is the cheap planner in
  `src/planner/run.ts`. It runs as a subscription-backed headless CLI session: Claude by default,
  with planned/manual Codex fallback there if Claude limits are exhausted. Do NOT introduce the raw
  Agent SDK or anything that bills pay-as-you-go API credits.
- **No terminal for the user.** All interaction is through the local Next.js web UI.
- **Cheap models only.** Planner defaults should stay Haiku/Sonnet-class for Claude and mini-class
  for Codex fallback. No Opus or high-reasoning personal defaults.
- **Data integrity is non-negotiable.** No number reaches the live `metrics` table without
  passing the Verifier against its source PDF. Quarantine in `metrics_staging` by default.

## Architecture (one-liner)

Next.js app (localhost:4317) → `/api/plan` runs one bounded planner (`src/planner/run.ts`) that
returns typed JSON only → user confirms/edits exactly 3 peers → `/api/run` streams a deterministic
TypeScript executor (`src/executor/run.ts`) over SSE. Executor commands are fixed: scrape main company
and confirmed peers with explicit `--name`/`--slug` plus `--annual --per-type 4`, ingest each company
into its own NotebookLM notebook, synthesize the main-company brief, extract a peer sector-KPI pack,
verify staged numbers for every company, then summarize DB state. Dashboard shows the cited research
brief, sector KPI matrix (including expected-but-missing rows), peer notebook coverage, trust evidence,
and deterministic reviewer findings. Data: SQLite + NotebookLM CLI + filesystem PDFs.

**Pivot warning:** the app no longer runs the old coordinator LLM for `/api/run`. `src/coordinator/*`
is legacy compatibility/testing code. Any provider fallback, model selection, or fake-binary work for
the live app must target `src/planner/run.ts` and `scripts/stonks.command`, not `src/coordinator/run.ts`.

## Stack

Next.js + SQLite (local, better-sqlite3). NotebookLM via the standalone `notebooklm` Python CLI
(on PATH, auth in `~/.notebooklm/storage_state.json`) — NOT the MCP. pdfjs-dist for page-aware
source rechecks. Playwright for scraping. Vitest + tsx (TypeScript ESM). Agents in `.claude/agents/*.md`.

## Commands

```bash
pnpm test                       # vitest run — full suite (must stay green before any commit)
pnpm exec tsc --noEmit          # typecheck
pnpm build                      # next build (must pass before any commit touching app/)
pnpm dev                        # next dev on :4317  (app UI)
pnpm scrape --name "<Company>" --slug <SCREENER> --annual --per-type 4  # default bounded notebook scope
pnpm ingest "<Company>"         # upload filing PDFs into the company's NotebookLM notebook (idempotent)
pnpm synthesize "<Company>" "<ask>"   # NotebookLM → cited research brief (proposer; verifier disposes embedded numbers)
pnpm peer-kpis "<Company>" --ask "<ask>" --companies "Main,Peer1,Peer2,Peer3"  # per-company notebooks → expected sector KPI pack
pnpm -s extract "<Company>" --ask "<ask>"   # build the extractor payload (use -s: pnpm banner pollutes JSON stdout)
pnpm verify "<Company>"         # deterministic pdfjs integrity gate over staged metrics
pnpm db <subcommand>            # db utilities incl. `select-citation` (deterministic citation picker)
open scripts/stonks.command     # double-click launcher: preflight → build → start → open browser
```

The extractor agent calls `notebooklm ask ... --json` directly (proposer); `pnpm verify`
disposes against the source PDF. `src/executor/run.ts` invokes fixed `pnpm` scripts directly and does
not ask an LLM to choose commands.

**Dev hazard:** hitting `/api/plan` spawns the real planner LLM in `src/planner/run.ts`. Hitting
`/api/run` mutates `data/stonks.db` through deterministic scripts (scrape + promote), but does not ask
an LLM to choose commands. When developing the UI, point the planner at a fake binary through the
planner runner env, not the legacy coordinator env. Kill stray dev servers on the fixed port first:
`lsof -ti tcp:4317 | xargs kill`.

**Provider fallback rule:** do not set only `COORDINATOR_PROVIDER` and expect the bounded app to change
providers. The live LLM path is the planner. If adding/fixing Codex fallback, add tests around
`src/planner/run.ts`, verify `/api/plan`, and update this doc plus `scripts/stonks.command` together.

## Code map

- `src/notebooklm/` — `cli.ts` (typed wrappers over the `notebooklm` binary, injectable `Runner`),
  `parse-citations.ts` (`selectCitation` — picks the backing reference by numeric equality)
- `src/verifier/` — `match.ts` (`extractNumbers` tokenizer + `pageHasValue`), `verify.ts` (source-scoped gate)
- `src/db/` — schema + per-table helpers; `migrate.ts` guarded ALTERs; `briefs.ts` (`saveBrief`/`getLatestBrief`);
  `company-kpi-status.ts` stores expected-but-missing/failed KPI cells without faking metric rows
- `src/synthesis/` — `types.ts` (Brief/Claim/BriefRef), `prompt.ts` (injection-guarded analyst-frame question builder),
  `brief.ts` (defensive JSON parser, prose/fence tolerant), `stage.ts` (stage claim numbers for the verifier)
- `src/scraper/`, `src/pdf/`, `src/extract/`, `src/cli/` — Playwright, pdfjs text, canonical metric list,
  resolver-backed scrape CLI, entrypoints incl. `synthesize.ts` (NotebookLM → brief → stage → persist)
- `src/planner/` — bounded planner prompt/parser/runner; typed JSON only, exactly 3 peers, no command invention.
  This is the live LLM/provider boundary for the app.
- `src/executor/` — fixed script chain streamed as `AgentEvent`s; peer scrape/ingest/KPI extraction included for benchmarks
- `src/peer-kpis/` — NotebookLM prompt/parser/runner for expected sector KPIs per company notebook
- `src/reviewer/` — deterministic review findings over dashboard data (weak citations, missing evidence,
  bad peers, rejected metrics, unverified numeric claims)
- `src/coordinator/` — legacy stream-json parser/spawn tests retained for compatibility only; do not use
  for the current app execution path or provider fallback decisions.
- `src/dashboard/` — `trust.ts` (badge/integrity-chip presentation), `citation.ts` (traversal-hardened
  PDF path resolver + `#page=N` href + page-less `buildSourceHref`), `data.ts` (`getDashboard` shaping over
  `src/db`, NO raw SQL — now includes `BriefView` with resolved source links + trust badges),
  `sector-kpis.ts` and `comparison.ts` build the expected sector KPI matrix and peer notebook coverage
- `app/` — Next.js App Router. `api/{plan,dashboard,pdf,run}/route.ts` (all `runtime="nodejs"`; `plan`
  is the bounded planner, `run` is deterministic SSE execution), `components/*.tsx` (ControlRail,
  Dashboard for the plan/confirm/run flow; `components/briefing/` for the BriefingApp), `page.tsx`
  (two-step plan/confirm/run). Dashboard shows the cited research brief as a 7-chapter scrollytelling
  "Company Briefing" (`app/components/briefing/BriefingApp.tsx`) — driven by mock data for now; real-data
  wiring is the open seam in `adapter.ts`. `scripts/stonks.command` = the launcher.

## Build phases

1. **Pipeline-first (DONE):** Playwright scraper + SQLite + pdfjs + agent defs, CLI-driven.
   Scrape → extract → verify → store proven end-to-end on Asian Paints. 10 tests green.
2. **NotebookLM-driven extraction + app + dashboards:** the extractor stops parsing raw PDF text
   and instead queries **NotebookLM** (it OCRs/RAGs large + graphical docs — ARs, investor decks —
   far better than pdfjs). NotebookLM is the *proposer*; the **Verifier stays the disposer**: it
   pulls the cited page (pdfjs) and confirms the number.
   - **Extraction + trust-aware verifier via the `notebooklm` CLI: DONE (2026-06-04).** Ingestor +
     Extractor agents, source-scoped verifier, verified/notebooklm-only/reject trust model — proven
     E2E on Asian Paints. See `docs/superpowers/runs/2026-06-04-cli-pivot-asianpaint.md`.
   - **B1 web app: DONE (2026-06-05), merged to `main`.** Historical coordinator-based app. Do not
     use this as the current execution model for `/Users/khush/stonks-bounded-analyst`; the bounded
     planner/executor refactor below supersedes it for live app flow.
     Spec: `docs/superpowers/specs/2026-06-04-stonks-b1-app-design.md`; plan: `.../plans/2026-06-04-stonks-b1-app.md`.
   - **Cited research brief: DONE (2026-06-05).** `pnpm synthesize` step added to the historical fixed chain
     (scrape → ingest → **synthesize** → extract → verify → db summary). `briefs` table, `src/synthesis/`
     (types, prompt, parser, stager), `BriefPanel` as the dashboard headline. Evidence metrics scoped to
     brief-referenced ∪ universal core. 125 tests green.
     Spec: `docs/superpowers/specs/2026-06-05-stonks-research-brief-design.md`; plan: `.../plans/2026-06-05-stonks-research-brief.md`.
     **Later superseded:** the deterministic `screener` trust tier and nullable `metrics.filing_id` are now
     implemented; screener-table numbers attach by `company_id` and skip the PDF gate by design.
   - **Bounded autonomous analyst refactor: DONE (2026-06-06) in `/Users/khush/stonks-bounded-analyst`.**
     Added deterministic company resolution (`Asian Paints` → `ASIANPAINT`), `/api/plan` JSON planner,
     plan/confirm UI with editable 3-peer set, deterministic `/api/run` executor, peer benchmark wiring,
     and inline reviewer findings. The old coordinator agent is deprecated for app execution.
   - **Peer Notebook Briefing Pack: DONE (2026-06-07) in `/Users/khush/stonks-bounded-analyst`.**
     Each confirmed peer now gets its own NotebookLM notebook using the bounded default source scope
     (latest AR + last 4 presentations/results/concall docs where available). `pnpm peer-kpis` extracts
     expected sector KPI packs from each company notebook; expected sector KPIs always render as rows,
     including `Missing` cells (e.g. hotel RevPAR), with peer notebook coverage cards and a probe-deeper
     affordance. Spec: `docs/superpowers/specs/2026-06-06-peer-notebook-briefing-pack-design.md`.
   - **Scrollytelling Company Briefing dashboard: DONE (2026-06-09, mock-data).** 7-chapter answer-first
     briefing (Overview → Margins → Financials → Peers → Management → Risks → Provenance) with fixed rail,
     scroll-spy, keyboard nav, per-chapter detail drawers, hand-rolled SVG charts, and warm-gold IBM Plex
     theme app-wide. Real-data adapter seam is `app/components/briefing/adapter.ts` (`toBriefingData()`) —
     wire-up deferred to follow-up plan.
   - **Provider fallback tech debt (OPEN, 2026-06-06):** Codex fallback was mistakenly added to legacy
     `src/coordinator/run.ts`, but the live bounded app uses `src/planner/run.ts`. Fix provider fallback
     at the planner boundary before relying on `COORDINATOR_PROVIDER=codex` or any replacement env.
   - **Next: B-full** — multi-turn conversational chat that refines/re-asks/adds companies and surfaces
     NotebookLM cross-document narrative synthesis. The new planner/executor rails are the starting point.
     Not started; needs its own brainstorm→spec→plan.
3. **Teacher + polish:** on-demand Teacher agent (industry metrics tutoring + brainstorm), refinement.

### Phase 2 design decisions (locked 2026-06-03)
- **Verification trust levels:** add a `verified` flag to metrics. Source-confirmed (number found
  on cited page) = `verified`. NotebookLM-only / chart-image numbers that can't be text-confirmed =
  `notebooklm-only` — STORED but shown differently on the dashboard. Never silently trust NotebookLM.
- **NotebookLM access:** originally the MCP; **pivoted to the standalone `notebooklm` CLI on
  2026-06-04** (see `docs/superpowers/specs/2026-06-04-notebooklm-cli-pivot-design.md`) — the CLI's
  `--json` output is deterministic and shell-testable, sidestepping MCP-in-headless auth fragility.
  The extractor calls `notebooklm ask` (proposer); the verifier disposes against the cited PDF.
- pdfjs (page-aware) is retained for the verifier's source-page rechecks — integrity-critical.
- **markitdown:** NOT used in Phase 1 (loses page boundaries the integrity gate needs; only ~19%
  more text on decks). Reserve for Office formats (pptx/xlsx/docx) if needed later.

Scraping is a deterministic Playwright script invoked by the Extractor via Bash (reproducible,
testable, token-cheap) — agents orchestrate, the script fetches.
