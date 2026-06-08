// briefing-sections.jsx — the 7 chapters of the Stonks company briefing.
// Each section renders a concise "slide" view; detail content is passed to <Chapter detail=...>.
const { useState: useStateS } = React;

const padN = (n) => String(n).padStart(2, "0");

// ---- reusable chapter frame (slide + expandable detail) ----
function Chapter({ index, total, id, eyebrow, title, dek, accent, alt, children, detail, hint }) {
  const [open, setOpen] = useStateS(false);
  return (
    <section className={"chapter" + (alt ? " alt" : "")} id={id} data-chapter={index}
      data-screen-label={padN(index)}
      onDoubleClick={detail ? () => setOpen((o) => !o) : undefined}>
      <span className="watermark">{padN(index)}</span>
      <div className="chapter-inner">
        <div className="ch-head">
          <div className="ch-index">{padN(index)} / {padN(total)} · {eyebrow}</div>
          <h2 className="ch-title">{title}</h2>
          {dek && <p className="ch-dek">{dek}</p>}
        </div>
        {children}
        {detail && (
          <div>
            <button className={"expand-btn" + (open ? " open" : "")} onClick={() => setOpen((o) => !o)}>
              {open ? "Collapse" : "Expand detail"} <span className="chev">▾</span>
            </button>
            <div className={"detail" + (open ? " open" : "")}>
              <div className="detail-inner"><div className="detail-pad">{detail}</div></div>
            </div>
          </div>
        )}
      </div>
      {hint && (
        <div className="scroll-hint"><span>scroll · or ↓</span><span>⌄</span></div>
      )}
    </section>
  );
}

// ---- 01 · Overview ----
function ChOverview() {
  const c = STONKS.company, b = STONKS.brief, ig = STONKS.integrity;
  return (
    <Chapter index={1} total={7} id="overview" eyebrow="Overview" alt hint
      title={c.name}
      dek={STONKS.about}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 22, flexWrap: "wrap" }}>
        <span style={{ fontFamily: "var(--mono)", fontSize: 12, fontWeight: 700, color: "var(--accent)",
          border: "1px solid color-mix(in srgb, var(--accent) 45%, transparent)", borderRadius: 5, padding: "3px 9px" }}>{c.ticker}</span>
        <span style={{ color: "var(--muted)", fontSize: 13 }}>{c.industry}</span>
        <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--faint)" }}>· {c.asOf}</span>
      </div>

      <div style={{ background: "var(--panel)", border: "1px solid var(--border)", borderLeft: "3px solid var(--accent)",
        borderRadius: 12, padding: "20px 24px", marginBottom: 22 }}>
        <Eyebrow accent>The ask</Eyebrow>
        <div style={{ fontSize: 14, color: "var(--muted)", margin: "9px 0 12px", fontStyle: "italic" }}>“{STONKS.ask}”</div>
        <div style={{ fontSize: "clamp(19px,2.1vw,25px)", lineHeight: 1.4, fontWeight: 500, letterSpacing: "-0.01em" }}>{b.headline}</div>
      </div>

      <div className="tile-grid" style={{ marginBottom: 22 }}>
        {STONKS.stats.map((s) => (
          <div className="stat-tile" key={s.key}>
            <div className="stat-key">{s.key}</div>
            <div className="stat-val">{s.value}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <Delta dir={s.dir}>{s.delta}</Delta><span className="stat-sub">{s.sub}</span>
            </div>
          </div>
        ))}
      </div>

      {/* bottom line + trust strip */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div style={{ background: "color-mix(in srgb, var(--up) 7%, var(--panel))", border: "1px solid color-mix(in srgb, var(--up) 30%, var(--border))", borderRadius: 10, padding: "13px 16px" }}>
          <div style={{ fontFamily: "var(--mono)", fontSize: 10.5, color: "var(--up)", letterSpacing: ".08em", marginBottom: 6 }}>WHY IT MIGHT BE WORTH YOUR TIME</div>
          <div style={{ fontSize: 13.5, lineHeight: 1.5, color: "var(--text-2)" }}>{STONKS.bottomLine.worth}</div>
        </div>
        <div style={{ background: "color-mix(in srgb, var(--warn) 7%, var(--panel))", border: "1px solid color-mix(in srgb, var(--warn) 30%, var(--border))", borderRadius: 10, padding: "13px 16px" }}>
          <div style={{ fontFamily: "var(--mono)", fontSize: 10.5, color: "var(--warn)", letterSpacing: ".08em", marginBottom: 6 }}>WHAT TO CHECK FIRST</div>
          <div style={{ fontSize: 13.5, lineHeight: 1.5, color: "var(--text-2)" }}>{STONKS.bottomLine.watch}</div>
        </div>
      </div>
      <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 16, fontFamily: "var(--mono)", fontSize: 11 }}>
        <span style={{ color: "var(--faint)" }}>Built from {STONKS.sources.length} sources ·</span>
        <span style={{ color: "var(--up)" }}>✓ {ig.verified} verified</span>
        {ig.nlmOnly > 0 && <span style={{ color: "var(--warn)" }}>◌ {ig.nlmOnly} unverified</span>}
        {ig.rejected > 0 && <span style={{ color: "var(--bad)" }}>✕ {ig.rejected} rejected</span>}
      </div>
    </Chapter>
  );
}

// ---- 02 · Margins ----
function ChMargins() {
  const qs = STONKS.quarters;
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
        {STONKS.brief.drivers.map((d, i) => (
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

// ---- 03 · Financials ----
function ChFinancials() {
  const qs = STONKS.quarters;
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

window.StonksChapters = { Chapter, ChOverview, ChMargins, ChFinancials, padN };
