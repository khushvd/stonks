import { describe, it, expect } from "vitest";
import { mapBrief } from "../adapter-brief";
import type { BriefView } from "../../../src/dashboard/data.js";

const okBadge = { label: "VERIFIED", tone: "ok", color: "#0f0" } as const;

const briefView: BriefView = {
  ask: "How have margins trended?",
  industryKpis: [],
  claims: [
    { text: "Margin climbed to 36%.", section: "answer", citedText: null, sourceHref: null, metric: null },
    { text: "ARR up 11% YoY.", section: "drivers", citedText: null, sourceHref: null,
      metric: { name: "arr", value: 13420, unit: "₹", period: null, badge: okBadge } },
    { text: "33-35% band guided.", section: "guidance", citedText: null, sourceHref: null, metric: null },
    { text: "Monsoon seasonality.", section: "risks", citedText: null, sourceHref: null, metric: null },
    { text: "occupancy", section: "industry_kpi", citedText: null, sourceHref: null, metric: null },
  ],
};

describe("mapBrief", () => {
  it("uses the first answer claim as the headline", () => {
    expect(mapBrief(briefView).headline).toBe("Margin climbed to 36%.");
  });
  it("groups claims into answer/drivers/guidance/risks and drops industry_kpi", () => {
    const b = mapBrief(briefView);
    expect(b.answer).toEqual(["Margin climbed to 36%."]);
    expect(b.guidance).toEqual([{ text: "33-35% band guided.", metric: null }]);
    expect(b.risks).toEqual([{ text: "Monsoon seasonality.", tone: "cautious" }]);
  });
  it("formats a driver's metric label and leaves metric-less ones null", () => {
    expect(mapBrief(briefView).drivers).toEqual([{ text: "ARR up 11% YoY.", metric: "arr 13,420" }]);
  });
  it("falls back to the ask, then empty, when there is no answer claim", () => {
    expect(mapBrief({ ...briefView, claims: [] }).headline).toBe("How have margins trended?");
    expect(mapBrief(null).headline).toBe("");
  });
  it("returns empty arrays for a null brief", () => {
    const b = mapBrief(null);
    expect(b.answer).toEqual([]);
    expect(b.risks).toEqual([]);
  });
});
