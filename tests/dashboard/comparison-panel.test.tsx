import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ComparisonPanel } from "../../app/components/ComparisonPanel.js";
import type { ComparisonData } from "../../src/dashboard/comparison.js";

const data: ComparisonData = {
  companies: ["Acme", "Beta Corp"],
  coverage: [
    { company: "Acme", annualReports: 1, presentations: 4, concalls: 4, foundKpis: [], missingKpis: ["revpar"], failedKpis: [] },
    { company: "Beta Corp", annualReports: 1, presentations: 4, concalls: 4, foundKpis: ["revpar"], missingKpis: [], failedKpis: [] },
  ],
  metrics: [
    {
      name: "revpar",
      label: "RevPAR",
      unit: "rs",
      cells: {
        Acme: { state: "missing", reason: "No RevPAR found" },
        "Beta Corp": { state: "value", value: 6742, unit: "rs", period: "Q4FY26", trust: "verified", badge: { label: "VERIFIED", tone: "ok", color: "#53d769" }, citationHref: null },
      },
    },
  ],
};

describe("ComparisonPanel", () => {
  it("renders company names, metric values, and missing cells", () => {
    const html = renderToStaticMarkup(<ComparisonPanel data={data} />);
    expect(html).toContain("Acme");
    expect(html).toContain("Beta Corp");
    expect(html).toContain("RevPAR");
    expect(html).toContain("Missing");
    expect(html).toContain("6,742");
    expect(html).toContain("Peer Notebook Cards");
    expect(html).toContain("Probe Deeper");
  });

  it("returns nothing when fewer than 2 companies", () => {
    const single: ComparisonData = { companies: ["Acme"], coverage: [], metrics: [] };
    const html = renderToStaticMarkup(<ComparisonPanel data={single} />);
    expect(html).toBe("");
  });
});
