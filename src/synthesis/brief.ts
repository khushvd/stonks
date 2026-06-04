import type { NbReference } from "../notebooklm/cli.js";
import type { Brief, Claim, ClaimMetric, ClaimSection } from "./types.js";

const SECTIONS: ClaimSection[] = ["answer", "guidance", "drivers", "risks", "industry_kpi"];

// Pull the first balanced {...} JSON object out of a possibly-prose/fenced answer.
function extractJsonObject(text: string): unknown | null {
  const start = text.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}") {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(text.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function coerceMetric(m: unknown): ClaimMetric | null {
  if (!m || typeof m !== "object") return null;
  const o = m as Record<string, unknown>;
  if (typeof o.name !== "string" || typeof o.value !== "number" || Number.isNaN(o.value)) return null;
  return {
    name: o.name,
    value: o.value,
    unit: typeof o.unit === "string" ? o.unit : null,
    period: typeof o.period === "string" ? o.period : null,
  };
}

function coerceClaim(c: unknown): Claim | null {
  if (!c || typeof c !== "object") return null;
  const o = c as Record<string, unknown>;
  if (typeof o.text !== "string" || o.text.trim() === "") return null; // text is required
  const section = SECTIONS.includes(o.section as ClaimSection) ? (o.section as ClaimSection) : "answer";
  return {
    text: o.text,
    section,
    cite: typeof o.cite === "number" ? o.cite : null,
    metric: coerceMetric(o.metric),
  };
}

export function parseBrief(answer: string, references: NbReference[], ask: string | null): Brief {
  const refs = references.map((r) => ({
    citation_number: r.citation_number,
    source_id: r.source_id,
    cited_text: r.cited_text,
  }));
  const parsed = extractJsonObject(answer) as Record<string, unknown> | null;
  const rawClaims = parsed && Array.isArray(parsed.claims) ? parsed.claims : [];
  const claims = rawClaims.map(coerceClaim).filter((c): c is Claim => c !== null);
  const rawKpis = parsed && Array.isArray(parsed.industryKpis) ? parsed.industryKpis : [];
  const industryKpis = rawKpis.filter((k): k is string => typeof k === "string");
  return { ask, claims, industryKpis, references: refs };
}
