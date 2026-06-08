import { describe, it, expect } from "vitest";
import { fmtNum, cellInfo } from "../format";

describe("fmtNum", () => {
  it("renders null as em dash", () => { expect(fmtNum(null, "int")).toBe("—"); });
  it("formats pct to one decimal", () => { expect(fmtNum(36, "pct")).toBe("36.0"); });
  it("formats integers with en-IN grouping", () => { expect(fmtNum(13420, "int")).toBe("13,420"); });
});

describe("cellInfo", () => {
  it("treats a bare number as trust ok", () => {
    expect(cellInfo(35.2)).toEqual({ v: 35.2, trust: "ok", note: null });
  });
  it("passes through a flagged object", () => {
    expect(cellInfo({ v: 33.5, trust: "rejected", note: "x" })).toEqual({ v: 33.5, trust: "rejected", note: "x" });
  });
  it("treats null as trust ok with null value", () => {
    expect(cellInfo(null)).toEqual({ v: null, trust: "ok", note: null });
  });
});
