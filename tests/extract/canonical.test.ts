import { describe, it, expect } from "vitest";
import { UNIVERSAL_BASE } from "../../src/extract/canonical.js";

describe("UNIVERSAL_BASE", () => {
  it("contains the locked base metrics with keys + labels", () => {
    const keys = UNIVERSAL_BASE.map((m) => m.metric_key);
    expect(keys).toEqual([
      "revenue", "pat", "ebitda", "ebitda_margin", "eps", "total_debt",
      "pat_margin", "debt_equity", "market_cap", "ev_ebitda", "ev",
    ]);
    for (const m of UNIVERSAL_BASE) expect(m.label.length).toBeGreaterThan(0);
  });
});
