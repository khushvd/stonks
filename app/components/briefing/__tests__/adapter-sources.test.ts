import { describe, it, expect } from "vitest";
import { mapSources } from "../adapter-sources";
import type { Filing } from "../../../../src/types.js";

const f = (id: number, type: Filing["type"], period: string | null): Filing => ({
  id, company_id: 1, type, period, source_url: null, local_path: null, notebooklm_source_id: null,
});

describe("mapSources", () => {
  it("maps filing types to briefing source types with labels", () => {
    expect(mapSources([f(1, "presentation", "Mar 2025"), f(2, "annual_report", null)])).toEqual([
      { type: "DECK", label: "Investor presentation Mar 2025", page: 1 },
      { type: "AR", label: "Annual report", page: 1 },
    ]);
  });
  it("maps result filings to RESULT", () => {
    expect(mapSources([f(3, "result", "Mar 2025")])[0].type).toBe("RESULT");
  });
  it("caps the list at eight cards", () => {
    const many = Array.from({ length: 12 }, (_, i) => f(i, "result", "Mar 2025"));
    expect(mapSources(many)).toHaveLength(8);
  });
  it("returns an empty array for no filings", () => {
    expect(mapSources([])).toEqual([]);
  });
});
