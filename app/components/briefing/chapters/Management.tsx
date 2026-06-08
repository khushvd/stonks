"use client";
import type { BriefingData } from "../types";
import Chapter from "../Chapter";
import { ToneBadge, TONE_META } from "../atoms";

const TONE_SCORE: Record<string, number> = { cautious: 1, neutral: 2, optimistic: 3, confident: 4 };

export default function Management({ data }: { data: BriefingData }) {
  const flagged = data.commentary.find((q) => q.flag);

  function TonePath() {
    const commentary = data.commentary;
    const w = 760, h = 130, padX = 60, padY = 26;
    const innerW = w - padX * 2, innerH = h - padY * 2;
    const x = (i: number) => padX + (i / (commentary.length - 1)) * innerW;
    const y = (s: number) => padY + innerH - ((s - 1) / 3) * innerH;
    const d = commentary.map((q, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(TONE_SCORE[q.tone] ?? 2)}`).join(" ");
    return (
      <svg viewBox={`0 0 ${w} ${h}`} style={{ width: "100%", height: "auto", overflow: "visible" }}>
        {[1, 2, 3, 4].map((s) => (
          <line key={s} x1={padX} x2={w - padX} y1={y(s)} y2={y(s)} stroke="var(--grid)" />
        ))}
        <path d={d} fill="none" stroke="var(--accent)" strokeWidth="2" />
        {commentary.map((q, i) => {
          const m = TONE_META[q.tone] ?? TONE_META.neutral;
          const isFlagged = !!q.flag;
          return (
            <g key={q.period}>
              <circle cx={x(i)} cy={y(TONE_SCORE[q.tone] ?? 2)} r={isFlagged ? 7 : 5}
                fill={isFlagged ? "var(--warn)" : m.color} stroke="var(--bg)" strokeWidth="2" />
              <text x={x(i)} y={h - 4} textAnchor="middle" fontSize="11" fill={isFlagged ? "var(--warn)" : "var(--muted)"} style={{ fontFamily: "var(--mono)" }}>{q.period}</text>
              <text x={x(i)} y={y(TONE_SCORE[q.tone] ?? 2) - 13} textAnchor="middle" fontSize="10" fill={m.color} style={{ fontFamily: "var(--mono)" }}>{q.tone}</text>
              {isFlagged && <text x={x(i)} y={y(TONE_SCORE[q.tone] ?? 2) + 22} textAnchor="middle" fontSize="11" fill="var(--warn)">⚠</text>}
            </g>
          );
        })}
      </svg>
    );
  }

  const detail = (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {data.commentary.map((q) => (
        <div key={q.period} className="card" style={{
          padding: "13px 16px",
          borderColor: q.flag ? "color-mix(in srgb, var(--warn) 40%, var(--border))" : "var(--border)",
          background: q.flag ? "color-mix(in srgb, var(--warn) 7%, var(--panel))" : "var(--panel)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 6 }}>
            <span style={{ fontFamily: "var(--mono)", fontSize: 12, fontWeight: 600 }}>{q.period}</span>
            <ToneBadge tone={q.tone} />
            {q.flag && <span style={{ marginLeft: "auto", fontFamily: "var(--mono)", fontSize: 9.5, color: "var(--warn)", border: "1px solid var(--warn)", borderRadius: 3, padding: "1px 5px" }}>⚠ CONTRADICTION</span>}
          </div>
          <div style={{ fontSize: 13.5, lineHeight: 1.5, color: "var(--text-2)" }}>{q.summary}</div>
          {q.flag && <div style={{ marginTop: 8, fontSize: 12.5, lineHeight: 1.45, color: "var(--warn)" }}>{q.flag}</div>}
        </div>
      ))}
    </div>
  );

  return (
    <Chapter index={5} total={7} id="management" eyebrow="Management commentary" alt
      title="Confident through Q3 — then a softer Q4"
      dek="Tone across the last four earnings calls. The trajectory rose into a record Q3, then cooled in Q4 — and the system flagged the shift as a contradiction worth probing."
      detail={detail}>
      <div className="card" style={{ padding: "20px 22px 12px" }}>
        <TonePath />
      </div>
      {flagged && (
        <div style={{ marginTop: 14, background: "color-mix(in srgb, var(--warn) 9%, var(--panel))", border: "1px solid color-mix(in srgb, var(--warn) 40%, var(--border))", borderRadius: 10, padding: "13px 16px" }}>
          <div style={{ fontFamily: "var(--mono)", fontSize: 10.5, color: "var(--warn)", letterSpacing: ".06em", marginBottom: 6 }}>⚠ CONTRADICTION DETECTED · {flagged.period}</div>
          <div style={{ fontSize: 13.5, lineHeight: 1.5, color: "var(--text-2)" }}>{flagged.flag}</div>
        </div>
      )}
    </Chapter>
  );
}
