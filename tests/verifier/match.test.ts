import { describe, it, expect } from "vitest";
import { matchMetric, extractNumbers } from "../../src/verifier/match.js";
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

  it("does NOT verify a number glued to letters (18 vs FY18)", () => {
    const r = matchMetric({ value: 18, excerpt: null }, [{ page: 5, text: "Guidance for FY18 onwards" }]);
    expect(r).toEqual({ decision: "reject", source_page: null });
  });

  it("does NOT verify a number immediately followed by letters (3 vs Q3)", () => {
    const r = matchMetric({ value: 3, excerpt: null }, [{ page: 5, text: "Results for Q3 were strong" }]);
    expect(r).toEqual({ decision: "reject", source_page: null });
  });

  it("still verifies a number preceded by a currency symbol (8330 vs ₹8,330)", () => {
    const r = matchMetric({ value: 8330, excerpt: null }, [{ page: 5, text: "PAT was ₹8,330 cr" }]);
    expect(r).toEqual({ decision: "verified", source_page: 5 });
  });

  it("still verifies a decimal followed by a percent sign (18.5 vs 18.5%)", () => {
    const r = matchMetric({ value: 18.5, excerpt: null }, [{ page: 5, text: "margin 18.5% this year" }]);
    expect(r).toEqual({ decision: "verified", source_page: 5 });
  });
});

describe("extractNumbers", () => {
  it("tokenizes comma/decimal numbers and ignores label-glued digits", () => {
    expect(extractNumbers("Revenue 9,228 cr, margin 18.5%")).toEqual([9228, 18.5]);
    expect(extractNumbers("FY18 vs Q3 FY26")).toEqual([]); // FY18, Q3, FY26 all letter-glued
    expect(extractNumbers("no numbers here")).toEqual([]);
    expect(extractNumbers("₹9,228 crore")).toEqual([9228]); // currency prefix is fine
  });
});
