# AUTONOMOUS EXECUTION DIRECTIVE — read this first on every scheduled wake

> Khush set a **goal-mode directive** on 2026-06-05: build the **fully working system**, no
> deferring, while he sleeps. He is frustrated that 2 days produced nothing he couldn't get from
> claude.ai. The bar is a working tool that **levels up his analysis into a NEW industry** — tells
> him *what to look at, where, and how* — and saves him time. Treat this as the definition of done.

## The north star (what "working" means)

A user enters a company (eventually a few) + a question and gets back, in the local web app:

1. **A cited research brief** — the read of the concall transcripts + filings he has no time to do:
   the direct answer, management guidance, what moved margins, risks/red-flags, and the
   **industry-specific KPIs** (RevPAR, SSSG, AUM, ARPU…) — every claim citation-linked, every
   embedded number disposed by the Verifier (green/amber).
2. **An evidence dashboard** beneath it — the numbers as supporting evidence, incl. **multi-period
   trends** (this fixes "it only showed last quarter") and **competitor benchmarking** when more
   than one company is loaded.
3. **Industry learning** — the system surfaces *which* metrics matter for this industry and why, so
   Khush can walk into a new sector knowing where to look. This is the actual product value.

This is Phases 1+2+3 of `docs/superpowers/specs/2026-06-05-stonks-research-brief-design.md` plus the
industry-learning layer. **Build all of it. Do not defer the screener trusted-number tier, multi-
period trends, benchmarking, concall analysis, or the industry layer.** They are the point.

## Hard constraints (never violate, even autonomously)

- **Subscription-only:** agents run as `claude -p` headless. No raw Agent SDK / pay-as-you-go API.
- **Cheap models only** (Haiku/Sonnet) for the spawned coordinator. No Opus in the pipeline.
- **Integrity gate stays** for every NotebookLM-proposed number (Verifier vs cited PDF page).
  Screener-scraped numbers get `trust='screener'` (deterministic source; no PDF recheck) — see below.
- **UI dev uses the fake binary:** `CLAUDE_BIN=/tmp/fakebin/claude pnpm dev`. A real `/api/run` is
  billable and mutates `data/stonks.db`. Kill stray servers: `lsof -ti tcp:4317 | xargs kill`.
- **Green gates before every commit:** `pnpm test`, `pnpm exec tsc --noEmit`, `pnpm build`.

## Solve the thing I deferred (the screener number tier)

`metrics.filing_id` is `NOT NULL REFERENCES filings(id)`, but screener-table numbers have no backing
PDF. Solve it (cleanest first): **add a nullable `company_id` to `metrics` and make `filing_id`
nullable**, so screener numbers attach to the company directly with `filing_id = NULL`,
`trust='screener'`, `source_url`, `period`. The Verifier skips rows without a `filing_id`. The
dashboard groups by company. Add `'screener'` to the `Trust` type, the `metrics` CHECK (rebuild the
table via a `user_version`-gated migration in `migrate.ts`), and `trustBadge` (a distinct colour).
Build a tested screener financial-table parser (`src/scraper/parse-financials.ts`) over fixture HTML
for the core rows (Revenue, Net Profit, OPM%, EPS, D/E, ROCE) across quarterly + annual periods, and
wire it into `pnpm scrape`.

## Execution protocol (each scheduled wake, with fresh budget)

1. **Re-read** this file, `HANDOFF.md`, the spec, and `docs/superpowers/plans/2026-06-05-stonks-research-brief.md`.
2. **Expand the plan to full scope FIRST** if not already done: invoke `superpowers:writing-plans`
   to add tasks for (a) screener number tier + nullable filing_id migration, (b) multi-period trend
   extraction + small-multiples evidence view, (c) competitor benchmarking (multi-company load +
   side-by-side), (d) concall narrative depth, (e) the industry-learning layer (detect industry →
   discover + cache industry KPIs in `industry_metrics` → teach which metrics matter). Remove the
   "Scope decision / deferral" section — nothing is deferred now.
3. **Execute** via `superpowers:subagent-driven-development`: fresh Sonnet subagent per task, two-
   stage review, commit per task. Use **dynamic Workflows** (the Workflow tool) to fan out
   independent tasks in parallel where it speeds things up. Keep gates green.
4. **Validate for real**: after the brief path is built, do ONE real coordinator E2E on a single
   company to confirm the brief + evidence render end-to-end; capture the result in a run doc under
   `docs/superpowers/runs/`. Prefer a sector Khush hasn't covered (industry-learning is the goal).
5. **Update `HANDOFF.md`** with exactly what shipped, what's left, and any blocker.
6. **Schedule the next wake** (`ScheduleWakeup`, max 3600s; chain if the next budget window is
   further out) and pass this same directive so the loop continues until the north star is met.
7. If you hit a genuine product fork only Khush can answer, record it in `HANDOFF.md` under "Open
   questions for Khush", pick the most reasonable default, keep building, and flag it — do NOT stall.

## Cadence (set 2026-06-05)

Budget resets ~+1.5h, then ~+5h after that. Wake near each reset, work the protocol, re-schedule.
Stop the loop only when the north star is demonstrably met (real E2E shows brief + trends +
benchmarking + industry KPIs) — then write a final HANDOFF and stop scheduling.
