# Phase 1 E2E run — Asian Paints (2026-06-03)

**Scope of run:** mechanical proof of the scrape → extract → verify → store integrity
pipeline on real scraped data (not the full autonomous `claude -p` agent run — deferred by
choice to control token spend; the agent definitions exist and the tools they call are proven).

## Scrape
- `pnpm scrape ASIANPAINT "Asian Paints"` → 4 filings downloaded (2 result, 2 presentation),
  annual reports excluded by default (200–300pp, impractical; `--annual` opts in).
- All downloads were genuine PDFs (verified with `file`), readable by `pdf-text`.

## Integrity gate proof (against result-1.pdf, page 28)
- Staged two metrics: PAT 8330 (real, visible on p28) and PAT 99999 (fabricated).
- Verifier read ONLY page 28, confirmed each value verbatim.
- Result: **8330 PROMOTED, 99999 REJECTED.**
- `integritySummary` = `{ verified: 1, pending: 0, rejected: 1 }`.
- Spot-check: page 28 text contains "PAT FY25 FY26 8,330" — promotion correct; 99999 absent — rejection correct.

**Conclusion:** the anti-hallucination quarantine works — only source-confirmed numbers reach
the live `metrics` table.

## Findings feeding Phase 2
- Investor-deck PDFs are graphical; text extraction (pdfjs AND markitdown) yields jumbled
  slide text. Real fix = a vision pass (Claude reading page images). High priority for Phase 2.
- markitdown extracted ~19% more text than pdfjs (18,318 vs 15,380 chars) but loses page
  boundaries, which the source_page integrity gate depends on — so it's NOT wired into Phase 1.
  Reserve markitdown for Office formats (pptx/xlsx/docx) + a supplementary full-text index in Phase 2.
