import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Dashboard } from "../../app/components/Dashboard.js";
import type { ComparisonData } from "../../src/dashboard/comparison.js";
import type { DashboardData } from "../../src/dashboard/data.js";

const data: DashboardData = {
  company: { id: 1, name: "Asian Paints", ticker: "ASIANPAINT", industry: "Paints" },
  integrity: { verified: 0, notebooklmOnly: 0, pending: 0, rejected: 0 },
  metrics: [],
  rejects: [],
  filings: [],
  brief: null,
  trends: [],
  industryKpis: [],
  commentaryTrends: [],
};

const comparison: ComparisonData = {
  companies: ["Asian Paints", "Berger Paints"],
  coverage: [],
  metrics: [
    {
      name: "revpar",
      label: "RevPAR",
      unit: "rs",
      cells: {
        "Asian Paints": { state: "missing", reason: null },
        "Berger Paints": { state: "missing", reason: null },
      },
    },
  ],
};

describe("Dashboard comparison rendering", () => {
  it("renders the sector KPI matrix when comparison data is supplied", () => {
    const html = renderToStaticMarkup(<Dashboard data={data} comparison={comparison} />);
    expect(html.indexOf("Couldn&#x27;t synthesize a brief")).toBeLessThan(html.indexOf("Sector KPI Matrix"));
    expect(html.indexOf("Sector KPI Matrix")).toBeLessThan(html.indexOf("Evidence"));
    expect(html).toContain("Sector KPI Matrix");
    expect(html).toContain("Berger Paints");
  });
});
