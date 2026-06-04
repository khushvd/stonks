import { describe, it, expect } from "vitest";
import { openDb } from "../../src/db/db.js";
import { upsertCompany } from "../../src/db/companies.js";
import { insertFiling, setFilingSourceId } from "../../src/db/filings.js";
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

  it("rejects with a clear reason when the filing has no downloaded PDF", async () => {
    const db = openDb(":memory:");
    const companyId = upsertCompany(db, { name: "NoPDF Co", ticker: "NOPDF", industry: null });
    const filingId = insertFiling(db, { company_id: companyId, type: "result", period: "Q4FY26", source_url: "u", local_path: null });
    stageMetric(db, { filing_id: filingId, name: "pat", value: 8330, unit: null, period: null, source_page: null, excerpt: "PAT 8,330", source_url: "u" });
    await verifyPending(db, companyId, async () => []);
    const rejected = listStaging(db, "rejected");
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reject_reason).toMatch(/no (source )?pdf|not downloaded|local_path/i);
  });
});

describe("verifyPending source-scoping", () => {
  // PDF-A contains 9,228; PDF-B does not.
  const pagesByPath: Record<string, PageText[]> = {
    "/a.pdf": [{ page: 1, text: "Revenue grew to 9,228 crore this quarter." }],
    "/b.pdf": [{ page: 1, text: "Some other commentary with 5,000 mentioned." }],
  };
  const loader = async (path: string): Promise<PageText[]> => pagesByPath[path] ?? [];

  function twoFilings() {
    const db = openDb(":memory:");
    const companyId = upsertCompany(db, { name: "Co", ticker: null, industry: null });
    const a = insertFiling(db, { company_id: companyId, type: "result", period: "Q4", source_url: "ua", local_path: "/a.pdf" });
    const b = insertFiling(db, { company_id: companyId, type: "presentation", period: "Q4", source_url: "ub", local_path: "/b.pdf" });
    setFilingSourceId(db, a, "src-A");
    setFilingSourceId(db, b, "src-B");
    return { db, companyId, a, b };
  }

  it("verifies a value cited to the source whose PDF contains it", async () => {
    const { db, companyId, a } = twoFilings();
    stageMetric(db, { filing_id: a, name: "revenue", value: 9228, unit: "INR cr", period: "Q4", source_page: null, excerpt: null, source_url: "ua", notebooklm_source_id: "src-A" });
    await verifyPending(db, companyId, loader);
    const live = listMetrics(db);
    expect(live).toHaveLength(1);
    expect(live[0].trust).toBe("verified");
  });

  it("rejects the SAME value when cited to a source whose PDF lacks it (scoping tightens integrity)", async () => {
    const { db, companyId, b } = twoFilings();
    stageMetric(db, { filing_id: b, name: "revenue", value: 9228, unit: "INR cr", period: "Q4", source_page: null, excerpt: null, source_url: "ub", notebooklm_source_id: "src-B" });
    await verifyPending(db, companyId, loader);
    expect(listMetrics(db)).toHaveLength(0);
    expect(listStaging(db, "rejected")).toHaveLength(1);
  });

  it("falls back to all company PDFs when notebooklm_source_id is null", async () => {
    const { db, companyId, b } = twoFilings();
    // Staged against filing B (no source id) but the value lives in PDF-A; all-pages fallback finds it.
    stageMetric(db, { filing_id: b, name: "revenue", value: 9228, unit: "INR cr", period: "Q4", source_page: null, excerpt: null, source_url: "ub", notebooklm_source_id: null });
    await verifyPending(db, companyId, loader);
    expect(listMetrics(db)).toHaveLength(1);
    expect(listMetrics(db)[0].trust).toBe("verified");
  });
});
