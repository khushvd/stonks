import type { RejectRow } from "../../src/dashboard/data.js";

export function RejectsPanel({ rows }: { rows: RejectRow[] }) {
  if (rows.length === 0) return null;
  return (
    <div style={{ marginTop: 16, border: "1px solid var(--bad)", borderRadius: 6, padding: 10 }}>
      <div style={{ color: "var(--bad)", fontWeight: 700, marginBottom: 6 }}>
        Quarantined ({rows.length}) — not shown as data
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} style={{ borderTop: "1px solid var(--border)" }}>
              <td style={{ padding: "4px 6px" }}>{r.name}</td>
              <td>
                {r.value.toLocaleString()} {r.unit ?? ""}
              </td>
              <td style={{ color: "var(--warn)" }}>{r.reason ?? "rejected"}</td>
              <td style={{ color: "var(--muted)" }}>{r.excerpt ?? ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
