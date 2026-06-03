import type { PageText } from "../types.js";

export type MatchDecision = "verified" | "notebooklm-only" | "reject";
export interface MatchResult {
  decision: MatchDecision;
  source_page: number | null;
}

// Build a regex matching the number with optional thousands separators:
// 8330 -> /\b8[,]?330\b/ (also matches "8,330"); decimals matched loosely.
function numberRegex(value: number): RegExp {
  const [intPart, decPart] = String(value).split(".");
  const sign = intPart.startsWith("-") ? "-?" : "";
  const digits = intPart.replace("-", "");
  const grouped = digits.split("").join("[,]?");
  const dec = decPart ? `\\.${decPart}` : "(\\.\\d+)?";
  return new RegExp(`${sign}\\b${grouped}\\b${dec}`);
}

// Distinctive substring of the excerpt to look for (collapse whitespace, take a chunk).
function excerptNeedle(excerpt: string | null): string | null {
  if (!excerpt) return null;
  const norm = excerpt.replace(/\s+/g, " ").trim();
  return norm.length >= 6 ? norm.slice(0, 60).toLowerCase() : null;
}

export function matchMetric(input: { value: number; excerpt: string | null }, pages: PageText[]): MatchResult {
  const re = numberRegex(input.value);
  for (const p of pages) {
    if (re.test(p.text)) return { decision: "verified", source_page: p.page };
  }
  const needle = excerptNeedle(input.excerpt);
  if (needle) {
    for (const p of pages) {
      if (p.text.replace(/\s+/g, " ").toLowerCase().includes(needle)) {
        return { decision: "notebooklm-only", source_page: p.page };
      }
    }
  }
  return { decision: "reject", source_page: null };
}
