import { describe, it, expect } from "vitest";
import { openDb } from "../../src/db/db.js";
import { upsertCompany } from "../../src/db/companies.js";
import { insertFiling } from "../../src/db/filings.js";
import { stageMetric, promoteMetric, rejectMetric } from "../../src/db/metrics.js";
import { getDashboard } from "../../src/dashboard/data.js";

function seed() {
  const db = openDb(":memory:");
  const companyId = upsertCompany(db, { name: "Asian Paints", ticker: "ASIANPAINT", industry: "Paints" });
  const filingId = insertFiling(db, {
    company_id: companyId,
    type: "presentation",
    period: "Q4FY26",
    source_url: "https://example.com/p.pdf",
    local_path: "data/asian-paints/presentation-0.pdf",
  });
  // a verified metric
  const v = stageMetric(db, { filing_id: filingId, name: "revenue", value: 9154, unit: "cr", period: "Q4FY26", source_page: 28, excerpt: "Revenue 9,154", source_url: null });
  promoteMetric(db, v, "verified");
  // a notebooklm-only metric
  const n = stageMetric(db, { filing_id: filingId, name: "market_share", value: 42, unit: "%", period: "FY26", source_page: null, excerpt: "chart", source_url: null });
  promoteMetric(db, n, "notebooklm-only");
  // a rejected metric
  const r = stageMetric(db, { filing_id: filingId, name: "pat", value: 9999, unit: "cr", period: "Q4FY26", source_page: 28, excerpt: "not found", source_url: null });
  rejectMetric(db, r, "value not present on cited page");
  return { db };
}

describe("getDashboard", () => {
  it("returns company, integrity split, metric rows with badges + citations, and rejects", () => {
    const { db } = seed();
    const d = getDashboard(db, "Asian Paints");
    expect(d).not.toBeNull();
    expect(d!.company.name).toBe("Asian Paints");
    expect(d!.integrity).toEqual({ verified: 1, notebooklmOnly: 1, pending: 0, rejected: 1 });

    const rev = d!.metrics.find((m) => m.name === "revenue")!;
    expect(rev.badge.label).toBe("VERIFIED");
    expect(rev.citationHref).toBe("/api/pdf?path=data%2Fasian-paints%2Fpresentation-0.pdf#page=28");

    const share = d!.metrics.find((m) => m.name === "market_share")!;
    expect(share.badge.label).toBe("NLM-ONLY");
    expect(share.citationHref).toBeNull(); // no source page → no citation

    expect(d!.rejects).toEqual([
      { name: "pat", value: 9999, unit: "cr", period: "Q4FY26", reason: "value not present on cited page", excerpt: "not found" },
    ]);
  });

  it("returns null for an unknown company", () => {
    const { db } = seed();
    expect(getDashboard(db, "Nonexistent")).toBeNull();
  });
});
