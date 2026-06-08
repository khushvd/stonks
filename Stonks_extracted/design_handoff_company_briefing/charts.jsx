// charts.jsx — on-theme, interactive SVG charts for the Stonks redesign.
// All colors come from CSS vars so they always match the warm-dark theme.
// Exports to window: LineChart, Sparkline, MiniBars, useElementWidth.
const { useRef, useState, useEffect, useLayoutEffect, useCallback } = React;

// Measure a container's width so charts are fluid inside any panel.
function useElementWidth(fallback = 520) {
  const ref = useRef(null);
  const [w, setW] = useState(fallback);
  useLayoutEffect(() => {
    if (!ref.current) return;
    const el = ref.current;
    const ro = new ResizeObserver((entries) => {
      const cw = entries[0]?.contentRect?.width;
      if (cw && Math.abs(cw - w) > 1) setW(cw);
    });
    ro.observe(el);
    setW(el.clientWidth || fallback);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

function niceBounds(min, max, padFrac = 0.12) {
  const span = max - min || 1;
  return [min - span * padFrac, max + span * padFrac];
}

// Multi-series line chart with hover crosshair, value readout, peak dot,
// and a clickable legend to toggle series. series = [{key,label,color,points:[{x,label,y}]}]
function LineChart({ series, height = 220, yUnit = "", yFmt = (v) => v, highlightPeak = true, area = true }) {
  const [wrapRef, width] = useElementWidth(560);
  const [hover, setHover] = useState(null); // index into x axis
  const [off, setOff] = useState({}); // toggled-off series keys
  const active = series.filter((s) => !off[s.key]);

  const padL = 44, padR = 14, padT = 16, padB = 30;
  const innerW = Math.max(40, width - padL - padR);
  const innerH = height - padT - padB;

  const xs = series[0].points.map((p) => p.label);
  const allY = active.flatMap((s) => s.points.map((p) => p.y));
  const [yMin, yMax] = active.length ? niceBounds(Math.min(...allY), Math.max(...allY)) : [0, 1];

  const xAt = (i) => padL + (xs.length <= 1 ? innerW / 2 : (i / (xs.length - 1)) * innerW);
  const yAt = (v) => padT + innerH - ((v - yMin) / (yMax - yMin || 1)) * innerH;

  const ticks = 4;
  const gridYs = Array.from({ length: ticks + 1 }, (_, i) => yMin + (i / ticks) * (yMax - yMin));

  const onMove = useCallback((e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const rel = (x - padL) / innerW;
    const idx = Math.round(rel * (xs.length - 1));
    setHover(Math.max(0, Math.min(xs.length - 1, idx)));
  }, [innerW, xs.length]);

  return (
    <div ref={wrapRef} style={{ width: "100%" }}>
      <svg width={width} height={height} style={{ display: "block", overflow: "visible" }}
           onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
        {/* gridlines + y labels */}
        {gridYs.map((gy, i) => (
          <g key={i}>
            <line x1={padL} x2={width - padR} y1={yAt(gy)} y2={yAt(gy)} stroke="var(--grid)" strokeWidth="1" />
            <text x={padL - 8} y={yAt(gy) + 3} textAnchor="end" fontSize="10" fill="var(--muted)"
                  style={{ fontFamily: "var(--mono)" }}>{yFmt(gy)}</text>
          </g>
        ))}
        {/* x labels */}
        {xs.map((lab, i) => (
          <text key={i} x={xAt(i)} y={height - 8} textAnchor="middle" fontSize="10"
                fill={hover === i ? "var(--text)" : "var(--muted)"} style={{ fontFamily: "var(--mono)" }}>{lab}</text>
        ))}
        {/* hover crosshair */}
        {hover != null && (
          <line x1={xAt(hover)} x2={xAt(hover)} y1={padT} y2={padT + innerH} stroke="var(--accent)" strokeWidth="1" strokeDasharray="3 3" opacity="0.5" />
        )}
        {/* series */}
        {active.map((s) => {
          const d = s.points.map((p, i) => `${i === 0 ? "M" : "L"}${xAt(i)},${yAt(p.y)}`).join(" ");
          const peakIdx = s.points.reduce((bi, p, i, a) => (p.y > a[bi].y ? i : bi), 0);
          return (
            <g key={s.key}>
              {area && active.length === 1 && (
                <path d={`${d} L${xAt(s.points.length - 1)},${padT + innerH} L${xAt(0)},${padT + innerH} Z`}
                      fill={s.color} opacity="0.10" />
              )}
              <path d={d} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
              {s.points.map((p, i) => (
                <circle key={i} cx={xAt(i)} cy={yAt(p.y)} r={hover === i ? 4 : (highlightPeak && i === peakIdx ? 3.5 : 2.4)}
                        fill={highlightPeak && i === peakIdx ? s.color : "var(--panel)"} stroke={s.color} strokeWidth="1.6" />
              ))}
              {highlightPeak && active.length === 1 && (
                <text x={xAt(peakIdx)} y={yAt(s.points[peakIdx].y) - 10} textAnchor="middle" fontSize="10"
                      fill={s.color} style={{ fontFamily: "var(--mono)", fontWeight: 600 }}>
                  peak {yFmt(s.points[peakIdx].y)}
                </text>
              )}
            </g>
          );
        })}
        {/* hover readout dots */}
        {hover != null && active.map((s) => (
          <circle key={s.key} cx={xAt(hover)} cy={yAt(s.points[hover].y)} r="4.5" fill={s.color} stroke="var(--bg)" strokeWidth="1.5" />
        ))}
      </svg>

      {/* hover value chips */}
      <div style={{ minHeight: 20, display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center", padding: "2px 0 0 44px" }}>
        {hover != null ? (
          active.map((s) => (
            <span key={s.key} style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--muted)" }}>
              <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: s.color, marginRight: 5 }}></span>
              {s.label} <b style={{ color: "var(--text)" }}>{yFmt(s.points[hover].y)}{yUnit}</b>
              <span style={{ marginLeft: 4, opacity: 0.7 }}>· {xs[hover]}</span>
            </span>
          ))
        ) : (
          <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--faint)" }}>hover the chart for values</span>
        )}
      </div>

      {/* toggle legend (only if >1 series) */}
      {series.length > 1 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", padding: "8px 0 0 44px" }}>
          {series.map((s) => {
            const isOff = !!off[s.key];
            return (
              <button key={s.key} onClick={() => setOff((o) => ({ ...o, [s.key]: !o[s.key] }))}
                style={{
                  display: "flex", alignItems: "center", gap: 6, padding: "3px 9px", borderRadius: 999,
                  border: "1px solid var(--border)", background: isOff ? "transparent" : "var(--panel-2)",
                  color: isOff ? "var(--faint)" : "var(--text)", fontFamily: "var(--mono)", fontSize: 11,
                  cursor: "pointer", opacity: isOff ? 0.5 : 1,
                }}>
                <span style={{ width: 9, height: 9, borderRadius: 2, background: s.color, opacity: isOff ? 0.4 : 1 }}></span>
                {s.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Tiny in-cell sparkline.
function Sparkline({ values, color = "var(--accent)", width = 64, height = 20, strokeWidth = 1.4 }) {
  const min = Math.min(...values), max = Math.max(...values);
  const x = (i) => (values.length <= 1 ? width / 2 : (i / (values.length - 1)) * (width - 2) + 1);
  const y = (v) => height - 2 - ((v - min) / (max - min || 1)) * (height - 4);
  const d = values.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  return (
    <svg width={width} height={height} style={{ display: "block" }}>
      <path d={d} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(values.length - 1)} cy={y(values[values.length - 1])} r="1.8" fill={color} />
    </svg>
  );
}

// Compact bar chart with hover, for revenue/EBITDA by quarter.
function MiniBars({ data, height = 150, color = "var(--teal)", yFmt = (v) => v, unit = "" }) {
  const [wrapRef, width] = useElementWidth(420);
  const [hover, setHover] = useState(null);
  const padL = 40, padR = 8, padT = 14, padB = 24;
  const innerW = width - padL - padR, innerH = height - padT - padB;
  const max = Math.max(...data.map((d) => d.y)) * 1.1;
  const bw = innerW / data.length;
  const yAt = (v) => padT + innerH - (v / max) * innerH;
  return (
    <div ref={wrapRef} style={{ width: "100%" }}>
      <svg width={width} height={height} style={{ display: "block" }} onMouseLeave={() => setHover(null)}>
        {[0, 0.5, 1].map((f, i) => (
          <g key={i}>
            <line x1={padL} x2={width - padR} y1={yAt(max * f)} y2={yAt(max * f)} stroke="var(--grid)" />
            <text x={padL - 6} y={yAt(max * f) + 3} textAnchor="end" fontSize="9" fill="var(--muted)" style={{ fontFamily: "var(--mono)" }}>{yFmt(max * f)}</text>
          </g>
        ))}
        {data.map((d, i) => {
          const bx = padL + i * bw + bw * 0.18;
          const bWidth = bw * 0.64;
          const h = innerH - (yAt(d.y) - padT);
          return (
            <g key={i} onMouseEnter={() => setHover(i)}>
              <rect x={padL + i * bw} y={padT} width={bw} height={innerH} fill="transparent" />
              <rect x={bx} y={yAt(d.y)} width={bWidth} height={Math.max(0, h)} rx="2"
                    fill={color} opacity={hover == null || hover === i ? 0.9 : 0.4} />
              <text x={bx + bWidth / 2} y={height - 8} textAnchor="middle" fontSize="9"
                    fill={hover === i ? "var(--text)" : "var(--muted)"} style={{ fontFamily: "var(--mono)" }}>{d.label}</text>
              {hover === i && (
                <text x={bx + bWidth / 2} y={yAt(d.y) - 5} textAnchor="middle" fontSize="10"
                      fill="var(--text)" style={{ fontFamily: "var(--mono)", fontWeight: 600 }}>{yFmt(d.y)}{unit}</text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

Object.assign(window, { LineChart, Sparkline, MiniBars, useElementWidth });
