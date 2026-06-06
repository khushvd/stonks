import { describe, expect, it } from "vitest";
import { openDb } from "../../src/db/db.js";
import { setIndustryMetrics } from "../../src/db/industry-metrics.js";
import { buildExpectedKpis, normalizeMetricKey } from "../../src/dashboard/sector-kpis.js";

describe("buildExpectedKpis", () => {
  it("includes hotel KPIs such as RevPAR even when the cache is sparse", () => {
    const db = openDb(":memory:");
    const kpis = buildExpectedKpis(db, {
      industry: "Hotels",
      briefIndustryKpis: [],
    });

    expect(kpis.map((k) => k.metric_key)).toEqual(
      expect.arrayContaining(["revpar", "arr_or_adr", "occupancy", "rooms_or_keys", "ebitda_margin"]),
    );
  });

  it("merges cached industry metrics and brief-discovered KPIs without duplicates", () => {
    const db = openDb(":memory:");
    setIndustryMetrics(db, "Hotels", [{ metric_key: "RevPAR", label: "RevPAR" }], "notebooklm");
    const kpis = buildExpectedKpis(db, {
      industry: "Hotels",
      briefIndustryKpis: ["RevPAR", "Occupancy Rate"],
    });

    expect(kpis.filter((k) => k.metric_key === "revpar")).toHaveLength(1);
    expect(kpis.map((k) => k.metric_key)).toContain("occupancy_rate");
  });
});

describe("normalizeMetricKey", () => {
  it("normalizes display labels into stable metric keys", () => {
    expect(normalizeMetricKey("RevPAR")).toBe("revpar");
    expect(normalizeMetricKey("ARR / ADR")).toBe("arr_adr");
  });
});
