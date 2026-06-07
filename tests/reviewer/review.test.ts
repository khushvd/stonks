import { describe, expect, it } from "vitest";
import { reviewDashboard } from "../../src/reviewer/review.js";
import type { DashboardData } from "../../src/dashboard/data.js";
import type { AnalystPlan } from "../../src/planner/plan.js";
import type { ComparisonData } from "../../src/dashboard/comparison.js";

const plan: AnalystPlan = {
  company: { name: "Asian Paints", slug: "ASIANPAINT" },
  focusAreas: ["margins"],
  sourcePolicy: "latest filings",
  metrics: ["revenue", "opm_pct"],
  peers: [
    { name: "Berger Paints", slug: "BERGEPAINT", reason: "direct peer" },
    { name: "Kansai Nerolac", slug: "KANSAINER", reason: "paint peer" },
    { name: "Indigo Paints", slug: "INDIGOPNTS", reason: "listed peer" },
  ],
  notebookQuestions: ["How did revenue move?"],
};

const dashboard: DashboardData = {
  company: { id: 1, name: "Asian Paints", ticker: "ASIANPAINT", industry: "Paints" },
  integrity: { verified: 0, notebooklmOnly: 1, pending: 0, rejected: 1 },
  metrics: [
    {
      name: "revenue",
      value: 100,
      unit: "cr",
      period: "Q4FY26",
      trust: "notebooklm-only",
      badge: { label: "NLM-ONLY", tone: "warn", color: "#ffb000" },
      sourcePage: null,
      filingType: "result",
      citationHref: null,
    },
  ],
  rejects: [{ name: "opm_pct", value: 18, unit: "%", period: "Q4FY26", reason: "not found", excerpt: "OPM 18" }],
  filings: [],
  brief: {
    ask: "How did revenue move?",
    industryKpis: [],
    claims: [
      {
        text: "Revenue was 100cr.",
        section: "answer",
        citedText: null,
        sourceHref: null,
        metric: { name: "revenue", value: 100, unit: "cr", period: "Q4FY26", badge: { label: "NLM-ONLY", tone: "warn", color: "#ffb000" } },
      },
    ],
  },
  trends: [],
  industryKpis: [],
  commentaryTrends: [],
};

describe("reviewDashboard", () => {
  it("flags weak citations, missing requested metrics, rejected metrics, and unverified numeric claims", () => {
    const findings = reviewDashboard(plan, dashboard);
    expect(findings.map((f) => f.kind)).toEqual(expect.arrayContaining([
      "weak-citation",
      "missing-evidence",
      "rejected-metric",
      "unverified-number",
    ]));
  });

  it("flags bad peer choices when the confirmed plan does not have exactly three distinct peers", () => {
    const badPlan = { ...plan, peers: [plan.peers[0], plan.peers[0], plan.peers[2]] } as AnalystPlan;
    expect(reviewDashboard(badPlan, { ...dashboard, metrics: [], rejects: [] }).some((f) => f.kind === "bad-peer-choice")).toBe(true);
  });

  it("flags missing expected sector KPIs from the comparison matrix", () => {
    const comparison: ComparisonData = {
      companies: ["Asian Paints", "Berger Paints"],
      coverage: [],
      metrics: [
        {
          name: "revpar",
          label: "RevPAR",
          unit: "rs",
          cells: {
            "Asian Paints": { state: "missing", reason: "No RevPAR found" },
            "Berger Paints": { state: "value", value: 100, unit: "rs", period: "Q4", trust: "screener", badge: { label: "SCREENER", tone: "muted", color: "#7aa7ff" }, citationHref: null },
          },
        },
      ],
    };
    const findings = reviewDashboard(plan, dashboard, comparison);
    expect(findings).toContainEqual(expect.objectContaining({
      kind: "missing-sector-kpi",
      target: "Asian Paints:revpar",
    }));
  });
});
