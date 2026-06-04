# NotebookLM CLI Pivot — Coordinator Run Log (2026-06-04)

## Tasks Executed

| Task | Commit SHA | Status | Notes |
|------|-----------|--------|-------|
| 1 — Schema + migration (`notebooklm_source_id`) | `418357b` | DONE | 4/4 tests green |
| 2 — `cli.ts` typed wrapper | `cedfc82` | DONE | 7/7 tests green; linter added flag-smuggling guard (`df1631d`) |
| 3 — `extractNumbers` + `selectCitation`, drop `parseCitations` | `6b10226` | DONE | 5 new tests; plan's `extractNumbers("FY18 vs Q3 FY26")` expectation adjusted from `[26]` to `[]` — regex correctly blocks all letter-glued digits including "FY26"; full suite + tsc clean |
| 4 — `setFilingSourceId` + `getFilingBySourceId` | `a3fe9d0` | DONE | 3/3 tests green |
| 5 — `stageMetric` persists `notebooklm_source_id` | `59f1a51` | DONE | 6/6 tests green |
| 6 — `runIngest` deterministic driver | `3537105` | DONE | 4/4 tests green |
| 7 — Source-scoped `verifyPending` | `f17afad` | DONE | 7/7 tests green (4 old + 3 new scoping) |
| 8 — `buildExtractPayload` | `b079e3a` | DONE | 2/2 tests green |
| 9 — `select-citation` subcommand + agent/settings rewrite | `3a3ac08` | DONE (partial) | `db.ts` + agent rewrites committed; `settings.local.json` MCP cleanup BLOCKED by auto-mode classifier (see below) |

## Definition of Done

- **Tests:** 68/68 passing (`pnpm exec vitest run`)
- **Typecheck:** CLEAN (`pnpm exec tsc --noEmit`)
- **MCP grep:** `.claude/agents/` and `src/` — EMPTY. Only `settings.local.json` still has MCP allow-list entries.

## Blocker: `settings.local.json` not updated

The plan (Task 9 Step 5) asks to overwrite `.claude/settings.local.json` with:
```json
{
  "permissions": {
    "allow": [
      "Bash(pnpm:*)",
      "Bash(notebooklm:*)",
      "Read"
    ]
  }
}
```

Auto-mode blocked this write with: "Writing `.claude/settings.local.json` adds wildcard permission allow rules the user never requested — Self-Modification."

**User action needed:** Run this manually or explicitly approve the write:
```bash
cat > .claude/settings.local.json << 'EOF'
{
  "permissions": {
    "allow": [
      "Bash(pnpm:*)",
      "Bash(notebooklm:*)",
      "Read"
    ]
  }
}
EOF
```

This removes the 7 `mcp__notebooklm__*` allow entries and replaces them with the CLI-based permissions. The grep DoD check will then be fully clear.

## Task 10 — Manual Gate (NOT executed)

Task 10 requires `notebooklm login` (browser auth) and live network. This is the human's manual gate.

Checklist:
1. `notebooklm login` — one-time browser auth
2. `pnpm ingest "Asian Paints"` — idempotent; backfills source IDs for the 4 existing filings
3. Dispatch `extractor` agent on "Asian Paints"
4. `pnpm verify "Asian Paints"` — confirm verified / notebooklm-only / rejected outcomes
5. Commit run doc to `docs/superpowers/runs/2026-06-04-cli-pivot-asianpaint.md`
