"use client";
import type { BriefingData } from "../types";
import Chapter from "../Chapter";
import { Flag, TRUST_META, SRC_COLOR } from "../atoms";
import { cellInfo } from "../format";

export default function Provenance({ data }: { data: BriefingData }) {
  const ig = data.integrity;
  const flaggedCells = data.matrix.flatMap((row) =>
    data.peers.map((p) => ({ row, p, info: cellInfo(row.cells[p]) }))
  ).filter((x) => x.info.trust && x.info.trust !== "ok");

  const detail = (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {flaggedCells.map((x, i) => {
        const m = (TRUST_META as Record<string, { color: string }>)[x.info.trust] ?? { color: "var(--muted)" };
        return (
          <div key={i} className="card" style={{ padding: "12px 15px", display: "flex", gap: 12, alignItems: "flex-start", borderLeft: `3px solid ${m.color}` }}>
            <Flag trust={x.info.trust} />
            <span style={{ fontSize: 13, lineHeight: 1.45, color: "var(--text-2)" }}>
              <b style={{ color: "var(--text)", fontFamily: "var(--mono)" }}>{x.p} · {x.row.kpi}</b> — {x.info.note}
            </span>
          </div>
        );
      })}
    </div>
  );

  return (
    <Chapter index={7} total={7} id="sources" eyebrow="Provenance" alt
      title="Where this came from"
      dek="Every figure in this briefing traces to a source page. The pipeline verified most, flagged a few, and quarantined one — surfaced here so nothing hides."
      detail={detail}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12, marginBottom: 18 }}>
        {data.sources.map((s) => (
          <div key={s.label} className="card" style={{ padding: "13px 16px", display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: SRC_COLOR[s.type] ?? "var(--muted)" }} />
            <div>
              <div style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--faint)", letterSpacing: ".08em" }}>{s.type}</div>
              <div style={{ fontSize: 13.5, color: "var(--text)" }}>{s.label}</div>
            </div>
            <span style={{ marginLeft: "auto", fontFamily: "var(--mono)", fontSize: 11, color: "var(--muted)" }}>p{s.page}</span>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <span style={{ flex: 1, minWidth: 120, background: "color-mix(in srgb, var(--up) 8%, var(--panel))", border: "1px solid color-mix(in srgb, var(--up) 30%, var(--border))", borderRadius: 10, padding: "12px 16px" }}>
          <div style={{ fontFamily: "var(--mono)", fontSize: 22, fontWeight: 700, color: "var(--up)" }}>✓ {ig.verified}</div>
          <div style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--muted)" }}>verified figures</div>
        </span>
        <span style={{ flex: 1, minWidth: 120, background: "color-mix(in srgb, var(--warn) 8%, var(--panel))", border: "1px solid color-mix(in srgb, var(--warn) 30%, var(--border))", borderRadius: 10, padding: "12px 16px" }}>
          <div style={{ fontFamily: "var(--mono)", fontSize: 22, fontWeight: 700, color: "var(--warn)" }}>◌ {ig.nlmOnly}</div>
          <div style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--muted)" }}>unverified (NLM-only)</div>
        </span>
        <span style={{ flex: 1, minWidth: 120, background: "color-mix(in srgb, var(--bad) 8%, var(--panel))", border: "1px solid color-mix(in srgb, var(--bad) 30%, var(--border))", borderRadius: 10, padding: "12px 16px" }}>
          <div style={{ fontFamily: "var(--mono)", fontSize: 22, fontWeight: 700, color: "var(--bad)" }}>✕ {ig.rejected}</div>
          <div style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--muted)" }}>rejected / quarantined</div>
        </span>
      </div>
    </Chapter>
  );
}
