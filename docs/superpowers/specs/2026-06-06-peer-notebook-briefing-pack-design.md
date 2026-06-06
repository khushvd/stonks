# stonks — Peer Notebook Briefing Pack

> **Status:** Design approved in brainstorm on 2026-06-06. Pending implementation plan.
> **Builds on:** bounded autonomous analyst refactor in `/Users/khush/stonks-bounded-analyst`:
> `/api/plan`, user-confirmed 3-peer set, deterministic `/api/run`, screener peer benchmarks,
> cited brief, verifier, reviewer findings, and trust-aware dashboard.

## Product Intent

stonks is a **data and at-a-glance investment research briefing tool**, not an LLM stock picker.
The user brings the idea and makes the judgment. The app should quickly answer:

- What was I asking about?
- Which sector-specific metrics matter here?
- Where does this company stand against relevant peers?
- Which numbers are source-backed, which are missing, and what should I inspect next?
- If I want depth, where should I probe further?

The upgraded output should feel like an analyst briefing pack: the direct answer appears first,
then the sector lens, peer position, evidence, and follow-up probes. It must not hide missing
sector KPIs. A missing RevPAR for a hotel company is itself a useful finding.

## Locked Product Decisions

- **Per-company NotebookLM notebooks.** The main company and each confirmed peer get their own
  notebook. Do not create one overloaded cross-company notebook by default.
- **Default source scope per company:** latest annual report plus the last 4 quarters of investor
  presentations/results decks and concall transcripts, when available.
- **Exactly 3 confirmed peers remain the default run shape.** The planner proposes them, the user
  confirms/edits them, and the executor runs deterministic commands.
- **The report starts with the user ask.** The user's question frames the brief, but the sector KPI
  pack is forced immediately underneath.
- **Expected sector KPIs always render as rows.** If a KPI is expected for the sector but missing
  for a company, show `Missing` in the table. Do not suppress the row.
- **Optional deeper probes.** The default run stays bounded. Follow-up questions can expand a
  company notebook beyond the default source scope only when needed.
- **No recommendation language.** The system may summarize evidence, compare peers, and flag
  watchpoints. It must not tell the user what to buy or sell.

## Why Per-Company Notebooks

The current bounded pipeline scrapes peers for Screener metrics, but only the main company goes
through NotebookLM ingestion and synthesis. That makes peer comparison shallow: generic financials
can show up, but domain KPIs like RevPAR, ARR, occupancy, SSSG, AUM, yields, and store counts may
be absent if Screener does not expose them.

Per-company notebooks solve this without confusing NotebookLM:

- Each notebook has a clean corpus and source list for one company.
- Citations stay easy to map back to one company's filings.
- Missing KPI detection becomes explicit per company.
- Deeper follow-up can target one company without polluting the others.
- Cross-company comparison happens in deterministic app code over extracted payloads, not by
  asking one NotebookLM notebook to reason over a mixed corpus.

## High-Level Architecture

```
Next.js UI
  → /api/plan
      bounded planner returns main company + exactly 3 peer candidates + sector hypothesis
  → user confirms/edits peers
  → /api/run streams deterministic executor
      1. scrape main company with explicit name/slug
      2. scrape each confirmed peer with explicit name/slug
      3. ingest main company into its own NotebookLM notebook
      4. ingest each peer into its own NotebookLM notebook
      5. synthesize main-company ask brief
      6. extract sector KPI pack for main company and peers
      7. verify source-backed NotebookLM-proposed numbers where possible
      8. build report summary/dashboard data
  → Dashboard renders briefing pack
```

The executor remains deterministic. LLMs may propose a plan and synthesize source-grounded text,
but they do not invent shell commands or decide the execution chain.

## Data Model Additions

### Sector KPI Expectations

The existing `industry_metrics` cache becomes a first-class driver of the comparison table.

Each industry metric should carry enough metadata to render and compare it:

- `industry`
- `metric_key`
- `label`
- `unit`
- `description`
- `priority`
- `source`

The minimum implementation may extend the current table incrementally with guarded migrations.
The key behavior is that the expected KPI list exists even before every company has extracted
values.

### Peer KPI Extraction Rows

Extracted peer values should continue flowing through the existing `metrics` and
`metrics_staging` tables where possible:

