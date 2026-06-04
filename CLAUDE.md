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

Next.js app (localhost:4317) → `/api/run` spawns one `claude -p` Coordinator → Coordinator runs a
FIXED pnpm chain (scrape → ingest → extract → verify → db summary) via Bash, streaming stream-json
back over SSE → read-only trust dashboard. Data: SQLite (structured metrics) + NotebookLM (document
corpus, via the `notebooklm` CLI) + filesystem (raw PDFs).

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
pnpm scrape "<Company>"         # Playwright → screener.in → PDFs + filings rows
pnpm ingest "<Company>"         # upload filing PDFs into the company's NotebookLM notebook (idempotent)
pnpm -s extract "<Company>" "<ask>"   # build the extractor payload (use -s: pnpm banner pollutes JSON stdout)
pnpm verify                     # deterministic pdfjs integrity gate over staged metrics
pnpm db <subcommand>            # db utilities incl. `select-citation` (deterministic citation picker)
open scripts/stonks.command     # double-click launcher: preflight → build → start → open browser
```

The extractor agent calls `notebooklm ask ... --json` directly (proposer); `pnpm verify`
disposes against the source PDF. All `notebooklm`/`pnpm` calls are allow-listed in
`.claude/settings.local.json`.

**Dev hazard:** hitting `/api/run` (the Run button) spawns a REAL, billable `claude -p` run that
mutates `data/stonks.db` (scrape + promote). When developing the UI, point it at a fake binary:
`CLAUDE_BIN=/tmp/fakebin/claude pnpm dev` (a stub that emits a couple of stream-json lines). Kill
stray dev servers on the fixed port first: `lsof -ti tcp:4317 | xargs kill`.

## Code map

- `src/notebooklm/` — `cli.ts` (typed wrappers over the `notebooklm` binary, injectable `Runner`),
  `parse-citations.ts` (`selectCitation` — picks the backing reference by numeric equality)
- `src/verifier/` — `match.ts` (`extractNumbers` tokenizer + `pageHasValue`), `verify.ts` (source-scoped gate)
- `src/db/` — schema + per-table helpers; `migrate.ts` guarded ALTERs
- `src/scraper/`, `src/pdf/`, `src/extract/`, `src/cli/` — Playwright, pdfjs text, canonical metric list, CLI entrypoints
- `src/coordinator/` — `stream.ts` (pure stream-json→`AgentEvent` parser), `prompt.ts` (injection-guarded
  fixed-chain prompt builder), `run.ts` (injectable `Spawner`, AbortSignal→kill so a disconnect never
  orphans a billable run), `types.ts`
- `src/dashboard/` — `trust.ts` (badge/integrity-chip presentation), `citation.ts` (traversal-hardened
  PDF path resolver + `#page=N` href), `data.ts` (`getDashboard` shaping over `src/db`, NO raw SQL)
- `app/` — Next.js App Router. `api/{dashboard,pdf,run}/route.ts` (all `runtime="nodejs"`; `run` is the
  SSE coordinator stream), `components/*.tsx` (trust dashboard, control rail, live progress feed,
  margin chart), `page.tsx` (Layout-A two-pane). `scripts/stonks.command` = the launcher.

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
   - **B1 web app: DONE (2026-06-05), merged to `main`.** Next.js app (`app/`), streaming `claude -p`
     coordinator over SSE (`src/coordinator/`), trust-aware read-only dashboard + ≤1 Observable Plot
     chart (`src/dashboard/`, `app/components/`), double-clickable launcher. Single-turn `{company,
     ask}` → Run → live feed → dashboard. 103 tests green; manual golden-path E2E verified.
     Spec: `docs/superpowers/specs/2026-06-04-stonks-b1-app-design.md`; plan: `.../plans/2026-06-04-stonks-b1-app.md`.
   - **Next: B-full** — multi-turn conversational chat that refines/re-asks/adds companies and surfaces
     NotebookLM cross-document narrative synthesis. B1 built the rails (`ask` field, coordinator, SSE).
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
