import { MOCK_BRIEFING } from "./mock";
import type { BriefingData } from "./types";

/**
 * Maps the live dashboard payload to the briefing view model.
 * MOCK NOW, WIRE LATER: returns mock data regardless of input. The follow-up plan
 * replaces this body with a real getDashboard()/ComparisonData → BriefingData mapping
 * (derive quarters[] from trends, stat deltas from YoY, peerMargins from per-peer trends,
 * source labels from filings; carry trust/flag fields end-to-end).
 */
export function toBriefingData(_data?: unknown, _comparison?: unknown): BriefingData {
  return MOCK_BRIEFING;
}
