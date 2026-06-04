import { extractNumbers } from "../verifier/match.js";

/** The citation backing a value: the cited excerpt and the NotebookLM source it came from. */
export interface CitationPick {
  excerpt: string | null;
  sourceId: string | null;
}

// Parse `notebooklm ask --json` output and return the FIRST reference whose cited_text contains
// `value` by numeric equality (reusing the verifier's tokenizer, so "9,228"/"₹9,228 crore"/"9228"
// all match 9228 and "FY18" does not match 18). No match / bad JSON -> honest nulls.
export function selectCitation(askJsonRaw: string, value: number): CitationPick {
  let parsed: unknown;
  try {
    parsed = JSON.parse(askJsonRaw);
  } catch {
    return { excerpt: null, sourceId: null };
  }
  const refs =
    parsed && typeof parsed === "object" && Array.isArray((parsed as { references?: unknown }).references)
      ? ((parsed as { references: unknown[] }).references)
      : [];
  for (const r of refs) {
    if (!r || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    const cited = typeof o.cited_text === "string" ? o.cited_text : "";
    if (extractNumbers(cited).includes(value)) {
      return { excerpt: cited, sourceId: typeof o.source_id === "string" ? o.source_id : null };
    }
  }
  return { excerpt: null, sourceId: null };
}
