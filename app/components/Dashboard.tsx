import type { DashboardData } from "../../src/dashboard/data.js";
import type { ComparisonData } from "../../src/dashboard/comparison.js";
import type { ReviewerFinding } from "../../src/reviewer/review.js";

// NOTE: This component is only reached when data is null (empty state).
// When data is non-null, page.tsx renders BriefingApp full-screen instead.
// The non-null branch below is retained only for compilation correctness.
export function Dashboard({
  data,
  comparison,
  reviewerFindings = [],
}: {
  data: DashboardData | null;
  comparison?: ComparisonData | null;
  reviewerFindings?: ReviewerFinding[];
}) {
  void comparison;
  void reviewerFindings;
  if (!data) {
    return <p style={{ color: "var(--muted)" }}>Run an analysis to populate the dashboard.</p>;
  }
  // Unreachable in the new flow — page.tsx shows BriefingApp when data is present.
  return null;
}
