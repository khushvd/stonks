import { describe, it, expect } from "vitest";
import { selectCitation } from "../../src/notebooklm/parse-citations.js";

function askJson(refs: { source_id: string; citation_number: number; cited_text: string }[]): string {
  return JSON.stringify({ answer: "prose [1]", references: refs });
}

describe("selectCitation", () => {
  it("returns the reference whose cited_text contains the value (comma-formatted)", () => {
    const raw = askJson([{ source_id: "src-A", citation_number: 1, cited_text: "Revenue grew to 9,228 cr" }]);
    expect(selectCitation(raw, 9228)).toEqual({ excerpt: "Revenue grew to 9,228 cr", sourceId: "src-A" });
  });

  it("matches a currency-prefixed value", () => {
    const raw = askJson([{ source_id: "src-A", citation_number: 1, cited_text: "₹9,228 crore" }]);
    expect(selectCitation(raw, 9228)).toEqual({ excerpt: "₹9,228 crore", sourceId: "src-A" });
  });

  it("does not return a reference for a different number", () => {
    const raw = askJson([{ source_id: "src-B", citation_number: 1, cited_text: "PAT was 8,330 cr" }]);
    expect(selectCitation(raw, 9228)).toEqual({ excerpt: null, sourceId: null });
  });

  it("picks the FIRST reference that contains the value", () => {
    const raw = askJson([
      { source_id: "src-B", citation_number: 1, cited_text: "PAT 8,330" },
      { source_id: "src-A", citation_number: 2, cited_text: "Revenue 9,228" },
    ]);
    expect(selectCitation(raw, 9228)).toEqual({ excerpt: "Revenue 9,228", sourceId: "src-A" });
  });

  it("returns nulls for empty/garbage JSON or no references", () => {
    expect(selectCitation("not json", 9228)).toEqual({ excerpt: null, sourceId: null });
    expect(selectCitation(JSON.stringify({ answer: "x" }), 9228)).toEqual({ excerpt: null, sourceId: null });
    expect(selectCitation(JSON.stringify({ references: [] }), 9228)).toEqual({ excerpt: null, sourceId: null });
  });
});
