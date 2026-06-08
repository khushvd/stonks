// briefing-sections2.jsx — chapters 04–07.
const { useState: useStateS2 } = React;
const { Chapter } = window.StonksChapters;

// ---- 04 · Peers ----
function PeerRankBars() {
  const row = STONKS.matrix.find((m) => m.kpi === "EBITDA margin");
  const data = STONKS.peers.map((p) => ({ p, info: cellInfo(row.cells[p]) }))
    .filter((d) => d.info.v != null && d.info.trust !== "rejected")
    .sort((a, b) => b.info.v - a.info.v);
  const max = Math.max(...data.map((d) => d.info.v));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
      {data.map(({ p, info }) => {
        const main = p === "INDHOTEL";
        return (
          <div key={p} style={{ display: "grid", gridTemplateColumns: "108px 1fr 46px", alignItems: "center", gap: 12 }}>
            <span style={{ fontFamily: "var(--mono)", fontSize: 12, color: main ? "var(--accent)" : "var(--muted)", fontWeight: main ? 700 : 400 }}>{p}</span>
            <span style={{ height: 10, background: "var(--panel-2)", borderRadius: 999, overflow: "hidden" }}>
              <span style={{ display: "block", height: "100%", width: `${(info.v / max) * 100}%`,
                background: main ? "var(--accent)" : "color-mix(in srgb, var(--teal) 70%, transparent)", borderRadius: 999 }}></span>
            </span>
            <span style={{ fontFamily: "var(--mono)", fontSize: 12.5, textAlign: "right", color: main ? "var(--text)" : "var(--text-2)", fontWeight: main ? 700 : 400 }}>{info.v.toFixed(1)}</span>
          </div>
        );
      })}
    </div>
  );
}