- Screener values use `trust='screener'`.
- NotebookLM-proposed numeric values are staged first.
- Verifier promotes source-confirmed values to `verified`.
- Values that are cited but cannot be text-confirmed remain distinguishable as `notebooklm-only`
  or rejected, following the existing trust model.

The comparison table must be able to represent:

- value present and verified
- value present but NotebookLM-only
- value present from Screener
- expected but missing
- rejected or failed verification

## New Pipeline Units

### 1. Peer Ingestion

The executor should ingest every confirmed peer, not just the main company.

Contract:

- Input: confirmed `AnalystPlan` with main company and exactly 3 peers.
- Behavior: call existing `pnpm ingest "<Company>"` for each company after scrape.
- Notebook identity: `notebooks.company_id` remains the mapping between company and notebook.
- Idempotency: existing notebook and source adoption behavior stays unchanged.

### 2. Sector KPI Pack Builder

Create a deterministic module that decides the expected KPI rows for the report.

Inputs:

- company industry from `companies.industry`
- cached `industry_metrics`
- latest main-company brief `industryKpis`
- planner sector hypothesis, if available

Behavior:

- Normalize KPI labels into metric keys.
- Return an ordered list of expected sector KPIs.
- Include universal financial context separately; do not let generic metrics crowd out sector KPIs.
- For hotels, the expected pack should include RevPAR, ARR/ADR, occupancy, rooms/keys, and EBITDA
  margin when available.

The exact industry packs can start small and grow through NotebookLM-discovered/cached metrics.

### 3. Peer KPI Extractor

Create a CLI or module that asks each company's own notebook for the expected sector KPI pack.

Contract:

- Input: company name, expected KPI list, optional ask context.
- Source scope: latest annual report plus last 4 quarters of presentations/decks and concalls
  already ingested for that company's notebook.
- Output: structured JSON values per expected KPI:
  - `metric_key`
  - `label`
  - `value`
  - `unit`
  - `period`
  - `cite`
  - `status`: `found` or `missing`
  - `missing_reason`, when available

Rules:

- Return `missing` explicitly for expected KPIs not found.
- Do not invent values.
- Prefer company presentations/decks and concalls for sector KPIs, then annual reports.
- Keep user ask as context, but do not let it suppress the expected KPI pack.

### 4. Peer KPI Matrix Builder

Create a dashboard shaping module that joins expected KPIs against each company.

Rows:

- one row per expected sector KPI
- optionally a small secondary group for universal financial metrics

Columns:

- main company first
- confirmed peers after it

Cells:

- value + unit + period when present
- trust badge
- citation/source link when available
- `Missing` when expected but absent
- `Rejected` when a value was proposed but failed verification

Sorting:

- sector KPIs first, in expected priority order
- universal financial metrics second
- avoid alphabetic-only ordering for the main table

### 5. Deeper Probe Path

The default run should not fetch every historical document. Instead, the UI should expose a
follow-up probe path.

Examples:

- "Why is SAMHI RevPAR missing? Search older decks and concalls."
- "Compare Chalet and SAMHI occupancy recovery over the last 8 quarters."
- "Find whether management changed ARR guidance after the latest quarter."

Probe behavior:

- It targets one or more specific company notebooks.
- It can ingest deeper history only for the targeted company/companies.
- It should report what new sources were added.
- It should update the relevant KPI cells or add a cited follow-up note.

The first implementation can make this an explicit button/copy affordance plus API seam, without
building full multi-turn chat yet.

## Report Outline

The dashboard should be reorganized into this hierarchy:

1. **Direct answer to ask**
   - Source-backed bullets.
   - No buy/sell recommendation.
   - Numeric claims trust-badged.

2. **Sector KPI matrix**
   - Expected sector KPI rows always shown.
   - Main company first, then 3 peers.
   - Missing cells visible.
   - Trust/citation affordances per cell.

3. **Peer position summary**
   - A compact "above / inline / below / missing" read by KPI.
   - Deterministic where possible, based on extracted values.
   - Narrative only when source-backed.

4. **Peer notebook cards**
   - One card per company.
   - Shows notebook/source scope status: latest AR, four quarters of decks, four quarters of
     concalls.
   - Shows extraction health: found KPIs, missing KPIs, rejected values.

