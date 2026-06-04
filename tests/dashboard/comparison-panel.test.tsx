import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ComparisonPanel } from "../../app/components/ComparisonPanel.js";
import type { ComparisonData } from "../../src/dashboard/comparison.js";

const data: ComparisonData = {
  companies: ["Acme", "Beta Corp"],
  metrics: [
    { name: "revenue", unit: "cr", period: "Mar 2024", values: { Acme: 100, "Beta Corp": 60 } },
    { name: "opm_pct", unit: "%", period: "Mar 2024", values: { Acme: 18.5, "Beta Corp": 14.2 } },
  ],
};

describe("ComparisonPanel", () => {
  it("renders company names and metric values", () => {
    const html = renderToStaticMarkup(<ComparisonPanel data={data} />);
    expect(html).toContain("Acme");
    expect(html).toContain("Beta Corp");
    expect(html).toContain("revenue");
    expect(html).toContain("100");
    expect(html).toContain("60");
  });

  it("returns nothing when fewer than 2 companies", () => {
    const single: ComparisonData = { companies: ["Acme"], metrics: [] };
    const html = renderToStaticMarkup(<ComparisonPanel data={single} />);
    expect(html).toBe("");
  });
});
