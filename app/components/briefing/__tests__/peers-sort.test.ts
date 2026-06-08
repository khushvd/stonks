import { describe, it, expect } from "vitest";
import { sortPeers } from "../peers-sort";
import type { MatrixRow } from "../types";

const row: MatrixRow = {
  kpi: "EBITDA margin", unit: "%", fmt: "pct", spark: "margin",
  cells: { A: 35.2, B: 42.1, C: { v: null, trust: "missing", note: "x" }, D: 38.4 },
};

describe("sortPeers", () => {
  it("sorts peers descending by the row's cell values", () => {
    expect(sortPeers(["A", "B", "C", "D"], row)).toEqual(["B", "D", "A", "C"]);
  });
  it("pushes null/missing values last", () => {
    const out = sortPeers(["A", "B", "C", "D"], row);
    expect(out[out.length - 1]).toBe("C");
  });
  it("returns the input order when row is null", () => {
    expect(sortPeers(["A", "B", "C"], null)).toEqual(["A", "B", "C"]);
  });
});
