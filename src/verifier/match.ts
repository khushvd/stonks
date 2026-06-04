import type { PageText } from "../types.js";

export type MatchDecision = "verified" | "notebooklm-only" | "reject";
export interface MatchResult {
  decision: MatchDecision;
  source_page: number | null;
}

// Every number-like token in `text`, parsed to a JS number. Boundaries: not preceded by a
// letter/digit/comma/dot (so "FY18" and digits inside a larger number don't match), not
// followed by a letter (so "18A"/"Q3" don't match). A trailing % or currency/space is fine.
// Shared by the verifier and the citation selector so the matching rule lives in ONE place.
export function extractNumbers(text: string): number[] {
  const re = /(?<![A-Za-z\d.,])-?\d[\d,]*(?:\.\d+)?(?![A-Za-z\d])/g;
  const out: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const n = Number(m[0].replace(/,/g, ""));
    if (Number.isFinite(n)) out.push(n);
  }
  return out;
}

// True if `value` appears on the page AS A NUMBER (exact numeric equality, comma/decimal aware).
function pageHasValue(text: string, value: number): boolean {
  return extractNumbers(text).includes(value);
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
