import { describe, it, expect } from "vitest";
import { openDb } from "../../src/db/db.js";
import { upsertCompany } from "../../src/db/companies.js";
import { upsertNotebook } from "../../src/db/notebooks.js";
import { insertFiling, setFilingSourceId } from "../../src/db/filings.js";
import { getLatestBrief } from "../../src/db/briefs.js";
import { listStaging } from "../../src/db/metrics.js";
import { runSynthesis } from "../../src/cli/synthesize.js";

function seed() {
  const db = openDb(":memory:");
  const companyId = upsertCompany(db, { name: "Acme", ticker: null, industry: "Paints" });
  upsertNotebook(db, companyId, "url", "nb-1");
  const filingId = insertFiling(db, { company_id: companyId, type: "result", period: "Q4FY24", source_url: null, local_path: "data/acme/q4.pdf" });
  setFilingSourceId(db, filingId, "src-1");
  return { db, companyId };
}

describe("runSynthesis", () => {
  it("asks NotebookLM, persists the brief, and stages claim numbers", async () => {
    const { db, companyId } = seed();
    const fakeAsk = async (_nb: string, _q: string) => ({
      answer: JSON.stringify({
        claims: [{ text: "Revenue 100cr", section: "answer", cite: 1, metric: { name: "revenue", value: 100, unit: "cr", period: "Q4FY24" } }],
        industryKpis: ["RevPAR"],
      }),
      references: [{ source_id: "src-1", citation_number: 1, cited_text: "Revenue stood at 100 cr" }],
    });

    const brief = await runSynthesis(db, "Acme", "how is revenue?", { nbAsk: fakeAsk });

    expect(brief.claims).toHaveLength(1);
    expect(getLatestBrief(db, companyId)?.ask).toBe("how is revenue?");
    expect(listStaging(db, "pending")).toHaveLength(1);
  });

  it("throws a clear error if the company has no notebook", async () => {
    const db = openDb(":memory:");
    upsertCompany(db, { name: "NoNb", ticker: null, industry: null });
    await expect(runSynthesis(db, "NoNb", "q", { nbAsk: async () => ({ answer: "{}", references: [] }) }))
      .rejects.toThrow(/notebook/i);
  });
});
