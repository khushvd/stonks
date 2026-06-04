import { describe, it, expect } from "vitest";
import { openDb } from "../../src/db/db.js";
import { upsertCompany } from "../../src/db/companies.js";
import { insertFiling, setFilingSourceId, getFilingBySourceId, listFilings } from "../../src/db/filings.js";

function setup() {
  const db = openDb(":memory:");
  const companyId = upsertCompany(db, { name: "Asian Paints", ticker: "ASIANPAINT", industry: "paints" });
  const filingId = insertFiling(db, { company_id: companyId, type: "result", period: "Q4FY26", source_url: "u", local_path: "/a.pdf" });
  return { db, companyId, filingId };
}

describe("filing source-id helpers", () => {
  it("sets and reads back a source id", () => {
    const { db, companyId, filingId } = setup();
    setFilingSourceId(db, filingId, "src-A");
    const f = getFilingBySourceId(db, companyId, "src-A");
    expect(f?.id).toBe(filingId);
    expect(f?.notebooklm_source_id).toBe("src-A");
  });

  it("listFilings includes notebooklm_source_id (null before set)", () => {
    const { db, companyId, filingId } = setup();
    expect(listFilings(db, companyId)[0].notebooklm_source_id).toBeNull();
    setFilingSourceId(db, filingId, "src-A");
    expect(listFilings(db, companyId)[0].notebooklm_source_id).toBe("src-A");
  });

  it("returns undefined for an unknown source id", () => {
    const { db, companyId } = setup();
    expect(getFilingBySourceId(db, companyId, "nope")).toBeUndefined();
  });
});
