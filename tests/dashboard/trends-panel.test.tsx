import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { TrendsPanel } from "../../app/components/TrendsPanel.js";
import type { TrendSeries } from "../../src/dashboard/data.js";

const series: TrendSeries[] = [
  { name: "revenue", unit: "cr", points: [{ period: "Mar 2023", value: 100 }, { period: "Jun 2023", value: 110 }, { period: "Sep 2023", value: 105 }] },
  { name: "opm_pct", unit: "%", points: [{ period: "Mar 2023", value: 18 }, { period: "Jun 2023", value: 19 }] },
];

describe("TrendsPanel", () => {
  it("renders a header and each trend series name", () => {
    const html = renderToStaticMarkup(<TrendsPanel trends={series} />);
    expect(html).toMatch(/revenue/i);
    expect(html).toMatch(/opm/i);
  });

  it("renders nothing for empty trends", () => {
    const html = renderToStaticMarkup(<TrendsPanel trends={[]} />);
    expect(html).toBe("");
  });
});
