import type { BriefView, BriefClaimView } from "../../../src/dashboard/data.js";
import type { BriefingData } from "./types";
import { humanizeKey } from "./adapter-util";

type BriefingBrief = BriefingData["brief"];

/** "arr"/13420 -> "arr 13,420"; null metric -> null. */
function metricLabel(metric: BriefClaimView["metric"]): string | null {
  if (!metric) return null;
  return `${humanizeKey(metric.name)} ${metric.value.toLocaleString("en-IN")}`.trim();
}

/** Map the stored research brief into the briefing's answer-first sections. */
export function mapBrief(brief: BriefView | null): BriefingBrief {
  if (!brief) {
    return { headline: "", answer: [], drivers: [], guidance: [], risks: [] };
  }
  const bySection = (s: BriefClaimView["section"]) => brief.claims.filter((c) => c.section === s);

  const answer = bySection("answer").map((c) => c.text);
  const headline = answer[0] ?? brief.ask ?? "";

  return {
    headline,
    answer,
    drivers: bySection("drivers").map((c) => ({ text: c.text, metric: metricLabel(c.metric) })),
    guidance: bySection("guidance").map((c) => ({ text: c.text, metric: metricLabel(c.metric) })),
    risks: bySection("risks").map((c) => ({ text: c.text, tone: "cautious" as const })),
  };
}
