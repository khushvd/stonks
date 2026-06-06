import { describe, expect, it } from "vitest";
import { openDb } from "../../src/db/db.js";
import { upsertCompany } from "../../src/db/companies.js";
import { insertFiling } from "../../src/db/filings.js";
import { insertScreenerMetric, promoteMetric, stageMetric } from "../../src/db/metrics.js";
import { upsertKpiStatus } from "../../src/db/company-kpi-status.js";
import { getComparisonData } from "../../src/dashboard/comparison.js";

function seed() {
  const db = openDb(":memory:");
  const samhiId = upsertCompany(db, { name: "SAMHI Hotels", ticker: "SAMHI", industry: "Hotels" });
  const chaletId = upsertCompany(db, { name: "Chalet Hotels", ticker: null, industry: "Hotels" });
  const lemonId = upsertCompany(db, { name: "Lemon Tree", ticker: null, industry: "Hotels" });
  const ihclId = upsertCompany(db, { name: "Indian Hotels", ticker: null, industry: "Hotels" });

  upsertKpiStatus(db, {
    company_id: samhiId,
    metric_key: "revpar",
    label: "RevPAR",
    unit: "rs",
    status: "missing",
    missing_reason: "No RevPAR value found.",
  });

  insertScreenerMetric(db, { company_id: chaletId, name: "revpar", value: 6742, unit: "rs", period: "Q4FY26", source_url: null });

  const filingId = insertFiling(db, { company_id: lemonId, type: "presentation", period: "Q4FY26", source_url: "u", local_path: "/tmp/lemon.pdf" });
  const staged = stageMetric(db, {
    filing_id: filingId,
    name: "occupancy",
    value: 72,
    unit: "%",
    period: "Q4FY26",
    source_page: null,
    excerpt: "Occupancy was 72%",
    source_url: "u",
  });
  promoteMetric(db, staged, "verified");

  return { db, companyNames: ["SAMHI Hotels", "Chalet Hotels", "Lemon Tree", "Indian Hotels"], ihclId };
}

describe("getComparisonData", () => {
  it("renders expected hotel KPI rows with missing and trust-aware value cells", () => {
    const { db, companyNames } = seed();
    const data = getComparisonData(db, companyNames);

    expect(data.companies).toEqual(companyNames);
    const revpar = data.metrics.find((r) => r.name === "revpar");
    expect(revpar?.label).toBe("RevPAR");
    expect(revpar?.cells["SAMHI Hotels"]).toEqual(expect.objectContaining({ state: "missing", reason: "No RevPAR value found." }));
    expect(revpar?.cells["Chalet Hotels"]).toEqual(expect.objectContaining({ state: "value", value: 6742, trust: "screener" }));

    const occupancy = data.metrics.find((r) => r.name === "occupancy");
    expect(occupancy?.cells["Lemon Tree"]).toEqual(expect.objectContaining({ state: "value", value: 72, trust: "verified" }));
    expect(occupancy?.cells["Indian Hotels"]).toEqual(expect.objectContaining({ state: "missing" }));
    expect(data.coverage.find((c) => c.company === "SAMHI Hotels")).toEqual(expect.objectContaining({
      annualReports: 0,
      presentations: 0,
      concalls: 0,
      missingKpis: expect.arrayContaining(["revpar"]),
    }));
  });

  it("keeps expected rows even when no company has a value", () => {
    const db = openDb(":memory:");
    upsertCompany(db, { name: "Ghost Hotels", ticker: null, industry: "Hotels" });
    const data = getComparisonData(db, ["Ghost Hotels"]);

    expect(data.metrics.map((m) => m.name)).toContain("revpar");
    expect(data.metrics.find((m) => m.name === "revpar")?.cells["Ghost Hotels"]).toEqual(expect.objectContaining({ state: "missing" }));
  });

  it("infers the hotel KPI pack for SAMHI even when scraped company industry is null", () => {
    const db = openDb(":memory:");
    upsertCompany(db, { name: "SAMHI Hotels", ticker: "SAMHI", industry: null });
    const data = getComparisonData(db, ["SAMHI Hotels"]);

    expect(data.metrics.map((m) => m.name)).toContain("revpar");
    expect(data.metrics.find((m) => m.name === "revpar")?.cells["SAMHI Hotels"]).toEqual(expect.objectContaining({ state: "missing" }));
  });
});
