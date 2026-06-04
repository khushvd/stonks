import type { DashboardData } from "../../src/dashboard/data.js";
import { CompanyHeader } from "./CompanyHeader.js";
import { BriefPanel } from "./BriefPanel.js";
import { IntegrityTile } from "./IntegrityTile.js";
import { MetricsTable } from "./MetricsTable.js";
import { MarginChart } from "./MarginChart.js";
import { RejectsPanel } from "./RejectsPanel.js";

export function Dashboard({ data }: { data: DashboardData | null }) {
  if (!data) {
    return <p style={{ color: "var(--muted)" }}>Run an analysis to populate the dashboard.</p>;
  }
  return (
    <div>
      <CompanyHeader company={data.company} />
      <BriefPanel brief={data.brief} />
      <h2 style={{ fontSize: 14, textTransform: "uppercase", letterSpacing: 0.5, color: "var(--muted)", margin: "8px 0 12px" }}>Evidence</h2>
      <IntegrityTile summary={data.integrity} />
      <MetricsTable rows={data.metrics} />
      <MarginChart rows={data.metrics} />
      <RejectsPanel rows={data.rejects} />
    </div>
  );
}
