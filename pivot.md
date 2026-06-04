# PIVOT: NotebookLM MCP → `notebooklm` CLI

**For the implementing agent.** This is the actionable migration. Full rationale:
`docs/superpowers/specs/2026-06-04-notebooklm-cli-pivot-design.md`. Read it first.

**One-liner:** Stop using the NotebookLM MCP (`mcp__notebooklm__*`). Drive everything through
the standalone `notebooklm` Python CLI (v0.3.4), which can create notebooks, upload local PDFs,
and return cited JSON answers — none of which the MCP can do. The verifier integrity gate is
unchanged except its search scope narrows to the cited source PDF.

**Hard rules (from CLAUDE.md — do not violate):**
- Subscription only. NO Agent SDK / pay-as-you-go API. Haiku/Sonnet only, no Opus.
- The user never runs a CLI. The `notebooklm`/`pnpm` commands are internal; agents/app call them.
  The ONLY human CLI touch is one-time `notebooklm login`.
- Data integrity is non-negotiable. No number reaches `metrics` without passing the pdfjs verifier.
- Confirm before destructive SQL / file deletion / anything hard to reverse.
- Use TDD (write failing test → implement → green → commit). Frequent commits.

---

## Ground truth: the CLI (verified working 2026-06-04)

Installed at `/Library/Frameworks/Python.framework/Versions/3.12/bin/notebooklm` (v0.3.4).
Auth state in `~/.notebooklm/storage_state.json` (set by `notebooklm login`, browser, one-time).

```bash
notebooklm list --json
# → {"notebooks":[{"index":1,"id":"<uuid>","title":"...","is_owner":bool,"created_at":"..."}, ...]}

notebooklm create "Asian Paints" --json
# → {"notebook":{"id":"<uuid>","title":"Asian Paints","created_at":null}}

notebooklm source add data/ASIANPAINT/result-0.pdf --type file -n <notebook_id> --json
# → {"source":{"id":"<uuid>","title":"result-0.pdf","type":"SourceType.UNKNOWN","url":null}}
#   NOTE: --type file is REQUIRED for PDFs (without it, .pdf is mis-handled).

notebooklm source wait <source_id> -n <notebook_id>
# blocks until that source is "ready" (prints "✓ Source ready: <id>"). Poll-free.

notebooklm source list -n <notebook_id>
# table with a Status column: processing | ready

notebooklm ask "<question>" -n <notebook_id> --json
# → { "answer": "<prose with inline [1][2] citations>",
#     "references": [ {"source_id":"<uuid>","citation_number":1,"cited_text":"9,228",
#                      "start_char":..., "end_char":..., "chunk_id":"..."}, ... ] }
#   The numeric value lives in BOTH the prose answer and (usually) a reference's cited_text.
```

