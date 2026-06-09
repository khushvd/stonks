import { describe, it, expect } from "vitest";
import { toBriefingData } from "../adapter";
import type { DashboardData } from "../../../../src/dashboard/data.js";
import type { ComparisonData } from "../../../../src/dashboard/comparison.js";

const okBadge = { label: "VERIFIED", tone: "ok", color: "#0f0" } as const;

const data: DashboardData = {
  company: { id: 1, name: "Indian Hotels Co.", ticker: "INDHOTEL", industry: "Hotels" },
  integrity: { verified: 47, notebooklmOnly: 3, pending: 2, rejected: 1 },
  metrics: [],
  rejects: [],
  filings: [
    { id: 1, company_id: 1, type: "result", period: "Dec 2024", source_url: null, local_path: null, notebooklm_source_id: null },
    { id: 2, company_id: 1, type: "result", period: "Mar 2025", source_url: null, local_path: null, notebooklm_source_id: null },
  ],
  brief: {
    ask: "How have margins trended?",
    industryKpis: [],
    claims: [{ text: "Margin rose to 36%.", section: "answer", citedText: null, sourceHref: null, metric: null }],
  },
  trends: [
    { name: "revenue", unit: "₹cr", points: [{ period: "Dec 2024", value: 2533 }, { period: "Mar 2025", value: 2425 }] },
    { name: "opm_pct", unit: "%", points: [{ period: "Dec 2024", value: 39.5 }, { period: "Mar 2025", value: 36.0 }] },
  ],
  industryKpis: [],
  commentaryTrends: [
    { period: "Q4 FY25", summary: "Softer.", tone: "cautious", keyTopics: ["supply"], contradictionNote: "Contradicts Q3." },
  ],
};

const comparison: ComparisonData = {
  companies: ["Indian Hotels Co.", "EIH"],
  coverage: [],
  metrics: [
    { name: "opm_pct", label: "Operating margin", unit: "%", cells: {
      "Indian Hotels Co.": { state: "value", value: 36.0, unit: "%", period: null, trust: "verified", badge: okBadge, citationHref: null },
      "EIH": { state: "value", value: 38.4, unit: "%", period: null, trust: "verified", badge: okBadge, citationHref: null },
    } },
  ],
};

describe("toBriefingData", () => {
  it("assembles a complete BriefingData from real payloads", () => {
    const b = toBriefingData(data, comparison);
    expect(b.company.ticker).toBe("INDHOTEL");
    expect(b.company.asOf).toBe("Mar 2025");
    expect(b.ask).toBe("How have margins trended?");
    expect(b.brief.headline).toBe("Margin rose to 36%.");
    expect(b.quarters).toHaveLength(2);
    expect(b.stats[0].key).toBe("EBITDA margin");
    expect(b.peers).toEqual(["Indian Hotels Co.", "EIH"]);
    expect(b.integrity).toEqual({ verified: 47, nlmOnly: 3, pending: 2, rejected: 1 });
    expect(b.commentary[0].flag).toBe("Contradicts Q3.");
  });
  it("overrides the subject's peerMargins with its full quarter history", () => {
    const b = toBriefingData(data, comparison);
    expect(b.peerMargins["Indian Hotels Co."]).toEqual([39.5, 36.0]); // full series, not single point
    expect(b.peerMargins["EIH"]).toEqual([38.4]); // peer stays single-point
  });
  it("handles a null comparison (no peers, empty matrix)", () => {
    const b = toBriefingData(data, null);
    expect(b.peers).toEqual([]);
    expect(b.matrix).toEqual([]);
    expect(b.quarters).toHaveLength(2); // quarters still derive from trends
  });
});
