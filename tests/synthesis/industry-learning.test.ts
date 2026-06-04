import { describe, it, expect } from "vitest";
import { openDb } from "../../src/db/db.js";
import { upsertCompany } from "../../src/db/companies.js";
import { upsertNotebook } from "../../src/db/notebooks.js";
import { getIndustryMetrics } from "../../src/db/industry-metrics.js";
import { runSynthesis } from "../../src/cli/synthesize.js";

function seed() {
  const db = openDb(":memory:");
  const companyId = upsertCompany(db, { name: "HotelCo", ticker: null, industry: "Hospitality" });
  upsertNotebook(db, companyId, "url", "nb-1");
  return { db, companyId };
}

describe("industry KPI caching via runSynthesis", () => {
  it("caches industryKpis from the brief into industry_metrics after synthesis", async () => {
    const { db } = seed();
    const fakeAsk = async (_nb: string, _q: string) => ({
      answer: JSON.stringify({
        claims: [{ text: "RevPAR improved to 5200", section: "industry_kpi", cite: null, metric: null }],
        industryKpis: ["RevPAR", "Occupancy Rate", "ADR"],
      }),
      references: [],
    });

    await runSynthesis(db, "HotelCo", "how is performance?", { nbAsk: fakeAsk });

    const cached = getIndustryMetrics(db, "Hospitality");
    expect(cached.length).toBe(3);
    expect(cached.map((k) => k.metric_key)).toContain("RevPAR");
    expect(cached.map((k) => k.metric_key)).toContain("Occupancy Rate");
    expect(cached[0].source).toBe("notebooklm");
  });

  it("does not cache KPIs if industry is unknown", async () => {
    const db = openDb(":memory:");
    const companyId = upsertCompany(db, { name: "UnknownCo", ticker: null, industry: null });
    upsertNotebook(db, companyId, "url", "nb-2");
    const fakeAsk = async (_nb: string, _q: string) => ({
      answer: JSON.stringify({ claims: [], industryKpis: ["SomeKPI"] }),
      references: [],
    });
    await runSynthesis(db, "UnknownCo", null, { nbAsk: fakeAsk });
    // No industry set → nothing cached (can't key by null industry)
    const cached = getIndustryMetrics(db, "");
    expect(cached).toHaveLength(0);
  });
});
