import type { DashboardData } from "../../src/dashboard/data.js";
import type { ComparisonData } from "../../src/dashboard/comparison.js";
import type { ReviewerFinding } from "../../src/reviewer/review.js";
import { CompanyHeader } from "./CompanyHeader.js";
import { BriefPanel } from "./BriefPanel.js";
import { ReviewerPanel } from "./ReviewerPanel.js";
import { IntegrityTile } from "./IntegrityTile.js";
import { MetricsTable } from "./MetricsTable.js";
import { MarginChart } from "./MarginChart.js";
import { TrendsPanel } from "./TrendsPanel.js";
import { ComparisonPanel } from "./ComparisonPanel.js";
import { RejectsPanel } from "./RejectsPanel.js";
import { CommentaryPanel } from "./CommentaryPanel.js";

export function Dashboard({
  data,
  comparison,
  reviewerFindings = [],
}: {
  data: DashboardData | null;
  comparison?: ComparisonData | null;
  reviewerFindings?: ReviewerFinding[];
}) {
  if (!data) {
    return <p style={{ color: "var(--muted)" }}>Run an analysis to populate the dashboard.</p>;
  }
  return (
    <div>
      <CompanyHeader company={data.company} />
      {comparison && <ComparisonPanel data={comparison} />}
      <TrendsPanel trends={data.trends} />
      <CommentaryPanel trends={data.commentaryTrends} />
      <BriefPanel brief={data.brief} />
      <h2 style={{ fontSize: 14, textTransform: "uppercase", letterSpacing: 0.5, color: "var(--muted)", margin: "8px 0 12px" }}>Evidence</h2>
      <ReviewerPanel findings={reviewerFindings} />
      <IntegrityTile summary={data.integrity} />
      <MetricsTable rows={data.metrics} />
      <MarginChart rows={data.metrics} />
      <RejectsPanel rows={data.rejects} />
    </div>
  );
}
