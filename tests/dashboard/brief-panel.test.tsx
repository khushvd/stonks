import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { BriefPanel } from "../../app/components/BriefPanel.js";
import type { BriefView } from "../../src/dashboard/data.js";

const view: BriefView = {
  ask: "how is revenue?",
  industryKpis: ["RevPAR"],
  claims: [
    { text: "Revenue grew to 100cr", section: "answer", citedText: "Revenue stood at 100 cr", sourceHref: "/api/pdf?path=data%2Facme%2Fq4.pdf", metric: { name: "revenue", value: 100, unit: "cr", period: "Q4FY24", badge: { label: "VERIFIED", tone: "ok", color: "#00cc33" } } },
    { text: "Input costs are a risk", section: "risks", citedText: null, sourceHref: null, metric: null },
  ],
};

describe("BriefPanel", () => {
  it("renders claims grouped by section with badges and source links", () => {
    const html = renderToStaticMarkup(<BriefPanel brief={view} />);
    expect(html).toContain("Revenue grew to 100cr");
    expect(html).toContain("VERIFIED");
    expect(html).toContain("/api/pdf?path=data%2Facme%2Fq4.pdf");
    expect(html).toMatch(/risk/i);
    expect(html).toContain("RevPAR");
  });

  it("renders a graceful message for a null brief", () => {
    const html = renderToStaticMarkup(<BriefPanel brief={null} />);
    expect(html).toMatch(/couldn|no brief|still indexing/i);
  });

  it("does not render a link for a javascript: sourceHref (XSS guard)", () => {
    const dangerousView: BriefView = {
      ask: null,
      industryKpis: [],
      claims: [
        { text: "A claim", section: "answer", citedText: null, sourceHref: "javascript:alert(1)", metric: null },
      ],
    };
    const html = renderToStaticMarkup(<BriefPanel brief={dangerousView} />);
    expect(html).not.toContain("javascript:alert");
    expect(html).not.toContain('<a href="javascript');
  });
});
