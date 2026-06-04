import { describe, it, expect } from "vitest";
import { openDb } from "../../src/db/db.js";
import { upsertCompany } from "../../src/db/companies.js";
import { insertScreenerMetric } from "../../src/db/metrics.js";
import { getDashboard } from "../../src/dashboard/data.js";

function seed() {
  const db = openDb(":memory:");
  const companyId = upsertCompany(db, { name: "Acme", ticker: null, industry: null });
  // Insert several quarterly screener revenue rows
  for (const [period, value] of [["Mar 2023", 100], ["Jun 2023", 110], ["Sep 2023", 105], ["Dec 2023", 120]]) {
    insertScreenerMetric(db, { company_id: companyId, name: "revenue", value: value as number, unit: "cr", period: period as string, source_url: null });
  }
  // Insert OPM%
  insertScreenerMetric(db, { company_id: companyId, name: "opm_pct", value: 18.5, unit: "%", period: "Mar 2023", source_url: null });
  return { db };
}

describe("getDashboard trends", () => {
  it("includes screener metrics in the trends array", () => {
    const { db } = seed();
    const data = getDashboard(db, "Acme")!;
    expect(data.trends).toBeDefined();
    expect(data.trends.length).toBeGreaterThan(0);

    const revTrend = data.trends.find((t) => t.name === "revenue");
    expect(revTrend).toBeDefined();
    expect(revTrend!.points.length).toBe(4);
    expect(revTrend!.unit).toBe("cr");
  });

  it("returns empty trends when no screener metrics exist", () => {
    const db = openDb(":memory:");
    upsertCompany(db, { name: "Empty", ticker: null, industry: null });
    const data = getDashboard(db, "Empty")!;
    expect(data.trends).toEqual([]);
  });
});
