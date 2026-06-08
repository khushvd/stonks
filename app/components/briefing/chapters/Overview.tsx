"use client";
import Chapter from "../Chapter";
import { Delta, Eyebrow } from "../atoms";
import type { BriefingData } from "../types";

export default function Overview({ data }: { data: BriefingData }) {
  const c = data.company, b = data.brief, ig = data.integrity;
  return (
    <Chapter index={1} total={7} id="overview" eyebrow="Overview" alt hint
      title={c.name}
      dek={data.about}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 22, flexWrap: "wrap" }}>
        <span style={{ fontFamily: "var(--mono)", fontSize: 12, fontWeight: 700, color: "var(--accent)",
          border: "1px solid color-mix(in srgb, var(--accent) 45%, transparent)", borderRadius: 5, padding: "3px 9px" }}>{c.ticker}</span>
        <span style={{ color: "var(--muted)", fontSize: 13 }}>{c.industry}</span>
        <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--faint)" }}>· {c.asOf}</span>
      </div>

      <div style={{ background: "var(--panel)", border: "1px solid var(--border)", borderLeft: "3px solid var(--accent)",
        borderRadius: 12, padding: "20px 24px", marginBottom: 22 }}>
        <Eyebrow accent>The ask</Eyebrow>
        <div style={{ fontSize: 14, color: "var(--muted)", margin: "9px 0 12px", fontStyle: "italic" }}>"{data.ask}"</div>
        <div style={{ fontSize: "clamp(19px,2.1vw,25px)", lineHeight: 1.4, fontWeight: 500, letterSpacing: "-0.01em" }}>{b.headline}</div>
      </div>

      <div className="tile-grid" style={{ marginBottom: 22 }}>
        {data.stats.map((s) => (
          <div className="stat-tile" key={s.key}>
            <div className="stat-key">{s.key}</div>
            <div className="stat-val">{s.value}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <Delta dir={s.dir}>{s.delta}</Delta><span className="stat-sub">{s.sub}</span>
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div style={{ background: "color-mix(in srgb, var(--up) 7%, var(--panel))", border: "1px solid color-mix(in srgb, var(--up) 30%, var(--border))", borderRadius: 10, padding: "13px 16px" }}>
          <div style={{ fontFamily: "var(--mono)", fontSize: 10.5, color: "var(--up)", letterSpacing: ".08em", marginBottom: 6 }}>WHY IT MIGHT BE WORTH YOUR TIME</div>
          <div style={{ fontSize: 13.5, lineHeight: 1.5, color: "var(--text-2)" }}>{data.bottomLine.worth}</div>
        </div>
        <div style={{ background: "color-mix(in srgb, var(--warn) 7%, var(--panel))", border: "1px solid color-mix(in srgb, var(--warn) 30%, var(--border))", borderRadius: 10, padding: "13px 16px" }}>
          <div style={{ fontFamily: "var(--mono)", fontSize: 10.5, color: "var(--warn)", letterSpacing: ".08em", marginBottom: 6 }}>WHAT TO CHECK FIRST</div>
          <div style={{ fontSize: 13.5, lineHeight: 1.5, color: "var(--text-2)" }}>{data.bottomLine.watch}</div>
        </div>
      </div>
      <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 16, fontFamily: "var(--mono)", fontSize: 11 }}>
        <span style={{ color: "var(--faint)" }}>Built from {data.sources.length} sources ·</span>
        <span style={{ color: "var(--up)" }}>✓ {ig.verified} verified</span>
        {ig.nlmOnly > 0 && <span style={{ color: "var(--warn)" }}>◌ {ig.nlmOnly} unverified</span>}
        {ig.rejected > 0 && <span style={{ color: "var(--bad)" }}>✕ {ig.rejected} rejected</span>}
      </div>
    </Chapter>
  );
}
