import type { PageText } from "../types.js";

export type MatchDecision = "verified" | "notebooklm-only" | "reject";
export interface MatchResult {
  decision: MatchDecision;
  source_page: number | null;
}

// True if `value` appears on the page AS A NUMBER (exact numeric equality, comma/decimal aware).
// Tokenizes number-like substrings and compares numerically, so 330 does NOT match "8,330",
// 18 does NOT match "18.5", and -150 does NOT match "150".
function pageHasValue(text: string, value: number): boolean {
  // Boundaries: not preceded by a letter/digit/comma/dot (so "FY18" and digits inside a larger
  // number don't match), not followed by a letter (so "18A"/"Q3" don't match). A trailing % or
  // currency/space is fine.
  const re = /(?<![A-Za-z\d.,])-?\d[\d,]*(?:\.\d+)?(?![A-Za-z\d])/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const n = Number(m[0].replace(/,/g, ""));
    if (Number.isFinite(n) && n === value) return true;
  }
  return false;
}

// Distinctive substring of the excerpt to look for (collapse whitespace, take a chunk).
function excerptNeedle(excerpt: string | null): string | null {
  if (!excerpt) return null;
  const norm = excerpt.replace(/\s+/g, " ").trim();
  return norm.length >= 6 ? norm.slice(0, 60).toLowerCase() : null;
}

export function matchMetric(input: { value: number; excerpt: string | null }, pages: PageText[]): MatchResult {
  for (const p of pages) {
    if (pageHasValue(p.text, input.value)) return { decision: "verified", source_page: p.page };
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
