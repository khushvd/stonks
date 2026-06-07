import { describe, expect, it } from "vitest";
import { upsertCompany } from "../../src/db/companies.js";
import { openDb } from "../../src/db/db.js";
import { insertFiling } from "../../src/db/filings.js";
import { listMetrics, listStaging } from "../../src/db/metrics.js";
import { upsertNotebook } from "../../src/db/notebooks.js";
import { runPeerKpisForCompany } from "../../src/peer-kpis/peer-kpis.js";
import { listKpiStatuses, upsertKpiStatus } from "../../src/db/company-kpi-status.js";
import { verifyPending } from "../../src/verifier/verify.js";

describe("runPeerKpisForCompany", () => {
  it("stages found KPI values even when NotebookLM source ids do not map back to filings", async () => {
    const db = openDb(":memory:");
    const companyId = upsertCompany(db, { name: "ITC Hotels", ticker: "ITCHOTELS", industry: "Hotels" });
    const filingId = insertFiling(db, {
      company_id: companyId,
      type: "presentation",
      period: "FY26",
      source_url: "https://example.com/itc-hotels-presentation.pdf",
      local_path: "/tmp/itc-hotels-presentation.pdf",
    });
    upsertNotebook(db, companyId, "https://notebooklm.google.com/notebook/itc-hotels", "nb-itc-hotels");
    upsertKpiStatus(db, {
      company_id: companyId,
      metric_key: "revpar",
      label: "RevPAR",
      unit: "rs",
      status: "failed",
      missing_reason: "Found a value but no cited source mapped to an ingested filing.",
    });

    const expected = [{ metric_key: "revpar", label: "RevPAR", unit: "rs", priority: 10 }];
    const result = await runPeerKpisForCompany(db, "ITC Hotels", expected, "compare hotel KPIs", {
      nbAsk: async () => ({
        answer: JSON.stringify({
          kpis: [
            { metric_key: "revpar", label: "RevPAR", status: "found", value: 9700, unit: "rs", period: "FY26", cite: 14 },
          ],
        }),
        references: [
          {
            citation_number: 14,
            source_id: "unmapped-notebooklm-source",
            cited_text: "RevPAR for FY26 stood at 9,700, marking a 10% growth compared to FY25.",
          },
        ],
      }),
    });

    expect(result).toEqual([
      { metric_key: "revpar", label: "RevPAR", status: "found", value: 9700, unit: "rs", period: "FY26", cite: 14 },
    ]);
    expect(listKpiStatuses(db, companyId)).toEqual([]);

    const staged = listStaging(db, "pending");
    expect(staged).toEqual([
      expect.objectContaining({
        filing_id: filingId,
        name: "revpar",
        value: 9700,
        notebooklm_source_id: null,
      }),
    ]);

    await verifyPending(db, companyId, async () => [
      { page: 7, text: "A chart summary notes that RevPAR for FY26 stood at 9,700, marking a 10% growth compared to FY25." },
    ]);

    expect(listStaging(db, "pending")).toEqual([]);
    expect(listMetrics(db)).toEqual([
      expect.objectContaining({
        filing_id: filingId,
        name: "revpar",
        value: 9700,
        trust: "verified",
      }),
    ]);
  });
});
