"use client";
import Chapter from "../Chapter";
import { MiniBars } from "../charts";
import type { BriefingData } from "../types";

export default function Financials({ data }: { data: BriefingData }) {
  const qs = data.quarters;
  const detail = (
    <div className="card" style={{ padding: "6px 16px 12px", overflowX: "auto" }}>
      <table className="data-table">
        <thead><tr><th>Quarter</th><th>Revenue ₹cr</th><th>EBITDA ₹cr</th><th>PAT ₹cr</th><th>OPM %</th></tr></thead>
        <tbody>
          {qs.map((q) => (
            <tr key={q.period}>
              <td>{q.period}</td>
              <td>{q.rev.toLocaleString("en-IN")}</td>
              <td>{q.ebitda.toLocaleString("en-IN")}</td>
              <td>{q.pat.toLocaleString("en-IN")}</td>
              <td style={{ color: "var(--accent)" }}>{q.margin.toFixed(1)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
  return (
    <Chapter index={3} total={7} id="financials" eyebrow="Financials" alt
      title="Top line and EBITDA both compounding"
      dek="Revenue and EBITDA by quarter (₹cr). Hover any bar for the value. Same seasonal shape, but each year's peak clears the last."
      detail={detail}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div className="card" style={{ padding: "14px 18px" }}>
          <div style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--teal)", marginBottom: 6 }}>REVENUE · ₹cr</div>
          <MiniBars data={qs.map((q) => ({ label: q.label.slice(0, 3), y: q.rev }))} color="var(--teal)" yFmt={(v) => (v / 1000).toFixed(1) + "k"} height={190} />
        </div>
        <div className="card" style={{ padding: "14px 18px" }}>
          <div style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--accent)", marginBottom: 6 }}>EBITDA · ₹cr</div>
          <MiniBars data={qs.map((q) => ({ label: q.label.slice(0, 3), y: q.ebitda }))} color="var(--accent)" yFmt={(v) => v.toFixed(0)} height={190} />
        </div>
      </div>
    </Chapter>
  );
}
