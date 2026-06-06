import { describe, it, expect } from "vitest";
import { openDb } from "../../src/db/db.js";
import { getIndustryMetrics, setIndustryMetrics } from "../../src/db/industry-metrics.js";

describe("industry-metrics cache", () => {
  it("returns [] for an unseen industry", () => {
    const db = openDb(":memory:");
    expect(getIndustryMetrics(db, "hotels")).toEqual([]);
  });

  it("sets and reads back a metric list", () => {
    const db = openDb(":memory:");
    setIndustryMetrics(db, "hotels", [
      { metric_key: "occupancy", label: "Occupancy %" },
      { metric_key: "arr", label: "Average Room Rate" },
    ], "notebooklm");
    const got = getIndustryMetrics(db, "hotels");
    expect(got).toEqual([
      { industry: "hotels", metric_key: "occupancy", label: "Occupancy %", unit: null, description: null, priority: null, source: "notebooklm" },
      { industry: "hotels", metric_key: "arr", label: "Average Room Rate", unit: null, description: null, priority: null, source: "notebooklm" },
    ]);
  });

  it("replaces the full list on re-set (no stale rows, source can change to sonnet)", () => {
    const db = openDb(":memory:");
    setIndustryMetrics(db, "cement", [{ metric_key: "realisation", label: "Realisation" }], "notebooklm");
    setIndustryMetrics(db, "cement", [{ metric_key: "logistics_cost", label: "Logistics cost" }], "sonnet");
    const got = getIndustryMetrics(db, "cement");
    expect(got).toEqual([{ industry: "cement", metric_key: "logistics_cost", label: "Logistics cost", unit: null, description: null, priority: null, source: "sonnet" }]);
  });
});
