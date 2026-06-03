import { describe, it, expect } from "vitest";
import { openDb } from "../../src/db/db.js";
import { upsertCompany, getCompany } from "../../src/db/companies.js";
import { insertFiling, listFilings } from "../../src/db/filings.js";

describe("companies + filings", () => {
  it("upserts a company idempotently by name", () => {
    const db = openDb(":memory:");
    const id1 = upsertCompany(db, { name: "Asian Paints", ticker: "ASIANPAINT", industry: "Paints" });
    const id2 = upsertCompany(db, { name: "Asian Paints", ticker: "ASIANPAINT", industry: "Paints" });
    expect(id1).toBe(id2);
    expect(getCompany(db, "Asian Paints")?.industry).toBe("Paints");
  });

  it("inserts and lists filings for a company", () => {
    const db = openDb(":memory:");
    const companyId = upsertCompany(db, { name: "Asian Paints", ticker: null, industry: null });
    insertFiling(db, {
      company_id: companyId, type: "presentation", period: "Q4FY26",
      source_url: "https://x/ppt.pdf", local_path: "data/x.pdf",
    });
    const filings = listFilings(db, companyId);
    expect(filings).toHaveLength(1);
    expect(filings[0].type).toBe("presentation");
  });
});
