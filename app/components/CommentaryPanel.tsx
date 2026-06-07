import type { CommentaryTrend } from "../../src/dashboard/data.js";

type Tone = CommentaryTrend["tone"];

const TONE_STYLE: Record<Tone, { border: string; badgeBg: string; badgeFg: string; arrow: string }> = {
  cautious:   { border: "#c08080", badgeBg: "#fde8d8", badgeFg: "#8a3030", arrow: "↓" },
  neutral:    { border: "#c8b87a", badgeBg: "#fff9d8", badgeFg: "#8a7a30", arrow: "→" },
  optimistic: { border: "#a0b8a0", badgeBg: "#e8f7e8", badgeFg: "#2a5c3a", arrow: "↗" },
  confident:  { border: "#4a8c5c", badgeBg: "#d4f0e0", badgeFg: "#1a4c2a", arrow: "✓" },
};

function ToneBadge({ tone }: { tone: Tone }) {
  const s = TONE_STYLE[tone];
  return (
    <span style={{ fontSize: 11, background: s.badgeBg, color: s.badgeFg, borderRadius: 4, padding: "2px 7px" }}>
      {s.arrow} {tone}
    </span>
  );
}

function TopicChip({ label, warn }: { label: string; warn: boolean }) {
  return (
    <span
      style={{
        fontSize: 10,
        background: warn ? "#fde8d8" : "rgba(0,0,0,0.06)",
        color: warn ? "#8a3030" : "var(--muted)",
        borderRadius: 3,
        padding: "2px 6px",
      }}
    >
      {label}
    </span>
  );
}

function LatestCard({ trend, priorPeriod }: { trend: CommentaryTrend; priorPeriod: string | undefined }) {
  const s = TONE_STYLE[trend.tone];
  const flagged = !!trend.contradictionNote;
  return (
    <div
      style={{
        background: "rgba(255,255,255,0.5)",
        border: `1px solid ${flagged ? "#e8a080" : "#d6c8ac"}`,
        borderLeft: `3px solid ${s.border}`,
        borderRadius: 8,
        padding: "12px 14px",
        marginBottom: 10,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
        <span style={{ fontWeight: 700, fontSize: 13, color: "var(--text)" }}>{trend.period}</span>
        <ToneBadge tone={trend.tone} />
        {flagged && (
          <span style={{ fontSize: 11, background: "#fde8d8", color: "#8a3030", borderRadius: 4, padding: "2px 7px" }}>
            ⚠ contradicts {priorPeriod ?? "prior Q"}
          </span>
        )}
      </div>
      <p style={{ fontSize: 13, color: "var(--text)", lineHeight: 1.55, margin: "0 0 8px" }}>{trend.summary}</p>
      {trend.contradictionNote && (
        <p style={{ fontSize: 11, color: "#8a3030", fontStyle: "italic", margin: "0 0 8px", lineHeight: 1.4 }}>
          {trend.contradictionNote}
        </p>
      )}
      <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
        {trend.keyTopics.map((t) => (
          <TopicChip key={t} label={t} warn={flagged} />
        ))}
      </div>
    </div>
  );
}

function PriorCard({ trend }: { trend: CommentaryTrend }) {
  const s = TONE_STYLE[trend.tone];
  const flagged = !!trend.contradictionNote;
  const shortSummary =
    trend.summary.length > 100 ? trend.summary.slice(0, 100).replace(/\s\w+$/, "") + "…" : trend.summary;
  return (
    <div
      style={{
        background: "rgba(255,255,255,0.38)",
        border: `1px solid ${flagged ? "#e8a080" : "#e0d8c8"}`,
        borderLeft: `2px solid ${s.border}`,
        borderRadius: 6,
        padding: "9px 11px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5, flexWrap: "wrap" }}>
        <span style={{ fontWeight: 600, fontSize: 11, color: "var(--text)" }}>{trend.period}</span>
        <span style={{ fontSize: 10, color: s.badgeFg }}>
          {s.arrow} {trend.tone}
        </span>
        {flagged && (
          <span style={{ fontSize: 9, background: "#fde8d8", color: "#8a3030", borderRadius: 3, padding: "1px 5px" }}>
            ⚠
          </span>
        )}
      </div>
      <p style={{ fontSize: 11, color: "var(--muted)", lineHeight: 1.4, margin: "0 0 6px" }}>{shortSummary}</p>
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
        {trend.keyTopics.map((t) => (
          <TopicChip key={t} label={t} warn={false} />
        ))}
      </div>
    </div>
  );
}

export function CommentaryPanel({ trends }: { trends: CommentaryTrend[] }) {
  if (!trends || trends.length === 0) {
    return (
      <section style={{ marginTop: 20, marginBottom: 20 }}>
        <h2 style={{ fontSize: 14, textTransform: "uppercase", letterSpacing: 0.5, color: "var(--muted)", margin: "0 0 10px" }}>
          Management Commentary
        </h2>
        <p style={{ color: "var(--muted)", fontSize: 13 }}>Management commentary unavailable for this run.</p>
      </section>
    );
  }

  const latest = trends[trends.length - 1];
  const priorPeriod = trends.length >= 2 ? trends[trends.length - 2].period : undefined;
  const prior = trends.slice(0, trends.length - 1);

  return (
    <section style={{ marginTop: 20, marginBottom: 20 }}>
      <h2 style={{ fontSize: 14, textTransform: "uppercase", letterSpacing: 0.5, color: "var(--muted)", margin: "0 0 12px" }}>
        Management Commentary — Last {trends.length} Quarters
      </h2>
      <LatestCard trend={latest} priorPeriod={priorPeriod} />
      {prior.length > 0 && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${Math.min(prior.length, 3)}, 1fr)`,
            gap: 8,
          }}
        >
          {prior.map((t) => (
            <PriorCard key={t.period} trend={t} />
          ))}
        </div>
      )}
    </section>
  );
}
