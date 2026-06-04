import { describe, it, expect } from "vitest";
import { parseBrief } from "../../src/synthesis/brief.js";

const REFS = [{ source_id: "s1", citation_number: 1, cited_text: "Revenue was 100" }];

describe("parseBrief", () => {
  it("parses a clean JSON answer", () => {
    const answer = JSON.stringify({
      claims: [{ text: "Revenue grew", section: "answer", cite: 1, metric: { name: "revenue", value: 100, unit: "cr", period: "FY24" } }],
      industryKpis: ["RevPAR"],
    });
    const b = parseBrief(answer, REFS, "how is revenue?");
    expect(b.ask).toBe("how is revenue?");
    expect(b.claims).toHaveLength(1);
    expect(b.claims[0].metric).toEqual({ name: "revenue", value: 100, unit: "cr", period: "FY24" });
    expect(b.references).toEqual([{ citation_number: 1, source_id: "s1", cited_text: "Revenue was 100" }]);
  });

  it("tolerates prose and code fences around the JSON", () => {
    const answer = "Here you go:\n```json\n{\"claims\":[{\"text\":\"x\",\"section\":\"risks\"}],\"industryKpis\":[]}\n```\nThanks!";
    const b = parseBrief(answer, [], null);
    expect(b.claims[0].section).toBe("risks");
    expect(b.claims[0].metric).toBeNull();
    expect(b.claims[0].cite).toBeNull();
  });

  it("coerces a bad section to 'answer' and drops malformed claims", () => {
    const answer = JSON.stringify({ claims: [{ text: "ok", section: "bogus" }, { section: "answer" }], industryKpis: "nope" });
    const b = parseBrief(answer, [], null);
    expect(b.claims).toHaveLength(1); // the claim with no text is dropped
    expect(b.claims[0].section).toBe("answer");
    expect(b.industryKpis).toEqual([]);
  });

  it("returns an empty brief when no JSON is present", () => {
    const b = parseBrief("the sources are still indexing, sorry", [], "q");
    expect(b.claims).toEqual([]);
    expect(b.industryKpis).toEqual([]);
  });
});
