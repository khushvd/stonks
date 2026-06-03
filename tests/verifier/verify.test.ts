import { describe, it, expect } from "vitest";
import { openDb } from "../../src/db/db.js";
import { upsertCompany } from "../../src/db/companies.js";
import { insertFiling } from "../../src/db/filings.js";
import { stageMetric, listMetrics, listStaging } from "../../src/db/metrics.js";
import { verifyPending } from "../../src/verifier/verify.js";
import type { MetricInput, PageText } from "../../src/types.js";

function setup() {
  const db = openDb(":memory:");
  const companyId = upsertCompany(db, { name: "Asian Paints", ticker: "ASIANPAINT", industry: "paints" });
  const filingId = insertFiling(db, { company_id: companyId, type: "result", period: "Q4FY26", source_url: "u", local_path: "/data/asianpaint/result-1.pdf" });
  return { db, companyId, filingId };
}

function input(filingId: number, over: Partial<MetricInput> = {}): MetricInput {
  return { filing_id: filingId, name: "pat", value: 8330, unit: "INR cr", period: "Q4FY26", source_page: null, excerpt: "PAT stood at 8,330 crore", source_url: "u", ...over };
}

const pages: PageText[] = [
  { page: 28, text: "Consolidated PAT for the quarter stood at 8,330 crore." },
  { page: 30, text: "Occupancy improved this quarter as shown in the chart below." },
];
const loadStub = async (_path: string): Promise<PageText[]> => pages;

describe("verifyPending", () => {
  it("promotes a verbatim number as verified and records its source_page", async () => {
    const { db, companyId, filingId } = setup();
    stageMetric(db, input(filingId));
    const outcomes = await verifyPending(db, companyId, loadStub);
    expect(outcomes).toEqual([{ staging_id: expect.any(Number), name: "pat", decision: "verified", source_page: 28 }]);
    const live = listMetrics(db);
    expect(live).toHaveLength(1);
    expect(live[0].trust).toBe("verified");
    expect(live[0].source_page).toBe(28);
    expect(listStaging(db, "pending")).toHaveLength(0);
  });

  it("promotes a chart-only number as notebooklm-only when only the excerpt is on the page", async () => {
    const { db, companyId, filingId } = setup();
    stageMetric(db, input(filingId, { name: "occupancy", value: 72, excerpt: "Occupancy improved this quarter" }));
    await verifyPending(db, companyId, loadStub);
    const live = listMetrics(db);
    expect(live[0].trust).toBe("notebooklm-only");
    expect(live[0].source_page).toBe(30);
  });

  it("rejects an unfindable number", async () => {
    const { db, companyId, filingId } = setup();
    stageMetric(db, input(filingId, { value: 99999, excerpt: "totally fabricated" }));
    await verifyPending(db, companyId, loadStub);
    expect(listMetrics(db)).toHaveLength(0);
    const rejected = listStaging(db, "rejected");
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reject_reason).toMatch(/not found/i);
  });
});
