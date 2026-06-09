import { describe, it, expect } from "vitest";
import { mapMatrix, mapCellTrust } from "../adapter-matrix";
import type { ComparisonData } from "../../../../src/dashboard/comparison.js";

const okBadge = { label: "VERIFIED", tone: "ok", color: "#0f0" } as const;

describe("mapCellTrust", () => {
  it("renders a verified value as a bare number", () => {
    expect(mapCellTrust({ state: "value", value: 35.2, unit: "%", period: "Mar 2025", trust: "verified", badge: okBadge, citationHref: null })).toBe(35.2);
  });
  it("renders a notebooklm-only value as an nlm-flagged cell", () => {
    expect(mapCellTrust({ state: "value", value: 8900, unit: "₹", period: null, trust: "notebooklm-only", badge: okBadge, citationHref: null }))
      .toEqual({ v: 8900, trust: "nlm", note: "NotebookLM-only — not source-verified." });
  });
  it("renders a rejected cell with its reason", () => {
    expect(mapCellTrust({ state: "rejected", reason: "Unit mismatch" }))
      .toEqual({ v: null, trust: "rejected", note: "Unit mismatch" });
  });
  it("renders a missing cell with a fallback note", () => {
    expect(mapCellTrust({ state: "missing", reason: null }))
      .toEqual({ v: null, trust: "missing", note: "Not disclosed." });
  });
  it("maps a failed cell onto missing trust", () => {
    expect(mapCellTrust({ state: "failed", reason: "Extraction failed" }))
      .toEqual({ v: null, trust: "missing", note: "Extraction failed" });
  });
});

const comparison: ComparisonData = {
  companies: ["Indian Hotels Co.", "EIH"],
  coverage: [],
  metrics: [
    { name: "revenue", label: "Revenue", unit: "₹cr", cells: {
      "Indian Hotels Co.": { state: "value", value: 8565, unit: "₹cr", period: null, trust: "verified", badge: okBadge, citationHref: null },
      "EIH": { state: "value", value: 2742, unit: "₹cr", period: null, trust: "verified", badge: okBadge, citationHref: null },
    } },
    { name: "opm_pct", label: "Operating margin", unit: "%", cells: {
      "Indian Hotels Co.": { state: "value", value: 35.2, unit: "%", period: null, trust: "verified", badge: okBadge, citationHref: null },
      "EIH": { state: "value", value: 38.4, unit: "%", period: null, trust: "verified", badge: okBadge, citationHref: null },
    } },
  ],
};

describe("mapMatrix", () => {
  it("carries peer columns through in order", () => {
    expect(mapMatrix(comparison, "Indian Hotels Co.").peers).toEqual(["Indian Hotels Co.", "EIH"]);
  });
  it("normalizes the margin row to 'EBITDA margin' with a margin sparkline key", () => {
    const marginRow = mapMatrix(comparison, "Indian Hotels Co.").matrix.find((r) => r.spark === "margin");
    expect(marginRow?.kpi).toBe("EBITDA margin");
    expect(marginRow?.fmt).toBe("pct");
  });
  it("seeds peerMargins with a single latest point per peer", () => {
    const { peerMargins } = mapMatrix(comparison, "Indian Hotels Co.");
    expect(peerMargins["EIH"]).toEqual([38.4]);
    expect(peerMargins["Indian Hotels Co."]).toEqual([35.2]);
  });
  it("returns empty structures for a null comparison", () => {
    expect(mapMatrix(null, "X")).toEqual({ peers: [], matrix: [], peerMargins: {} });
  });
});