5. **What to inspect next**
   - Missing expected KPIs.
   - Management claims that lack numeric support.
   - Peer divergence.
   - Suggested deeper probes.

6. **Evidence**
   - Existing trust summary, metrics table, trends, rejected values.
   - Demoted below the briefing pack.

## Visual Direction

Use an editorial analyst briefing aesthetic:

- high contrast and high legibility
- paper/terminal feel rather than generic SaaS dashboard
- strong masthead and section hierarchy
- compact monospace numeric tables
- clearly colored `Missing`, `Verified`, `NotebookLM-only`, `Screener`, and `Rejected` states
- main report should feel printable/readable, but still interactive

The visual companion mockup from the brainstorm established the direction:

- masthead: "Bounded Analyst Briefing Pack"
- left: dark direct-answer panel
- right: sector KPI matrix
- lower strip: peer position, peer notebook cards, what to look for
- final affordance: "Probe Deeper"

Implementation should adapt this direction into the existing Next.js app, preserving accessibility
and responsive behavior.

## Error Handling

- Peer scrape fails: show peer as unavailable with the failed step surfaced in the run feed.
- Peer ingest fails: keep Screener metrics if available; mark notebook-dependent KPI cells missing.
- NotebookLM returns malformed JSON: do not crash the run; mark affected company KPI extraction as
  failed and surface it in the peer card.
- Verifier rejects a KPI value: show `Rejected`, keep reason in evidence/rejects.
- Expected KPI absent from all companies: keep the row and flag it as a sector-pack coverage issue.
- Follow-up probe adds no new data: report that no new source-backed value was found.

## Testing

Acceptance criteria:

- A confirmed peer run creates or reuses a NotebookLM notebook for the main company and each of
  the 3 peers.
- The default source scope attempts latest annual report plus last 4 quarters of presentations and
  concalls for every company; unavailable source types are shown as coverage gaps.
- The dashboard renders the direct answer above the sector KPI matrix.
- The sector KPI matrix renders expected KPI rows even when every company is missing a value.
- Hotel runs include RevPAR as an expected KPI row.
- Missing expected KPI cells are visible and feed the "what to inspect next" / probe affordance.
- The UI uses the editorial briefing-pack direction and remains readable on desktop and mobile.

Unit tests:

- executor command builder includes peer ingest before peer KPI extraction
- sector KPI pack builder returns expected hotel KPIs and preserves cached industry metrics
- peer KPI parser handles found, missing, malformed, and prose-wrapped JSON
- matrix builder renders expected rows even with no values
- matrix builder distinguishes verified, notebooklm-only, screener, missing, and rejected cells
- dashboard data includes peer notebook/source health
- reviewer flags missing expected KPIs

Component tests:

- sector KPI matrix renders missing rows and trust badges
- peer notebook cards render source coverage and extraction health
- report hierarchy renders ask answer before KPI matrix
- mobile layout remains readable

Integration tests:

- `/api/run` deterministic chain emits peer ingestion and KPI extraction steps
- `/api/dashboard` returns comparison matrix with expected KPI rows
- existing dashboard tests remain green

Manual golden path:

- Run a hotel company such as SAMHI with peers.
- Confirm RevPAR appears as an expected row even if one or more companies are missing values.
- Confirm each company has its own notebook entry.
- Confirm direct ask answer appears above the KPI matrix.
- Confirm missing KPI cells suggest deeper probes rather than disappearing.

Gates:

- `pnpm test`
- `pnpm exec tsc --noEmit`
- `pnpm build` for app/UI changes

## Out of Scope

- Buy/sell/hold recommendation engine.
- Portfolio management.
- Fully autonomous unlimited-depth peer research.
- One combined cross-company NotebookLM corpus as the default.
- Full multi-turn chat implementation. This spec creates the data/report foundation and a probe
  seam; B-full chat remains a separate build.
- Deployment/hosting; local app remains the target.

## AGENTS.md / Project Doc Updates Required

After implementation, update project instructions to document:

- per-company peer notebooks
- default source scope: latest AR plus last 4 quarters of presentations and concalls
- sector KPI matrix semantics
- expected-but-missing KPI rows
- optional deeper probe path
- the upgraded report hierarchy and UI direction
