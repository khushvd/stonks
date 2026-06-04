import type { ComparisonData } from "../../src/dashboard/comparison.js";

export function ComparisonPanel({ data }: { data: ComparisonData }) {
  if (!data || data.companies.length < 2 || data.metrics.length === 0) return null;
  return (
    <section style={{ marginTop: 24, marginBottom: 16 }}>
      <h2 style={{ fontSize: 14, textTransform: "uppercase", letterSpacing: 0.5, color: "var(--muted)", margin: "0 0 12px" }}>
        Competitor Benchmarking
      </h2>
      <table style={{ borderCollapse: "collapse", fontSize: 13, width: "100%" }}>
        <thead>
          <tr>
            <th style={{ textAlign: "left", padding: "4px 10px 4px 0", color: "var(--muted)", fontWeight: 500 }}>Metric</th>
            {data.companies.map((c) => (
              <th key={c} style={{ textAlign: "right", padding: "4px 10px", color: "var(--muted)", fontWeight: 500 }}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.metrics.map((row) => (
            <tr key={row.name} style={{ borderTop: "1px solid var(--muted, #333)" }}>
              <td style={{ padding: "4px 10px 4px 0", color: "var(--text)" }}>
                {row.name.replace(/_/g, " ")} {row.unit ? `(${row.unit})` : ""}
              </td>
              {data.companies.map((c) => {
                const val = row.values[c];
                return (
                  <td key={c} style={{ textAlign: "right", padding: "4px 10px", fontVariantNumeric: "tabular-nums" }}>
                    {val !== undefined ? val.toLocaleString() : "—"}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
