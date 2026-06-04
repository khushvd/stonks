import type Database from "better-sqlite3";
import { getFilingBySourceId } from "../db/filings.js";
import { stageMetric } from "../db/metrics.js";
import type { Brief } from "./types.js";

// Stage every claim-embedded number against the filing its citation resolves to, so `pnpm verify`
// can dispose it. Returns the count staged. Claims without a metric, or whose citation does not map
// to a known filing for this company, are skipped.
export function stageBriefMetrics(db: Database.Database, companyId: number, brief: Brief): number {
  const refBySource = new Map(brief.references.map((r) => [r.citation_number, r]));
  let staged = 0;
  for (const claim of brief.claims) {
    if (!claim.metric || claim.cite === null) continue;
    const ref = refBySource.get(claim.cite);
    if (!ref) continue;
    const filing = getFilingBySourceId(db, companyId, ref.source_id);
    if (!filing) continue;
    stageMetric(db, {
      filing_id: filing.id,
      name: claim.metric.name,
      value: claim.metric.value,
      unit: claim.metric.unit,
      period: claim.metric.period,
      source_page: null,
      excerpt: ref.cited_text,
      source_url: filing.source_url,
      notebooklm_source_id: ref.source_id,
    });
    staged++;
  }
  return staged;
}
