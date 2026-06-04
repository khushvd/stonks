import type { DashboardData } from "../../src/dashboard/data.js";
import { CompanyHeader } from "./CompanyHeader.js";
import { IntegrityTile } from "./IntegrityTile.js";
import { MetricsTable } from "./MetricsTable.js";
import { RejectsPanel } from "./RejectsPanel.js";

export function Dashboard({ data }: { data: DashboardData | null }) {
  if (!data) {
    return <p style={{ color: "var(--muted)" }}>Run an analysis to populate the dashboard.</p>;
  }
  return (
    <div>
      <CompanyHeader company={data.company} />
      <IntegrityTile summary={data.integrity} />
      <MetricsTable rows={data.metrics} />
      <RejectsPanel rows={data.rejects} />
    </div>
  );
}
