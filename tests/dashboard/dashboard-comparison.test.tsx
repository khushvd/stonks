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
  // Dashboard is now a thin wrapper: it renders only the empty state (data=null).
  // When data is non-null, page.tsx renders BriefingApp full-screen instead;
  // Dashboard returns null so it contributes no HTML in that branch.
  it("renders nothing when data is supplied (BriefingApp owns the post-run view)", () => {
    const html = renderToStaticMarkup(<Dashboard data={data} comparison={comparison} />);
    expect(html).toBe("");
  });

  it("renders empty-state copy when data is null", () => {
    const html = renderToStaticMarkup(<Dashboard data={null} />);
    expect(html).toContain("Run an analysis");
  });
});
