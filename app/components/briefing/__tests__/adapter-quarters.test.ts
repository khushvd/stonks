import { describe, it, expect } from "vitest";
import { deriveQuarters } from "../adapter-quarters";
import type { TrendSeries } from "../../../../src/dashboard/data.js";

const trends: TrendSeries[] = [
  { name: "revenue", unit: "₹cr", points: [{ period: "Dec 2023", value: 2012 }, { period: "Mar 2024", value: 1905 }] },
  { name: "ebitda", unit: "₹cr", points: [{ period: "Dec 2023", value: 765 }, { period: "Mar 2024", value: 657 }] },
  { name: "opm_pct", unit: "%", points: [{ period: "Dec 2023", value: 38 }, { period: "Mar 2024", value: 34.5 }] },
  { name: "pat", unit: "₹cr", points: [{ period: "Dec 2023", value: 452 }, { period: "Mar 2024", value: 418 }] },
];

describe("deriveQuarters", () => {
  it("zips the four series into one row per period, chronologically", () => {
    const q = deriveQuarters(trends);
    expect(q).toHaveLength(2);
    expect(q[0]).toEqual({ period: "Dec 2023", label: "Dec'23", margin: 38, rev: 2012, ebitda: 765, pat: 452 });
    expect(q[1].period).toBe("Mar 2024");
  });
  it("fills missing series values with 0", () => {
    const q = deriveQuarters([{ name: "revenue", unit: "₹cr", points: [{ period: "Mar 2024", value: 1905 }] }]);
    expect(q[0]).toEqual({ period: "Mar 2024", label: "Mar'24", margin: 0, rev: 1905, ebitda: 0, pat: 0 });
  });
  it("keeps only the last 8 periods", () => {
    const many = Array.from({ length: 11 }, (_, i) => ({ period: `Mar ${2015 + i}`, value: i }));
    const q = deriveQuarters([{ name: "revenue", unit: "₹cr", points: many }]);
    expect(q).toHaveLength(8);
    expect(q[0].period).toBe("Mar 2018");
  });
  it("returns an empty array when there are no trends", () => {
    expect(deriveQuarters([])).toEqual([]);
  });
});
