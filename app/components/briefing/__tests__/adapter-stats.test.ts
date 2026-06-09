import { describe, it, expect } from "vitest";
import { deriveStats } from "../adapter-stats";
import type { BriefingData } from "../types";

const quarters: BriefingData["quarters"] = [
  { period: "Mar 2024", label: "Mar'24", margin: 34.5, rev: 1905, ebitda: 657, pat: 418 },
  { period: "Jun 2024", label: "Jun'24", margin: 30.0, rev: 1597, ebitda: 479, pat: 248 },
  { period: "Sep 2024", label: "Sep'24", margin: 29.5, rev: 1891, ebitda: 558, pat: 583 },
  { period: "Dec 2024", label: "Dec'24", margin: 39.5, rev: 2533, ebitda: 1001, pat: 582 },
  { period: "Mar 2025", label: "Mar'25", margin: 36.0, rev: 2425, ebitda: 873, pat: 522 },
];

describe("deriveStats", () => {
  it("produces four tiles keyed by metric", () => {
    const stats = deriveStats(quarters);
    expect(stats.map((s) => s.key)).toEqual(["EBITDA margin", "Revenue", "EBITDA", "PAT"]);
  });
  it("computes the margin tile in points vs the year-ago quarter", () => {
    const margin = deriveStats(quarters)[0];
    expect(margin.value).toBe("36.0%");
    expect(margin.delta).toBe("+1.5 pts"); // 36.0 vs 34.5
    expect(margin.dir).toBe("up");
  });
  it("computes the revenue tile as a YoY percent", () => {
    const rev = deriveStats(quarters)[1];
    expect(rev.value).toBe("₹2,425 cr");
    expect(rev.delta).toBe("+27.3%"); // (2425-1905)/1905
    expect(rev.dir).toBe("up");
  });
  it("degrades gracefully with fewer than five quarters", () => {
    const stats = deriveStats(quarters.slice(-1));
    expect(stats[1].delta).toBe("—");
    expect(stats[1].dir).toBe("flat");
  });
  it("returns an empty array when there are no quarters", () => {
    expect(deriveStats([])).toEqual([]);
  });
});
