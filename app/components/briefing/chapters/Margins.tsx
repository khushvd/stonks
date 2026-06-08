"use client";
import Chapter from "../Chapter";
import { LineChart } from "../charts";
import type { BriefingData } from "../types";

export default function Margins({ data }: { data: BriefingData }) {
  const qs = data.quarters;
  const series = [{ key: "m", label: "EBITDA margin %", color: "var(--accent)",
    points: qs.map((q) => ({ label: q.label, y: q.margin })) }];
  const detail = (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
      <div className="card" style={{ padding: "6px 14px 12px" }}>
        <div style={{ fontFamily: "var(--mono)", fontSize: 10.5, color: "var(--muted)", padding: "10px 0 4px", letterSpacing: ".06em" }}>QUARTERLY · OPM %</div>
        <table className="data-table">
          <thead><tr><th>Quarter</th><th>Margin</th><th>QoQ</th></tr></thead>
          <tbody>
            {qs.map((q, i) => {
              const d = i === 0 ? null : +(q.margin - qs[i - 1].margin).toFixed(1);
              return (
                <tr key={q.period}>
                  <td>{q.period}</td>
                  <td style={{ color: "var(--text)", fontWeight: 600 }}>{q.margin.toFixed(1)}%</td>
                  <td style={{ color: d == null ? "var(--faint)" : d >= 0 ? "var(--up)" : "var(--bad)" }}>{d == null ? "—" : (d >= 0 ? "+" : "") + d}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ fontFamily: "var(--mono)", fontSize: 10.5, color: "var(--muted)", letterSpacing: ".06em" }}>WHAT MOVED THE NUMBERS</div>
        {data.brief.drivers.map((d, i) => (
          <div key={i} className="card" style={{ padding: "11px 14px", display: "flex", gap: 11, alignItems: "flex-start" }}>
            {d.metric && <span style={{ fontFamily: "var(--mono)", fontSize: 11, fontWeight: 700, color: "var(--accent)", whiteSpace: "nowrap" }}>{d.metric}</span>}
            <span style={{ fontSize: 13, lineHeight: 1.45, color: "var(--text-2)" }}>{d.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
  return (
    <Chapter index={2} total={7} id="margins" eyebrow="Margins · the answer"
      title="Margins stepped up ~8 points in two years"
      dek="Consolidated EBITDA margin, last 8 quarters. The trend is structural; the sawtooth is seasonality — festive-heavy Q3 prints the peak, monsoon Q1 the trough."
      detail={detail}>
      <div className="card" style={{ padding: "18px 20px 12px" }}>
        <LineChart series={series} height={300} yUnit="%" yFmt={(v) => v.toFixed(0)} />
      </div>
    </Chapter>
  );
}