**Current DB state:** company id 1 = Asian Paints; notebook row already points at
`9195a137-7850-4134-9c1f-524022f5592c` with all 4 PDFs uploaded + indexed. Filing source-id
mapping is NOT yet persisted (the schema column doesn't exist yet — Task 1). The 4 source ids
from the manual run, for reference / a backfill test:
- result-0.pdf       → 3ba2f598-82ef-414a-b7e5-f58e020da37b
- result-1.pdf       → 78134b72-803b-4637-9e8f-4723636e7a3d
- presentation-2.pdf → 0807f641-2c0d-40e2-b1c9-d021064a99ae
- presentation-3.pdf → e6c42e6a-978b-441b-8aef-72fc5bc62306

---

## Task list (TDD, commit after each)

### Task 1 — Schema + migration: `notebooklm_source_id`
- `src/db/schema.sql`: add `notebooklm_source_id TEXT` to BOTH `filings` and `metrics_staging`.
- `src/db/migrate.ts`: two guarded `ALTER TABLE ... ADD COLUMN` steps using the existing
  `PRAGMA table_info` guard pattern (copy how `metrics.trust` is guarded). Idempotent.
- Test: open a fresh in-memory db, run `migrate`, assert both columns exist via `PRAGMA table_info`;
  run `migrate` twice, assert no throw.

### Task 2 — `src/notebooklm/cli.ts` (new): typed CLI wrapper
Single chokepoint over the `notebooklm` binary via `node:child_process` `execFile` (NOT shell-string;
pass args as an array to avoid quoting bugs with company names/questions).
- `export async function nbList(): Promise<{notebooks: {id:string,title:string,is_owner:boolean}[]}>`
- `export async function nbCreate(title: string): Promise<{id: string}>`  (unwrap `.notebook.id`)
- `export async function nbSourceAdd(notebookId: string, filePath: string): Promise<{id: string, title: string}>`
  (args: `source add <filePath> --type file -n <notebookId> --json`; unwrap `.source`)
- `export async function nbSourceWait(notebookId: string, sourceId: string): Promise<void>`
- `export async function nbAsk(notebookId: string, question: string): Promise<{answer: string, references: NbReference[]}>`
  where `NbReference = {source_id: string, citation_number: number, cited_text: string}`.
- Each parses stdout JSON; on non-zero exit or unparseable output, throw an `Error` whose message
  includes stderr. `nbList` is the auth precheck — a thrown `nbList` means "not logged in".
- Tests: unit-test the JSON unwrapping/parse logic by injecting a fake `execFile` (dependency-inject
  the runner, e.g. `cli.ts` takes an optional `run = execFileAsync` param, default real). Cover:
  create unwraps nested id; source add unwraps; ask returns answer+references; non-zero exit throws
  with stderr text. Do NOT hit the real network in unit tests.

### Task 3 — `src/notebooklm/parse-citations.ts`: replace with `selectCitation`
- DELETE the old MCP-shaped `parseCitations`.
- `export function selectCitation(askJsonRaw: string, value: number): { excerpt: string|null, sourceId: string|null }`
  - Parse the raw `notebooklm ask --json` string. On parse failure → `{excerpt:null, sourceId:null}`.
  - Walk `references[]`; return the FIRST reference whose `cited_text` contains `value` by
    **numeric equality** — reuse the verifier's number tokenizer (`src/verifier/match.ts` regex +
    parse) so "9,228", "₹9,228 crore", "9228" all match 9228, and "FY18"/"Q3" do NOT match 18/3.
    Export a shared `extractNumbers(text: string): number[]` from `match.ts` and use it in both places
    (DRY — do not duplicate the regex).
  - Return `{excerpt: ref.cited_text, sourceId: ref.source_id}` for the hit, else nulls.
- Tests: "9,228" matches value 9228; "₹9,228 crore" matches; reference for 8330 is NOT returned when
  value=9228; empty/garbage JSON → nulls; no references → nulls.

### Task 4 — `src/db/filings.ts`: source-id helpers
- `export function setFilingSourceId(db, filingId: number, sourceId: string): void`
- `export function getFilingBySourceId(db, companyId: number, sourceId: string): Filing | undefined`
- `listFilings`/`Filing` type: include `notebooklm_source_id: string | null`.
- Tests: insert filing, set source id, read back via `getFilingBySourceId`; unknown id → undefined.

### Task 5 — `src/db/metrics.ts`: stage with source id
- `stageMetric` input + insert: persist `notebooklm_source_id` (nullable). Keep `excerpt`, `source_url`.
- `MetricInput` type (src/types.ts): add `notebooklmSourceId?: string | null`.
- Test: stage a metric with a source id, read the staging row, assert it round-trips.

### Task 6 — `src/cli/ingest.ts`: deterministic ingest driver (rewrite)
Replace the thin preview with the real driver. `pnpm ingest "<Company>"`:
1. `await nbList()` — on throw, print "NotebookLM not authenticated — run `notebooklm login` once."
   and `process.exit(1)`.
2. Load company (error if not found, like extract.ts does). Load `getNotebook(companyId)`.
3. notebook id: if `notebook.notebook_id` set → reuse; else `nbCreate(company.name)` →
   `upsertNotebook(companyId, url, id)` (url = `https://notebooklm.google.com/notebook/<id>`).
