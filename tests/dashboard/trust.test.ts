import { describe, it, expect } from "vitest";
import { trustBadge, integrityChips } from "../../src/dashboard/trust.js";

describe("trustBadge", () => {
  it("renders verified and notebooklm-only with DIFFERENT label, tone, and color", () => {
    const v = trustBadge("verified");
    const n = trustBadge("notebooklm-only");
    expect(v.label).toBe("VERIFIED");
    expect(n.label).toBe("NLM-ONLY");
    expect(v.tone).toBe("ok");
    expect(n.tone).toBe("warn");
    expect(v.color).not.toBe(n.color); // the non-negotiable: they must look different
  });
});

describe("integrityChips", () => {
  it("produces one chip per trust bucket with the given counts", () => {
    const chips = integrityChips({ verified: 3, notebooklmOnly: 1, pending: 2, rejected: 1 });
    expect(chips.map((c) => [c.key, c.count])).toEqual([
      ["verified", 3],
      ["notebooklm-only", 1],
      ["pending", 2],
      ["rejected", 1],
    ]);
    // rejected chip is visually distinct (its own tone) — the quarantine story must read at a glance
    expect(chips.find((c) => c.key === "rejected")?.tone).toBe("bad");
  });
});
