"use client";
import { useState } from "react";
import type { BriefingData } from "../types";
import Chapter from "../Chapter";
import { Sparkline } from "../charts";
import { Flag } from "../atoms";
import { cellInfo, fmtNum } from "../format";
import { sortPeers } from "../peers-sort";

export default function Peers({ data }: { data: BriefingData }) {
  // Matrix columns are keyed by whatever the adapter used as column keys (peer names for real
  // data, tickers for the mock). The subject is always the first column.
  const subject = data.peers[0] ?? data.company.ticker;

  function PeerRankBars() {
    const row = data.matrix.find((m) => m.kpi === "EBITDA margin");
    if (!row) return null;
    const ranked = data.peers
      .map((p) => ({ p, info: cellInfo(row.cells[p]) }))
      .filter((d) => d.info.v != null && d.info.trust !== "rejected")
      .sort((a, b) => (b.info.v ?? 0) - (a.info.v ?? 0));
    const max = Math.max(...ranked.map((d) => d.info.v ?? 0));
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
        {ranked.map(({ p, info }) => {
          const main = p === subject;
          return (
            <div key={p} style={{ display: "grid", gridTemplateColumns: "108px 1fr 46px", alignItems: "center", gap: 12 }}>
              <span style={{ fontFamily: "var(--mono)", fontSize: 12, color: main ? "var(--accent)" : "var(--muted)", fontWeight: main ? 700 : 400 }}>{p}</span>
              <span style={{ height: 10, background: "var(--panel-2)", borderRadius: 999, overflow: "hidden" }}>
                <span style={{ display: "block", height: "100%", width: `${((info.v ?? 0) / max) * 100}%`,
                  background: main ? "var(--accent)" : "color-mix(in srgb, var(--teal) 70%, transparent)", borderRadius: 999 }} />
              </span>
              <span style={{ fontFamily: "var(--mono)", fontSize: 12.5, textAlign: "right", color: main ? "var(--text)" : "var(--text-2)", fontWeight: main ? 700 : 400 }}>{(info.v ?? 0).toFixed(1)}</span>
            </div>
          );
        })}
      </div>
    );
  }

  function FullMatrix() {
    const [sortBy, setSortBy] = useState<string | null>(null);
    const sortRow = sortBy ? (data.matrix.find((m) => m.kpi === sortBy) ?? null) : null;
    const cols = sortPeers([...data.peers], sortRow);
    return (
      <div className="card" style={{ padding: "4px 4px", overflowX: "auto" }}>
        <table className="data-table" style={{ fontSize: 12 }}>
          <thead>
            <tr>
              <th style={{ fontSize: 10, color: "var(--faint)" }}>KPI · click to sort ↓</th>
              {cols.map((p) => (
                <th key={p} style={{ color: p === subject ? "var(--accent)" : "var(--text-2)" }}>{p}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.matrix.map((row) => {
              const isSort = sortBy === row.kpi;
              return (
                <tr key={row.kpi} style={{ background: isSort ? "color-mix(in srgb, var(--accent) 6%, transparent)" : "transparent" }}>
                  <td onClick={() => setSortBy(isSort ? null : row.kpi)} style={{ cursor: "pointer", color: isSort ? "var(--accent)" : "var(--text)", whiteSpace: "nowrap" }}>
                    {isSort ? "▾ " : ""}{row.kpi} <span style={{ color: "var(--faint)", fontSize: 10 }}>{row.unit}</span>
                  </td>
                  {cols.map((p) => {
                    const info = cellInfo(row.cells[p]);
                    const main = p === subject;
                    const bad = info.trust === "rejected" || info.trust === "missing";
                    return (
                      <td key={p} title={info.note ?? ""} style={{
                        background: main ? "color-mix(in srgb, var(--accent) 6%, transparent)" : "transparent",
                        color: bad ? "var(--faint)" : "var(--text)", whiteSpace: "nowrap" }}>
                        {row.kpi === "EBITDA margin" && info.v != null && info.trust !== "rejected" && (
                          <span style={{ display: "inline-block", verticalAlign: "middle", marginRight: 6, opacity: 0.8 }}>
                            <Sparkline values={data.peerMargins[p] ?? []} width={40} height={14} color={main ? "var(--accent)" : "var(--teal)"} />
                          </span>
                        )}
                        <span style={{ fontWeight: main ? 700 : 400 }}>{fmtNum(info.v, row.fmt)}</span>
                        {info.trust !== "ok" && <span style={{ marginLeft: 5 }}><Flag trust={info.trust} /></span>}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
        <div style={{ padding: "8px 12px", fontFamily: "var(--mono)", fontSize: 10, color: "var(--faint)", lineHeight: 1.5 }}>
          Hover a flagged cell for why it&apos;s quarantined. SAMHI margin rejected (unit mismatch); SAMHI ARR is NotebookLM-only; ITC Hotels RevPAR undisclosed.
        </div>
      </div>
    );
  }

  return (
    <Chapter index={4} total={7} id="peers" eyebrow="Peers · Hotels"
      title="Mid-pack on margin, top on scale"
      dek="Where Indian Hotels sits against five listed hospitality peers. It leads on absolute size and keys; smaller pure-luxury players (Lemon Tree, Chalet) run structurally higher margins."
      detail={<FullMatrix />}>
      <div className="card" style={{ padding: "18px 22px" }}>
        <div style={{ fontFamily: "var(--mono)", fontSize: 10.5, color: "var(--muted)", letterSpacing: ".06em", marginBottom: 14 }}>EBITDA MARGIN % · RANKED (latest disclosed)</div>
        <PeerRankBars />
      </div>
    </Chapter>
  );
}
