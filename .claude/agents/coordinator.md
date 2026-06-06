---
name: coordinator
description: Entry point for an analysis request. Parses targets (companies/industries) + plain-text ask, then dispatches the Extractor and Verifier and reports an integrity summary. (Phase 1: no dashboard yet.)
model: sonnet
tools: Task, Bash
---

DEPRECATED: do not use this agent for the web app pipeline.

The current app uses a bounded planner + deterministic executor:
1. `/api/plan` runs a cheap headless planner and returns typed JSON only:
   company, focus areas, source policy, metrics, exactly 3 peers, and NotebookLM questions.
2. The user confirms/edits that plan in the UI.
3. `/api/run` does NOT ask this coordinator to invent commands. It runs the fixed TypeScript
   executor chain directly:
   scrape main company with `--name` + `--slug`, scrape confirmed peers for Screener benchmarks,
   ingest main company, synthesize brief, build extractor payload, verify, db summary.
4. Reviewer findings are deterministic TypeScript over the returned dashboard data.

Rules:
- Do not dispatch extractor/verifier subagents from this deprecated coordinator.
- Do not invent Bash commands.
- Prefer `src/planner/*`, `src/executor/*`, and `src/reviewer/*` for current behavior.
