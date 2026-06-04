import { describe, it, expect } from "vitest";
import { openDb } from "../../src/db/db.js";
import { upsertCompany } from "../../src/db/companies.js";
import { insertScreenerMetric } from "../../src/db/metrics.js";
import { getComparisonData } from "../../src/dashboard/comparison.js";

function seed() {
  const db = openDb(":memory:");
  const acmeId = upsertCompany(db, { name: "Acme", ticker: null, industry: "Paints" });
  const betaId = upsertCompany(db, { name: "Beta Corp", ticker: null, industry: "Paints" });

  // Acme revenue across periods
  insertScreenerMetric(db, { company_id: acmeId, name: "revenue", value: 100, unit: "cr", period: "Mar 2024", source_url: null });
  insertScreenerMetric(db, { company_id: acmeId, name: "opm_pct", value: 18.5, unit: "%", period: "Mar 2024", source_url: null });

  // Beta Corp revenue
  insertScreenerMetric(db, { company_id: betaId, name: "revenue", value: 60, unit: "cr", period: "Mar 2024", source_url: null });
  insertScreenerMetric(db, { company_id: betaId, name: "opm_pct", value: 14.2, unit: "%", period: "Mar 2024", source_url: null });

  return { db };
}

describe("getComparisonData", () => {
  it("returns latest screener metric per company per metric_key for the given companies", () => {
    const { db } = seed();
    const data = getComparisonData(db, ["Acme", "Beta Corp"]);
    expect(data.companies).toEqual(["Acme", "Beta Corp"]);
    expect(data.metrics.length).toBeGreaterThan(0);

    const revenueRow = data.metrics.find((r) => r.name === "revenue");
    expect(revenueRow).toBeDefined();
    expect(revenueRow!.values["Acme"]).toBe(100);
    expect(revenueRow!.values["Beta Corp"]).toBe(60);
  });

  it("returns empty metrics for companies with no screener data", () => {
    const db = openDb(":memory:");
    upsertCompany(db, { name: "Ghost", ticker: null, industry: null });
    const data = getComparisonData(db, ["Ghost"]);
    expect(data.metrics).toEqual([]);
  });
});
