# CLI Pivot — Asian Paints E2E Run

**Date:** 2026-06-04
**Plan:** `docs/superpowers/plans/2026-06-04-notebooklm-cli-pivot.md` (Task 10)
**Result:** ✅ PASS — all three trust paths demonstrated end-to-end through the real scripts.

## Setup
- `notebooklm login` completed (browser auth saved to `~/.notebooklm/storage_state.json`).
- `.claude/settings.local.json` reduced to `["Bash(pnpm:*)", "Bash(notebooklm:*)", "Read"]`.
- `grep -rn "mcp__notebooklm" .claude/ src/` → empty.
- Notebook `9195a137-7850-4134-9c1f-524022f5592c` ("Asian Paints"), 4 PDF sources `ready`.

## Ingest (idempotency)
The notebook was populated during the earlier manual E2E, before the `notebooklm_source_id`
column existed, so all 4 filings had `null` source ids. The 4 known source ids were backfilled
onto the filing rows by filename (via the tested `setFilingSourceId` helper). `pnpm ingest "Asian Paints"`
then returned a clean no-op — proving idempotency:

```json
{ "notebook_id": "9195a137-7850-4134-9c1f-524022f5592c",
  "added": [], "skipped": [filing 1..4 with their source ids], "failed": [] }
```

> **Finding (follow-up, not a blocker):** `runIngest` is only idempotent against filings *it*
> uploaded — it has no logic to match a notebook's pre-existing sources to filings by filename,
> so a fresh-DB run against an already-populated notebook would duplicate-upload. The backfill
> above was a one-off workaround. Recommended enhancement: before uploading, `runIngest` should
> `notebooklm source list` and record ids for filenames already present.

## Extract (extractor agent, Sonnet, live `notebooklm ask`)
Staged 3 universal metrics for Q4FY26 (all `pending`, none promoted):

| metric | value | citation sourceId | excerpt | staging_id |
|---|---|---|---|---|
| revenue | 9228 INR cr | `0807f641…` (presentation-2.pdf, filing 3) | "9,228" | 3 |
| pat | 1185 INR cr | null (no reference's cited_text contained 1185) → all-PDF fallback | null | 4 |
| ebitda_margin | 19.4 % | null (closest cited_text was "PBDIT growth of 24.4% yoy") → all-PDF fallback | null | 5 |

`select-citation` correctly returned null for pat/ebitda when no reference's `cited_text` contained
the actual value — an honest "uncited", handed to the verifier rather than guessed.

## Verify (deterministic pdfjs gate, source-scoped)
Real metrics:
```json
{ "outcomes": [
    { "staging_id": 3, "name": "revenue",       "decision": "verified", "source_page": 28 },
    { "staging_id": 4, "name": "pat",            "decision": "verified", "source_page": 28 },
    { "staging_id": 5, "name": "ebitda_margin",  "decision": "verified", "source_page": 28 } ],
  "summary": { "verified": 3, "notebooklmOnly": 0, "pending": 0, "rejected": 0 } }
```
Note: revenue was confirmed **within its scoped deck** (presentation-2.pdf), proving source-scoping
works on real PDFs — not just any company PDF that happens to contain 9,228.

## Gate demonstration (synthetic, then removed)
To exercise the other two trust paths, two clearly-labeled synthetic rows were staged and verified:

| name | value | excerpt | decision |
|---|---|---|---|
| gatetest_chart_only | 31415 | "all businesses contributing to growth" (real text on p28) | **notebooklm-only** (p28) |
| gatetest_fabricated | 987654 | "deliberately fabricated figure…" (absent) | **reject** (quarantined) |

Combined verify summary at that point: `{ verified: 3, notebooklmOnly: 1, pending: 0, rejected: 1 }`.

The two `gatetest_%` rows were then deleted (self-created demonstration artifacts), leaving the live
table with only the 3 real verified metrics:

```
revenue=9228 INR cr [verified] p28 filing=3
pat=1185 INR cr [verified] p28 filing=1
ebitda_margin=19.4 % [verified] p28 filing=1
```

## Conclusion
The CLI-pivot pipeline works end-to-end on real filings: NotebookLM (via the `notebooklm` CLI)
proposes numbers with citations; `select-citation` picks the backing reference deterministically;
the pdfjs verifier disposes — promoting source-confirmed numbers `verified`, chart-only numbers
`notebooklm-only`, and rejecting unconfirmable numbers. Data integrity gate intact.
