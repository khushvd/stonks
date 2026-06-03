import { describe, it, expect } from "vitest";
import { openDb } from "../../src/db/db.js";
import { upsertCompany } from "../../src/db/companies.js";
import { insertFiling, setFilingSourceId } from "../../src/db/filings.js";
import { buildExtractPayload } from "../../src/cli/extract.js";

describe("buildExtractPayload", () => {
  it("surfaces notebooklm_source_id for each filing and echoes the ask", () => {
    const db = openDb(":memory:");
    const companyId = upsertCompany(db, { name: "Asian Paints", ticker: "ASIANPAINT", industry: "paints" });
    const fid = insertFiling(db, { company_id: companyId, type: "result", period: "Q4FY26", source_url: "u", local_path: "/a.pdf" });
    setFilingSourceId(db, fid, "src-A");

    const payload = buildExtractPayload(db, "Asian Paints", "focus on margins");
    expect(payload.filings[0].notebooklm_source_id).toBe("src-A");
    expect(payload.ask).toBe("focus on margins");
    expect(payload.metrics.universal.length).toBeGreaterThan(0);
  });

  it("throws when the company is unknown", () => {
    const db = openDb(":memory:");
    expect(() => buildExtractPayload(db, "Nope", null)).toThrow(/not found/i);
  });
});
