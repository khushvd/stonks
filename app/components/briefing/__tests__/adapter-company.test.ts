import { describe, it, expect } from "vitest";
import { mapCompany, stubAbout, stubBottomLine } from "../adapter-company";
import type { Company, Filing, IntegritySummary } from "../../../src/types.js";

const company: Company = { id: 1, name: "Indian Hotels Co.", ticker: "INDHOTEL", industry: "Hotels" };
const filings: Filing[] = [
  { id: 1, company_id: 1, type: "result", period: "Dec 2024", source_url: null, local_path: null, notebooklm_source_id: null },
  { id: 2, company_id: 1, type: "result", period: "Mar 2025", source_url: null, local_path: null, notebooklm_source_id: null },
];

describe("mapCompany", () => {
  it("fills identity and uses the latest filing period as asOf", () => {
    expect(mapCompany(company, filings)).toEqual({
      name: "Indian Hotels Co.", ticker: "INDHOTEL", industry: "Hotels", sector: "Hotels", asOf: "Mar 2025",
    });
  });
  it("tolerates null ticker/industry and no filings", () => {
    expect(mapCompany({ id: 2, name: "X", ticker: null, industry: null }, [])).toEqual({
      name: "X", ticker: "", industry: "", sector: "", asOf: "",
    });
  });
});

describe("stubAbout", () => {
  it("derives a one-line placeholder from name + industry", () => {
    expect(stubAbout(company)).toContain("Indian Hotels Co.");
    expect(stubAbout(company)).toContain("Hotels");
  });
});

describe("stubBottomLine", () => {
  it("references verified/rejected counts and a contradiction when present", () => {
    const integrity: IntegritySummary = { verified: 47, notebooklmOnly: 3, pending: 2, rejected: 1 };
    const bl = stubBottomLine(integrity, true);
    expect(bl.worth).toContain("47");
    expect(bl.watch).toContain("contradiction");
  });
  it("omits the contradiction clause when there is none", () => {
    const integrity: IntegritySummary = { verified: 10, notebooklmOnly: 0, pending: 0, rejected: 0 };
    expect(stubBottomLine(integrity, false).watch).not.toContain("contradiction");
  });
});
