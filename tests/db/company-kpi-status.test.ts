import { describe, expect, it } from "vitest";
import { openDb } from "../../src/db/db.js";
import { upsertCompany } from "../../src/db/companies.js";
import { listKpiStatuses, upsertKpiStatus } from "../../src/db/company-kpi-status.js";

describe("company KPI status helpers", () => {
  it("upserts missing KPI status per company and metric", () => {
    const db = openDb(":memory:");
    const companyId = upsertCompany(db, { name: "SAMHI Hotels", ticker: "SAMHI", industry: "Hotels" });

    upsertKpiStatus(db, {
      company_id: companyId,
      metric_key: "revpar",
      label: "RevPAR",
      unit: "rs",
      status: "missing",
      missing_reason: "No RevPAR value found in latest AR or last 4 quarters.",
    });
    upsertKpiStatus(db, {
      company_id: companyId,
      metric_key: "revpar",
      label: "RevPAR",
      unit: "rs",
      status: "failed",
      missing_reason: "NotebookLM returned malformed JSON.",
    });

    expect(listKpiStatuses(db, companyId)).toEqual([
      expect.objectContaining({
        company_id: companyId,
        metric_key: "revpar",
        label: "RevPAR",
        unit: "rs",
        status: "failed",
        missing_reason: "NotebookLM returned malformed JSON.",
      }),
    ]);
  });
});
