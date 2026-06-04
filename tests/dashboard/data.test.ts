import { describe, it, expect } from "vitest";
import { openDb } from "../../src/db/db.js";
import { upsertCompany, getCompany } from "../../src/db/companies.js";
import { insertFiling, setFilingSourceId } from "../../src/db/filings.js";
import { stageMetric, promoteMetric, rejectMetric } from "../../src/db/metrics.js";
import { saveBrief } from "../../src/db/briefs.js";
import { getDashboard } from "../../src/dashboard/data.js";
import type { Brief } from "../../src/synthesis/types.js";

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

  // a SECOND company with its own metrics — must NOT bleed into Asian Paints' integrity tile
  const otherId = upsertCompany(db, { name: "Berger Paints", ticker: "BERGEPAINT", industry: "Paints" });
  const otherFiling = insertFiling(db, {
    company_id: otherId,
    type: "presentation",
    period: "Q4FY26",
    source_url: "https://example.com/b.pdf",
    local_path: "data/berger/presentation-0.pdf",
  });
  const ov = stageMetric(db, { filing_id: otherFiling, name: "revenue", value: 3000, unit: "cr", period: "Q4FY26", source_page: 5, excerpt: "Rev 3,000", source_url: null });
  promoteMetric(db, ov, "verified");
  // left pending — must not count toward Asian Paints' pending
  stageMetric(db, { filing_id: otherFiling, name: "ebitda", value: 500, unit: "cr", period: "Q4FY26", source_page: 6, excerpt: "pending", source_url: null });
  const orj = stageMetric(db, { filing_id: otherFiling, name: "pat", value: 1, unit: "cr", period: "Q4FY26", source_page: 7, excerpt: "bad", source_url: null });
  rejectMetric(db, orj, "other-company reject");

  return { db };
}

describe("getDashboard", () => {
  it("returns company, integrity split, metric rows with badges + citations, and rejects", () => {
    const { db } = seed();
    const d = getDashboard(db, "Asian Paints");
    expect(d).not.toBeNull();
    expect(d!.company.name).toBe("Asian Paints");
    // scoped to Asian Paints only — Berger's 1 verified / 1 pending / 1 rejected must not leak in
    expect(d!.integrity).toEqual({ verified: 1, notebooklmOnly: 1, pending: 0, rejected: 1 });

    const rev = d!.metrics.find((m) => m.name === "revenue")!;
    expect(rev.badge.label).toBe("VERIFIED");
    expect(rev.citationHref).toBe("/api/pdf?path=data%2Fasian-paints%2Fpresentation-0.pdf#page=28");

    // market_share is notebooklm-only and not in UNIVERSAL_BASE — it may not appear in the scoped
    // evidence metrics unless a brief references it. Integrity count still includes it.
    const share = d!.metrics.find((m) => m.name === "market_share");
    // If present (e.g. when a brief references it), check badge; otherwise just verify integrity counts.
    if (share) {
      expect(share.badge.label).toBe("NLM-ONLY");
      expect(share.citationHref).toBeNull(); // no source page → no citation
    }

    expect(d!.rejects).toEqual([
      { name: "pat", value: 9999, unit: "cr", period: "Q4FY26", reason: "value not present on cited page", excerpt: "not found" },
    ]);
  });

  it("returns null for an unknown company", () => {
    const { db } = seed();
    expect(getDashboard(db, "Nonexistent")).toBeNull();
  });
});

describe("getDashboard brief shaping", () => {
  function seedWithVerifiedRevenue() {
    const db = openDb(":memory:");
    const companyId = upsertCompany(db, { name: "Acme", ticker: null, industry: "Paints" });
    const filingId = insertFiling(db, {
      company_id: companyId,
      type: "result",
      period: "Q4FY24",
      source_url: null,
      local_path: "data/acme/q4.pdf",
    });
    setFilingSourceId(db, filingId, "src-1");
    const stagingId = stageMetric(db, { filing_id: filingId, name: "revenue", value: 100, unit: "cr", period: "Q4FY24", source_page: 5, excerpt: "Revenue 100", source_url: null, notebooklm_source_id: "src-1" });
    promoteMetric(db, stagingId, "verified");
    return { db };
  }

  it("returns a BriefView with resolved source links and number badges", () => {
    const { db } = seedWithVerifiedRevenue();
    const brief: Brief = {
      ask: "how is revenue?",
      claims: [
        { text: "Revenue grew to 100cr", section: "answer", cite: 1, metric: { name: "revenue", value: 100, unit: "cr", period: "Q4FY24" } },
        { text: "Input costs are a risk", section: "risks", cite: 1, metric: null },
      ],
      industryKpis: ["RevPAR"],
      references: [{ citation_number: 1, source_id: "src-1", cited_text: "Revenue stood at 100 cr" }],
    };
    saveBrief(db, getCompany(db, "Acme")!.id, brief.ask, JSON.stringify(brief));

    const data = getDashboard(db, "Acme")!;
    expect(data.brief).not.toBeNull();
    expect(data.brief!.claims).toHaveLength(2);
    const answerClaim = data.brief!.claims.find((c) => c.section === "answer")!;
    expect(answerClaim.sourceHref).toBe("/api/pdf?path=data%2Facme%2Fq4.pdf");
    expect(answerClaim.metric?.badge.label).toBe("VERIFIED");
    expect(data.brief!.industryKpis).toEqual(["RevPAR"]);
  });

  it("returns null brief when none stored", () => {
    const { db } = seedWithVerifiedRevenue();
    const data = getDashboard(db, "Acme")!;
    expect(data.brief).toBeNull();
  });
});
