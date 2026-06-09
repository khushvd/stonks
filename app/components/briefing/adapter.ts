import type { DashboardData } from "../../../src/dashboard/data.js";
import type { ComparisonData } from "../../../src/dashboard/comparison.js";
import type { BriefingData } from "./types";
import { deriveQuarters } from "./adapter-quarters";
import { deriveStats } from "./adapter-stats";
import { mapMatrix } from "./adapter-matrix";
import { mapBrief } from "./adapter-brief";
import { mapCommentary } from "./adapter-commentary";
import { mapSources } from "./adapter-sources";
import { mapCompany, stubAbout, stubBottomLine } from "./adapter-company";

/**
 * Map the live dashboard + peer comparison payloads into the briefing view model.
 * Pure transform — no React, no DB, no I/O. Every sub-mapping is unit-tested in
 * app/components/briefing/__tests__/adapter-*.test.ts.
 *
 * Known partial fidelity (see the plan's "partial-fidelity decisions"):
 *   - about / bottomLine are honest stubs (backend does not synthesize them yet)
 *   - peer sparkline history is single-point (comparison carries only the latest margin);
 *     the subject company gets its full series from trends
 *   - source page anchors default to 1
 */
export function toBriefingData(data: DashboardData, comparison: ComparisonData | null): BriefingData {
  const subjectKey = comparison?.companies[0] ?? data.company.name;

  const quarters = deriveQuarters(data.trends);
  const stats = deriveStats(quarters);
  const { peers, matrix, peerMargins } = mapMatrix(comparison, subjectKey);

  // The matrix helper seeds peerMargins with a single latest point per peer. Replace the
  // subject's entry with its full quarter-by-quarter margin history for a real sparkline.
  if (quarters.length > 0) {
    peerMargins[subjectKey] = quarters.map((q) => q.margin);
  }

  const commentary = mapCommentary(data.commentaryTrends);
  const hasContradiction = commentary.some((c) => c.flag != null);

  return {
    company: mapCompany(data.company, data.filings),
    ask: data.brief?.ask ?? "",
    about: stubAbout(data.company),
    bottomLine: stubBottomLine(data.integrity, hasContradiction),
    brief: mapBrief(data.brief),
    quarters,
    stats,
    peers,
    matrix,
    peerMargins,
    commentary,
    sources: mapSources(data.filings),
    integrity: {
      verified: data.integrity.verified,
      nlmOnly: data.integrity.notebooklmOnly,
      pending: data.integrity.pending,
      rejected: data.integrity.rejected,
    },
  };
}