4. For each filing from `listFilings` with `local_path` set and `notebooklm_source_id` null:
   `nbSourceAdd(notebookId, local_path)` → `setFilingSourceId(filingId, source.id)` →
   `nbSourceWait(notebookId, source.id)`. Collect failures; continue others.
5. Print a JSON summary {notebook_id, added: [...], skipped: [...], failed: [...]}; exit non-zero
   if any failed.
- Test: with `cli.ts` mocked, run ingest against an in-memory db seeded with a company + 2 filings;
  assert create called once, source add called per unmapped filing, source ids persisted, idempotent
  on a second run (no re-add). (Drive the script's core as an exported `runIngest(db, deps)` function
  so it's testable without spawning a process.)

### Task 7 — `src/verifier/verify.ts`: source-scoped verification
- For each pending staged metric: if `notebooklm_source_id` is set and maps (via
  `getFilingBySourceId`) to a filing → load ONLY that filing's PDF pages. Else → all company PDFs
  (existing behaviour, the fallback).
- `matchMetric` and the trust/reject logic are UNCHANGED.
- Tests: number present only in filing A's PDF → `verified` when staged with A's source_id; the SAME
  number staged with filing B's source_id (where B's PDF lacks it) → `rejected` (proves scoping);
  null source_id → all-pages fallback still verifies. Use small fixture page texts (mock the page
  loader as the current tests already do).

### Task 8 — Agents + settings
- `.claude/agents/ingestor.md`: tools = `Bash, Read`; remove every `mcp__notebooklm__*`. Body:
  run `pnpm ingest "<Company>"`, report the JSON summary honestly (do not claim success on non-zero).
- `.claude/agents/extractor.md`: tools = `Bash, Read`; remove every `mcp__notebooklm__*`. Body:
  1. `pnpm extract "<Company>" [--ask "..."]` to get notebook_id + metric list.
  2. For each metric, `notebooklm ask "<targeted question, ask for figure + period + the exact
     quoted source text>" -n <notebook_id> --json`.
  3. Read value/unit/period from `answer`; call into `selectCitation` logic (the agent can run a
     tiny `pnpm` helper, OR — simpler — `pnpm db stage` already accepts the fields; have the agent
     pass `notebooklmSourceId` and `excerpt` it picked). Keep the agent's reasoning minimal and
     mechanical; it must NEVER invent a number not in the answer.
  4. Map source_id → filing_id for the stage call (extractor reads filings from step 1 output;
     ensure `pnpm extract` includes each filing's `notebooklm_source_id` in its JSON — update
     `src/cli/extract.ts` to surface it).
  5. Stage each metric `pending`. Never promote.
- `.claude/agents/verifier.md`: unchanged (already a thin `pnpm verify` wrapper).
- `.claude/settings.local.json`: set `permissions.allow` to exactly:
  `["Bash(pnpm:*)", "Bash(notebooklm:*)", "Read"]`. Remove all `mcp__notebooklm__*` entries.

### Task 9 — Update `src/cli/extract.ts`
- Include `notebooklm_source_id` for each filing in the emitted JSON (the extractor needs it to map
  citations → filing_id). Everything else stays.

### Task 10 — E2E re-run (manual gate, do last)
On Asian Paints (notebook already exists, sources already uploaded): `pnpm ingest "Asian Paints"`
(should be idempotent — backfills the 4 source-id mappings onto the filing rows), then dispatch the
extractor agent, then `pnpm verify "Asian Paints"`. Confirm: ≥1 metric `verified`, chart-only number
`notebooklm-only`, a deliberately fabricated number `rejected`. Capture the run in
`docs/superpowers/runs/2026-06-04-cli-pivot-asianpaint.md`.

---

## Definition of done
- All unit tests green (`pnpm exec vitest run`) + `pnpm exec tsc --noEmit` clean.
- No `mcp__notebooklm__*` references anywhere in `.claude/` or `src/`.
- E2E (Task 10) passes; run doc committed.
- `notebooklm login` is the only command a human ever types.
```