function FullMatrix() {
  const [sortBy, setSortBy] = useStateS2(null);
  let cols = [...STONKS.peers];
  if (sortBy) {
    const row = STONKS.matrix.find((m) => m.kpi === sortBy);
    cols.sort((a, b) => {
      const av = cellInfo(row.cells[a]).v, bv = cellInfo(row.cells[b]).v;
      if (av == null) return 1; if (bv == null) return -1; return bv - av;
    });
  }
  return (
    <div className="card" style={{ padding: "4px 4px", overflowX: "auto" }}>
      <table className="data-table" style={{ fontSize: 12 }}>
        <thead>
          <tr>
            <th style={{ fontSize: 10, color: "var(--faint)" }}>KPI · click to sort ↓</th>
            {cols.map((p) => (
              <th key={p} style={{ color: p === "INDHOTEL" ? "var(--accent)" : "var(--text-2)" }}>{p}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {STONKS.matrix.map((row) => {
            const isSort = sortBy === row.kpi;
            return (
              <tr key={row.kpi} style={{ background: isSort ? "color-mix(in srgb, var(--accent) 6%, transparent)" : "transparent" }}>
                <td onClick={() => setSortBy(isSort ? null : row.kpi)} style={{ cursor: "pointer", color: isSort ? "var(--accent)" : "var(--text)", whiteSpace: "nowrap" }}>
                  {isSort ? "▾ " : ""}{row.kpi} <span style={{ color: "var(--faint)", fontSize: 10 }}>{row.unit}</span>
                </td>
                {cols.map((p) => {
                  const info = cellInfo(row.cells[p]);
                  const main = p === "INDHOTEL";
                  const bad = info.trust === "rejected" || info.trust === "missing";
                  return (
                    <td key={p} title={info.note || ""} style={{
                      background: main ? "color-mix(in srgb, var(--accent) 6%, transparent)" : "transparent",
                      color: bad ? "var(--faint)" : "var(--text)", whiteSpace: "nowrap" }}>
                      {row.kpi === "EBITDA margin" && info.v != null && info.trust !== "rejected" && (
                        <span style={{ display: "inline-block", verticalAlign: "middle", marginRight: 6, opacity: 0.8 }}>
                          <Sparkline values={STONKS.peerMargins[p]} width={40} height={14} color={main ? "var(--accent)" : "var(--teal)"} />
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
        Hover a flagged cell for why it's quarantined. SAMHI margin rejected (unit mismatch); SAMHI ARR is NotebookLM-only; ITC Hotels RevPAR undisclosed.
      </div>
    </div>
  );
}

function ChPeers() {
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

// ---- 05 · Management ----
const TONE_SCORE = { cautious: 1, neutral: 2, optimistic: 3, confident: 4 };
function TonePath() {
  const data = STONKS.commentary;
  const w = 760, h = 130, padX = 60, padY = 26;
  const innerW = w - padX * 2, innerH = h - padY * 2;
  const x = (i) => padX + (i / (data.length - 1)) * innerW;
  const y = (s) => padY + innerH - ((s - 1) / 3) * innerH;
  const d = data.map((q, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(TONE_SCORE[q.tone])}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: "100%", height: "auto", overflow: "visible" }}>
      {[1, 2, 3, 4].map((s) => (
        <line key={s} x1={padX} x2={w - padX} y1={y(s)} y2={y(s)} stroke="var(--grid)" />
      ))}
      <path d={d} fill="none" stroke="var(--accent)" strokeWidth="2" />
      {data.map((q, i) => {
        const m = (window.TONE_META || {})[q.tone] || {};
        const flagged = !!q.flag;
        return (
          <g key={q.period}>
            <circle cx={x(i)} cy={y(TONE_SCORE[q.tone])} r={flagged ? 7 : 5}
              fill={flagged ? "var(--warn)" : (m.color || "var(--accent)")} stroke="var(--bg)" strokeWidth="2" />
            <text x={x(i)} y={h - 4} textAnchor="middle" fontSize="11" fill={flagged ? "var(--warn)" : "var(--muted)"} style={{ fontFamily: "var(--mono)" }}>{q.period}</text>
            <text x={x(i)} y={y(TONE_SCORE[q.tone]) - 13} textAnchor="middle" fontSize="10" fill={m.color || "var(--muted)"} style={{ fontFamily: "var(--mono)" }}>{q.tone}</text>
            {flagged && <text x={x(i)} y={y(TONE_SCORE[q.tone]) + 22} textAnchor="middle" fontSize="11" fill="var(--warn)">⚠</text>}
          </g>
        );
      })}
    </svg>
  );
}

function ChManagement() {
  const flagged = STONKS.commentary.find((q) => q.flag);
  const detail = (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {STONKS.commentary.map((q) => (
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

// ---- 06 · Risks ----
function ChRisks() {
  const risks = STONKS.brief.risks;
  const detail = (
    <div className="card" style={{ padding: "16px 18px" }}>
      <div style={{ fontSize: 13.5, lineHeight: 1.6, color: "var(--text-2)" }}>
        Guidance context: {STONKS.brief.guidance.map((g) => g.text).join(" ")} The structural drivers stay intact, so the risks are about
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

// ---- 07 · Sources ----
function ChSources() {
  const ig = STONKS.integrity;
  const rejected = STONKS.matrix.flatMap((row) => STONKS.peers.map((p) => ({ row, p, info: cellInfo(row.cells[p]) })))
    .filter((x) => x.info.trust && x.info.trust !== "ok");
  const detail = (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {rejected.map((x, i) => {
        const m = (window.TRUST_META || {})[x.info.trust] || {};
        return (
          <div key={i} className="card" style={{ padding: "12px 15px", display: "flex", gap: 12, alignItems: "flex-start", borderLeft: `3px solid ${m.color || "var(--muted)"}` }}>
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
        {STONKS.sources.map((s) => (
          <div key={s.label} className="card" style={{ padding: "13px 16px", display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: (window.SRC_COLOR || {})[s.type] || "var(--muted)" }}></span>
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

window.StonksChapters2 = { ChPeers, ChManagement, ChRisks, ChSources };
