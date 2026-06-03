import { describe, it, expect } from "vitest";
import { matchMetric } from "../../src/verifier/match.js";
import type { PageText } from "../../src/types.js";

const pages: PageText[] = [
  { page: 1, text: "Cover slide. Investor Presentation Q4 FY26." },
  { page: 28, text: "Consolidated PAT for the quarter stood at 8,330 crore versus 7,100 last year." },
  { page: 30, text: "Occupancy improved this quarter as shown in the chart below." },
];

describe("matchMetric", () => {
  it("verifies a number present verbatim (comma-formatted) and records the page", () => {
    const r = matchMetric({ value: 8330, excerpt: "PAT stood at 8,330 crore" }, pages);
    expect(r).toEqual({ decision: "verified", source_page: 28 });
  });

  it("verifies a plain integer that appears without commas", () => {
    const r = matchMetric({ value: 7100, excerpt: "versus 7,100 last year" }, pages);
    expect(r).toEqual({ decision: "verified", source_page: 28 });
  });

  it("marks notebooklm-only when the number is absent but the excerpt wording is on a page", () => {
    const r = matchMetric({ value: 72, excerpt: "Occupancy improved this quarter" }, pages);
    expect(r).toEqual({ decision: "notebooklm-only", source_page: 30 });
  });

  it("rejects when neither number nor excerpt can be located", () => {
    const r = matchMetric({ value: 99999, excerpt: "totally fabricated line" }, pages);
    expect(r).toEqual({ decision: "reject", source_page: null });
  });

  it("rejects a number with a null/empty excerpt that is not present anywhere", () => {
    const r = matchMetric({ value: 12345, excerpt: null }, pages);
    expect(r).toEqual({ decision: "reject", source_page: null });
  });

  it("does NOT verify an integer against a longer decimal (18 vs 18.5)", () => {
    const r = matchMetric({ value: 18, excerpt: null }, [{ page: 5, text: "EBITDA margin 18.5%" }]);
    expect(r).toEqual({ decision: "reject", source_page: null });
  });

  it("does NOT verify a value that is only a substring of a larger number (330 vs 8,330)", () => {
    const r = matchMetric({ value: 330, excerpt: null }, [{ page: 5, text: "PAT 8,330 crore" }]);
    expect(r).toEqual({ decision: "reject", source_page: null });
  });

  it("does NOT verify 5 against 5,000", () => {
    const r = matchMetric({ value: 5, excerpt: null }, [{ page: 5, text: "Revenue 5,000 cr" }]);
    expect(r).toEqual({ decision: "reject", source_page: null });
  });

  it("does NOT verify a negative value against the positive number (-150 vs 150)", () => {
    const r = matchMetric({ value: -150, excerpt: null }, [{ page: 5, text: "profit of 150 cr" }]);
    expect(r).toEqual({ decision: "reject", source_page: null });
  });

  it("verifies a decimal value present verbatim (18.5)", () => {
    const r = matchMetric({ value: 18.5, excerpt: null }, [{ page: 5, text: "EBITDA margin 18.5%" }]);
    expect(r).toEqual({ decision: "verified", source_page: 5 });
  });

  it("verifies a negative value when the negative number is on the page", () => {
    const r = matchMetric({ value: -150, excerpt: null }, [{ page: 5, text: "net loss of -150 cr" }]);
    expect(r).toEqual({ decision: "verified", source_page: 5 });
  });
});
