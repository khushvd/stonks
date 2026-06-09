import type { Company, Filing, IntegritySummary } from "../../../src/types.js";
import type { BriefingData } from "./types";
import { periodToOrder } from "./adapter-util";

type CompanyBlock = BriefingData["company"];

/** Identity block. asOf = the chronologically latest filing period, or "" if none. */
export function mapCompany(company: Company, filings: Filing[]): CompanyBlock {
  const periods = filings.map((f) => f.period).filter((p): p is string => !!p);
  const asOf = periods.length
    ? periods.reduce((latest, p) => (periodToOrder(p) > periodToOrder(latest) ? p : latest))
    : "";
  const industry = company.industry ?? "";
  return {
    name: company.name,
    ticker: company.ticker ?? "",
    industry,
    sector: industry, // no distinct sector field in the backend
    asOf,
  };
}

// TODO(backend-synthesis): the planner/synthesis does not yet produce a company "about" blurb.
// This is an honest placeholder from the facts we have, not a hallucinated description.
export function stubAbout(company: Company): string {
  return company.industry
    ? `${company.name} — ${company.industry}. (Company overview pending analyst synthesis.)`
    : `${company.name}. (Company overview pending analyst synthesis.)`;
}

// TODO(backend-synthesis): no triage verdict is produced yet. Derive a defensible bottom line
// from pipeline integrity counts + whether a management contradiction was flagged.
export function stubBottomLine(
  integrity: IntegritySummary,
  hasContradiction: boolean,
): BriefingData["bottomLine"] {
  const worth = `Built from ${integrity.verified} source-verified figures. Review the briefing below for the answer-first read.`;
  const watchParts: string[] = [];
  if (hasContradiction) watchParts.push("a flagged management contradiction");
  if (integrity.rejected > 0) watchParts.push(`${integrity.rejected} quarantined figure${integrity.rejected > 1 ? "s" : ""}`);
  if (integrity.notebooklmOnly > 0) watchParts.push(`${integrity.notebooklmOnly} unverified (NLM-only) value${integrity.notebooklmOnly > 1 ? "s" : ""}`);
  const watch = watchParts.length
    ? `Worth a closer look: ${watchParts.join(", ")}.`
    : "No integrity flags raised in this run.";
  return { worth, watch };
}
