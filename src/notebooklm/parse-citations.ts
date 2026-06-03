import type { Citation } from "../types.js";

function toNumber(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  const m = v.replace(/,/g, "").match(/-?\d+(\.\d+)?/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : null;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v : null;
}

function rowsFrom(parsed: unknown): unknown[] {
  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === "object") {
    for (const key of ["metrics", "citations", "answer", "results", "data"]) {
      const v = (parsed as Record<string, unknown>)[key];
      if (Array.isArray(v)) return v;
    }
  }
  return [];
}

// Tolerant: parse NotebookLM's ask_question JSON into clean Citations.
// Drops any row without a name and a usable number — the integrity gate prefers gaps to guesses.
export function parseCitations(raw: string): Citation[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  const out: Citation[] = [];
  for (const r of rowsFrom(parsed)) {
    if (!r || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    const name = str(o.name);
    const value = toNumber(o.value);
    if (name === null || value === null) continue;
    out.push({
      name,
      value,
      unit: str(o.unit),
      period: str(o.period),
      excerpt: str(o.excerpt),
      sourceUrl: str(o.url) ?? str(o.sourceUrl),
    });
  }
  return out;
}
