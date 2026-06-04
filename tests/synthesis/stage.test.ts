import { describe, it, expect } from "vitest";
import { openDb } from "../../src/db/db.js";
import { upsertCompany } from "../../src/db/companies.js";
import { insertFiling, setFilingSourceId } from "../../src/db/filings.js";
import { listStaging } from "../../src/db/metrics.js";
import { stageBriefMetrics } from "../../src/synthesis/stage.js";
import type { Brief } from "../../src/synthesis/types.js";

function seed() {
  const db = openDb(":memory:");
  const companyId = upsertCompany(db, { name: "Acme", ticker: null, industry: null });
  const filingId = insertFiling(db, { company_id: companyId, type: "result", period: "Q4FY24", source_url: null, local_path: "data/acme/q4.pdf" });
  setFilingSourceId(db, filingId, "src-1");
  return { db, companyId, filingId };
}

function brief(claims: Brief["claims"], references: Brief["references"]): Brief {
  return { ask: null, claims, industryKpis: [], references };
}

describe("stageBriefMetrics", () => {
  it("stages a claim's number against the filing its citation resolves to", () => {
    const { db, companyId, filingId } = seed();
    const b = brief(
      [{ text: "Revenue 100cr", section: "answer", cite: 1, metric: { name: "revenue", value: 100, unit: "cr", period: "Q4FY24" } }],
      [{ citation_number: 1, source_id: "src-1", cited_text: "Revenue stood at 100 cr" }],
    );
    const staged = stageBriefMetrics(db, companyId, b);
    expect(staged).toBe(1);
    const rows = listStaging(db, "pending");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ filing_id: filingId, name: "revenue", value: 100, notebooklm_source_id: "src-1", excerpt: "Revenue stood at 100 cr" });
  });

  it("skips claims with no metric, and metrics whose citation has no matching filing", () => {
    const { db, companyId } = seed();
    const b = brief(
      [
        { text: "no number here", section: "risks", cite: 1, metric: null },
        { text: "PAT 50", section: "answer", cite: 9, metric: { name: "pat", value: 50, unit: "cr", period: null } },
      ],
      [{ citation_number: 1, source_id: "src-1", cited_text: "x" }],
    );
    expect(stageBriefMetrics(db, companyId, b)).toBe(0);
    expect(listStaging(db, "pending")).toHaveLength(0);
  });
});
