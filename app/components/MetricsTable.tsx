import type { MetricRow } from "../../src/dashboard/data.js";
import { TrustBadge } from "./TrustBadge.js";
import { Citation } from "./Citation.js";

export function MetricsTable({ rows }: { rows: MetricRow[] }) {
  if (rows.length === 0) return <p style={{ color: "var(--muted)" }}>No metrics yet — run an analysis.</p>;
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
      <thead>
        <tr style={{ color: "var(--muted)", textAlign: "left" }}>
          <th style={{ padding: "4px 6px" }}>Metric</th>
          <th>Value</th>
          <th>Period</th>
          <th>Trust</th>
          <th>Source</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((m, i) => (
          <tr key={i} style={{ borderTop: "1px solid var(--border)" }}>
            <td style={{ padding: "5px 6px" }}>{m.name}</td>
            <td>
              {m.value.toLocaleString()} {m.unit ?? ""}
            </td>
            <td>{m.period ?? "—"}</td>
            <td>
              <TrustBadge badge={m.badge} />
            </td>
            <td>
              <Citation href={m.citationHref} page={m.sourcePage} filingType={m.filingType} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
