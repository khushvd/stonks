import { describe, it, expect } from "vitest";
import { parseCitations } from "../../src/notebooklm/parse-citations.js";

describe("parseCitations", () => {
  it("parses a bare array with formatted number strings", () => {
    const raw = JSON.stringify([
      { name: "revenue", value: "9,200", unit: "INR cr", period: "Q4FY26", excerpt: "Revenue grew to 9,200 cr", url: "https://bse/p.pdf" },
    ]);
    expect(parseCitations(raw)).toEqual([
      { name: "revenue", value: 9200, unit: "INR cr", period: "Q4FY26", excerpt: "Revenue grew to 9,200 cr", sourceUrl: "https://bse/p.pdf" },
    ]);
  });

  it("unwraps a {metrics:[...]} or {citations:[...]} envelope", () => {
    const raw = JSON.stringify({ metrics: [{ name: "pat", value: 8330, excerpt: "PAT 8,330" }] });
    const got = parseCitations(raw);
    expect(got).toHaveLength(1);
    expect(got[0]).toEqual({ name: "pat", value: 8330, unit: null, period: null, excerpt: "PAT 8,330", sourceUrl: null });
  });

  it("strips currency symbols and parses decimals", () => {
    const raw = JSON.stringify([{ name: "ebitda margin", value: "₹ 18.5", unit: "%", excerpt: "margin 18.5%" }]);
    expect(parseCitations(raw)[0].value).toBe(18.5);
  });

  it("drops rows with no usable number or no name", () => {
    const raw = JSON.stringify([
      { name: "revenue", value: "n/a", excerpt: "not disclosed" },
      { value: 100, excerpt: "missing name" },
      { name: "pat", value: 8330, excerpt: "ok" },
    ]);
    const got = parseCitations(raw);
    expect(got).toHaveLength(1);
    expect(got[0].name).toBe("pat");
  });

  it("returns [] for non-JSON or non-array/non-envelope input", () => {
    expect(parseCitations("sorry, I could not find that")).toEqual([]);
    expect(parseCitations(JSON.stringify({ foo: "bar" }))).toEqual([]);
  });

  it("drops period/label-like strings instead of extracting a stray digit (FY26 -> dropped)", () => {
    const raw = JSON.stringify([
      { name: "revenue", value: "FY26", excerpt: "fiscal year" },
      { name: "pat", value: "see note 3", excerpt: "footnote" },
      { name: "ebitda", value: "9,200 cr", excerpt: "EBITDA 9,200 cr" },
    ]);
    const got = parseCitations(raw);
    expect(got).toHaveLength(1);
    expect(got[0]).toMatchObject({ name: "ebitda", value: 9200 });
  });
});
