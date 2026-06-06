import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PlanReview } from "../../app/components/PlanReview.js";
import type { AnalystPlan } from "../../src/planner/plan.js";

const plan: AnalystPlan = {
  company: { name: "Asian Paints", slug: "ASIANPAINT" },
  focusAreas: ["margins", "growth"],
  sourcePolicy: "latest filings",
  metrics: ["revenue", "opm_pct"],
  peers: [
    { name: "Berger Paints", slug: "BERGEPAINT", reason: "direct peer" },
    { name: "Kansai Nerolac", slug: "KANSAINER", reason: "paint peer" },
    { name: "Indigo Paints", slug: "INDIGOPNTS", reason: "listed peer" },
  ],
  notebookQuestions: ["How have margins moved?"],
};

describe("PlanReview", () => {
  it("renders confirmed company, focus areas, and editable peer fields", () => {
    const html = renderToStaticMarkup(<PlanReview plan={plan} onChange={() => {}} disabled={false} />);
    expect(html).toContain("ASIANPAINT");
    expect(html).toContain("margins");
    expect(html).toContain("Berger Paints");
    expect(html).toContain("BERGEPAINT");
    expect(html).toContain("Peer 1");
  });
});
