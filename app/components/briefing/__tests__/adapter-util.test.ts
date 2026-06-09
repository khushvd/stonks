import { describe, it, expect } from "vitest";
import { periodToOrder, shortLabel, inferFmt, humanizeKey, fmtCr, fmtPctValue } from "../adapter-util";

describe("periodToOrder", () => {
  it("orders by year then month", () => {
    expect(periodToOrder("Mar 2024")).toBeLessThan(periodToOrder("Jun 2024"));
    expect(periodToOrder("Dec 2023")).toBeLessThan(periodToOrder("Mar 2024"));
  });
  it("does not throw on a malformed period", () => {
    expect(() => periodToOrder("garbage")).not.toThrow();
  });
});

describe("shortLabel", () => {
  it("compresses a 'Mon YYYY' period to Mon'YY", () => {
    expect(shortLabel("Mar 2024")).toBe("Mar'24");
  });
  it("returns the input unchanged when it does not match", () => {
    expect(shortLabel("Q4FY25")).toBe("Q4FY25");
  });
});

describe("inferFmt", () => {
  it("treats a percent unit as pct", () => { expect(inferFmt("%")).toBe("pct"); });
  it("treats everything else as int", () => { expect(inferFmt("₹cr")).toBe("int"); });
  it("treats null unit as int", () => { expect(inferFmt(null)).toBe("int"); });
});

describe("humanizeKey", () => {
  it("turns a snake metric key into spaced words", () => {
    expect(humanizeKey("opm_pct")).toBe("opm pct");
  });
});

describe("fmtCr", () => {
  it("formats a crore value with en-IN grouping and suffix", () => {
    expect(fmtCr(2425)).toBe("₹2,425 cr");
  });
});

describe("fmtPctValue", () => {
  it("formats a percent to one decimal with a sign", () => {
    expect(fmtPctValue(1.5)).toBe("+1.5 pts");
    expect(fmtPctValue(-2)).toBe("-2.0 pts");
  });
});
