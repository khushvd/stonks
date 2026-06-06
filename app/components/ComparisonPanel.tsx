import type { ComparisonCell, ComparisonData } from "../../src/dashboard/comparison.js";

function formatCell(cell: ComparisonCell): string {
  if (cell.state === "value") return cell.value.toLocaleString();
  if (cell.state === "rejected") return "Rejected";
  if (cell.state === "failed") return "Failed";
  return "Missing";
}

function cellTone(cell: ComparisonCell): { bg: string; fg: string; label?: string } {
  if (cell.state === "missing") return { bg: "#fff0d0", fg: "#9a5a00" };
  if (cell.state === "failed" || cell.state === "rejected") return { bg: "#f8d8d2", fg: "#8f2417" };
  return { bg: "rgba(255,255,255,0.42)", fg: "var(--text)", label: cell.badge.label };
}

export function ComparisonPanel({ data }: { data: ComparisonData }) {
  if (!data || data.companies.length < 1 || data.metrics.length === 0) return null;
  const missing = data.metrics.flatMap((row) =>
    data.companies.flatMap((company) => {
      const cell = row.cells[company];
      return cell?.state === "missing" || cell?.state === "failed" || cell?.state === "rejected"
        ? [{ company, label: row.label, state: cell.state }]
        : [];
    }),
  );
  return (
    <section
      style={{
        marginTop: 20,
        marginBottom: 20,
        padding: 18,
        border: "1px solid #d6c8ac",
        borderRadius: 18,
        background: "linear-gradient(135deg, #fffaf0 0%, #f1e6cf 100%)",
        boxShadow: "0 18px 48px rgba(39, 31, 17, 0.10)",
      }}
    >
      <h2
        style={{
          fontSize: 13,
          textTransform: "uppercase",
          letterSpacing: "0.14em",
          color: "#8f2417",
          margin: "0 0 12px",
          fontWeight: 900,
        }}
      >
        Sector KPI Matrix
      </h2>
      <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "separate", borderSpacing: 0, fontSize: 12, width: "100%", fontVariantNumeric: "tabular-nums" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", padding: "10px 8px", background: "#e7dcc5", color: "#4e473c", textTransform: "uppercase" }}>KPI</th>
              {data.companies.map((c) => (
                <th key={c} style={{ textAlign: "right", padding: "10px 8px", background: "#e7dcc5", color: "#4e473c", textTransform: "uppercase" }}>
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.metrics.map((row) => (
              <tr key={row.name}>
                <td style={{ padding: "11px 8px", borderBottom: "1px solid rgba(214,200,172,0.7)", fontWeight: 800 }}>
                  {row.label} {row.unit ? `(${row.unit})` : ""}
                </td>
                {data.companies.map((company) => {
                  const cell = row.cells[company] ?? { state: "missing", reason: null };
                  const tone = cellTone(cell);
                  const title = cell.state === "value" ? [cell.period, cell.badge.label].filter(Boolean).join(" · ") : cell.reason ?? undefined;
                  return (
                    <td
                      key={company}
                      title={title}
                      style={{
                        textAlign: "right",
                        padding: "11px 8px",
                        borderBottom: "1px solid rgba(214,200,172,0.7)",
                        background: tone.bg,
                        color: tone.fg,
                        fontWeight: cell.state === "value" ? 700 : 900,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {cell.state === "value" && cell.citationHref ? (
                        <a href={cell.citationHref} target="_blank" rel="noreferrer" style={{ color: "inherit", textDecoration: "underline" }}>
                          {formatCell(cell)}
                        </a>
                      ) : (
                        formatCell(cell)
                      )}
                      {tone.label && <span style={{ marginLeft: 6, color: "#665f52", fontSize: 10 }}>{tone.label}</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p style={{ color: "#665f52", fontSize: 13, lineHeight: 1.45, margin: "12px 0 0" }}>
        Expected sector KPIs are shown even when missing. Missing cells are follow-up work items, not suppressed data.
      </p>
      {data.coverage.length > 0 && (
        <>
          <h3 style={{ fontSize: 13, textTransform: "uppercase", letterSpacing: "0.14em", color: "#154734", margin: "18px 0 10px", fontWeight: 900 }}>
            Peer Notebook Cards
          </h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
            {data.coverage.map((coverage) => (
              <div key={coverage.company} style={{ background: "#fffaf0", border: "1px solid #d6c8ac", borderRadius: 14, padding: 12 }}>
                <strong style={{ display: "block", fontSize: 15, marginBottom: 6 }}>{coverage.company}</strong>
                <div style={{ color: "#665f52", fontSize: 12, lineHeight: 1.55 }}>
                  AR {coverage.annualReports} · Decks {coverage.presentations} · Concalls {coverage.concalls}
                  <br />
                  KPIs found {coverage.foundKpis.length} · missing {coverage.missingKpis.length} · failed {coverage.failedKpis.length}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
      {missing.length > 0 && (
        <div style={{ marginTop: 16, padding: 14, borderRadius: 16, background: "linear-gradient(135deg, #173e31, #0f2630)", color: "#fff8e8" }}>
          <h3 style={{ fontSize: 13, textTransform: "uppercase", letterSpacing: "0.14em", color: "#f4c15d", margin: "0 0 8px", fontWeight: 900 }}>
            Probe Deeper
          </h3>
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.45 }}>
            Suggested follow-up: ask why {missing[0].label} is {missing[0].state} for {missing[0].company}, and search older decks or concalls only for that company.
          </p>
        </div>
      )}
    </section>
  );
}
