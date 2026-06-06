import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ReviewerPanel } from "../../app/components/ReviewerPanel.js";
import type { ReviewerFinding } from "../../src/reviewer/review.js";

const findings: ReviewerFinding[] = [
  { kind: "weak-citation", severity: "warn", target: "revenue", message: "Claim has weak source support" },
  { kind: "rejected-metric", severity: "bad", target: "opm_pct", message: "Verifier rejected opm_pct" },
];

describe("ReviewerPanel", () => {
  it("renders reviewer findings inline", () => {
    const html = renderToStaticMarkup(<ReviewerPanel findings={findings} />);
    expect(html).toContain("Reviewer Findings");
    expect(html).toContain("weak-citation");
    expect(html).toContain("Verifier rejected opm_pct");
  });
});
