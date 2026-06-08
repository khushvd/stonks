"use client";
import type { BriefingData } from "../types";
import Chapter from "../Chapter";

export default function Risks({ data }: { data: BriefingData }) {
  const risks = data.brief.risks;
  const detail = (
    <div className="card" style={{ padding: "16px 18px" }}>
      <div style={{ fontSize: 13.5, lineHeight: 1.6, color: "var(--text-2)" }}>
        Guidance context: {data.brief.guidance.map((g) => g.text).join(" ")} The structural drivers stay intact, so the risks are about
        <b style={{ color: "var(--text)" }}> pace, not direction</b> — incremental supply and seasonality, not a break in the margin trend.
      </div>
    </div>
  );
  return (
    <Chapter index={6} total={7} id="risks" eyebrow="Risks & what to watch"
      title="Two things to check before you commit"
      dek="What could bend the trajectory. Neither breaks the structural story — but both are worth a look before deeper study."
      detail={detail}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {risks.map((r, i) => (
          <div key={i} className="card" style={{ padding: "15px 18px", display: "flex", gap: 14, alignItems: "flex-start",
            borderLeft: `3px solid ${r.tone === "cautious" ? "var(--warn)" : "var(--muted)"}` }}>
            <span style={{ color: r.tone === "cautious" ? "var(--warn)" : "var(--muted)", fontSize: 18, lineHeight: 1 }}>{r.tone === "cautious" ? "▼" : "▶"}</span>
            <span style={{ fontSize: 15, lineHeight: 1.5, color: "var(--text)" }}>{r.text}</span>
          </div>
        ))}
      </div>
    </Chapter>
  );
}
