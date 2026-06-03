import { describe, it, expect } from "vitest";
import { openDb } from "../../src/db/db.js";
import { upsertCompany } from "../../src/db/companies.js";
import { insertFiling } from "../../src/db/filings.js";
import { stageMetric, promoteMetric, rejectMetric, listMetrics, listStaging, integritySummary } from "../../src/db/metrics.js";
import type { MetricInput } from "../../src/types.js";

function setup() {
  const db = openDb(":memory:");
  const companyId = upsertCompany(db, { name: "Asian Paints", ticker: null, industry: null });
  const filingId = insertFiling(db, { company_id: companyId, type: "result", period: "Q4FY26", source_url: "u", local_path: "p" });
  return { db, filingId };
}

function input(filingId: number, over: Partial<MetricInput> = {}): MetricInput {
  return { filing_id: filingId, name: "revenue", value: 1000, unit: "INR cr", period: "Q4FY26", source_page: 3, excerpt: "Revenue 1,000 cr", source_url: "https://bse/u.pdf", ...over };
}

describe("metrics staging and promotion", () => {
  it("stages a metric as pending with its excerpt and source_url, not in live table", () => {
    const { db, filingId } = setup();
    stageMetric(db, input(filingId));
    const staged = listStaging(db, "pending");
    expect(staged).toHaveLength(1);
    expect(staged[0].excerpt).toBe("Revenue 1,000 cr");
    expect(staged[0].source_url).toBe("https://bse/u.pdf");
    expect(listMetrics(db)).toHaveLength(0);
    expect(integritySummary(db)).toEqual({ verified: 0, notebooklmOnly: 0, pending: 1, rejected: 0 });
  });

  it("promotes as verified by default", () => {
    const { db, filingId } = setup();
    const sid = stageMetric(db, input(filingId));
    const mid = promoteMetric(db, sid);
    const live = listMetrics(db);
    expect(live).toHaveLength(1);
    expect(live[0].id).toBe(mid);
    expect(live[0].value).toBe(1000);
    expect(live[0].trust).toBe("verified");
    expect(listStaging(db, "pending")).toHaveLength(0);
    expect(integritySummary(db)).toEqual({ verified: 1, notebooklmOnly: 0, pending: 0, rejected: 0 });
  });

  it("promotes with trust='notebooklm-only' when asked", () => {
    const { db, filingId } = setup();
    const sid = stageMetric(db, input(filingId, { name: "occupancy", value: 72 }));
    promoteMetric(db, sid, "notebooklm-only");
    const live = listMetrics(db);
    expect(live[0].trust).toBe("notebooklm-only");
    expect(integritySummary(db)).toEqual({ verified: 0, notebooklmOnly: 1, pending: 0, rejected: 0 });
  });

  it("rejects a staged metric with a reason and keeps it out of the live table", () => {
    const { db, filingId } = setup();
    const sid = stageMetric(db, input(filingId, { value: 9999, unit: null, period: null }));
    rejectMetric(db, sid, "value not found on source page");
    expect(listMetrics(db)).toHaveLength(0);
    const rejected = listStaging(db, "rejected");
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reject_reason).toBe("value not found on source page");
    expect(integritySummary(db)).toEqual({ verified: 0, notebooklmOnly: 0, pending: 0, rejected: 1 });
  });

  it("throws when promoting a non-pending id", () => {
    const { db } = setup();
    expect(() => promoteMetric(db, 999)).toThrow();
  });
});
