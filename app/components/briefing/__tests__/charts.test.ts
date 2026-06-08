import { describe, it, expect } from "vitest";
import { niceBounds } from "../charts";

describe("niceBounds", () => {
  it("pads a range symmetrically by the default fraction", () => {
    const [lo, hi] = niceBounds(0, 100);
    expect(lo).toBeCloseTo(-12);
    expect(hi).toBeCloseTo(112);
  });
  it("handles a zero-span range without dividing by zero", () => {
    const [lo, hi] = niceBounds(5, 5);
    expect(lo).toBeLessThan(5);
    expect(hi).toBeGreaterThan(5);
  });
});
