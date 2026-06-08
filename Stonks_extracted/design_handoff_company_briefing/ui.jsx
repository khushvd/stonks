// ui.jsx — shared atoms + formatters for the Stonks redesign.
// Trust philosophy: VERIFIED is silent. Only problems get color.

// Format a numeric value per the matrix row's fmt.
function fmtNum(v, fmt) {
  if (v == null) return "—";
  if (fmt === "pct") return v.toFixed(1);
  return v.toLocaleString("en-IN");
}

// A matrix cell value may be a bare number (verified/silent) or an object {v, trust, note}.
function cellInfo(raw) {
  if (raw && typeof raw === "object") return { v: raw.v, trust: raw.trust, note: raw.note };
  return { v: raw, trust: "ok", note: null };
}

const TRUST_META = {
  nlm: { label: "NLM-ONLY", color: "var(--warn)", glyph: "◌" },
  rejected: { label: "REJECTED", color: "var(--bad)", glyph: "✕" },
  missing: { label: "MISSING", color: "var(--muted)", glyph: "·" },
};

// Small problem flag — only rendered for non-ok trust.
function Flag({ trust }) {
  const m = TRUST_META[trust];
  if (!m) return null;
  return (
    <span style={{
      fontFamily: "var(--mono)", fontSize: 9, fontWeight: 600, letterSpacing: ".04em",
      color: m.color, border: `1px solid ${m.color}`, borderRadius: 3, padding: "0 4px",
      verticalAlign: "middle", whiteSpace: "nowrap", opacity: 0.92,
    }}>{m.label}</span>
  );
}

const TONE_META = {
  cautious: { color: "var(--warn)", arrow: "▼", label: "cautious" },
  neutral: { color: "var(--muted)", arrow: "▶", label: "neutral" },
  optimistic: { color: "var(--teal)", arrow: "▲", label: "optimistic" },
  confident: { color: "var(--up)", arrow: "▲", label: "confident" },
};

function ToneBadge({ tone }) {
  const m = TONE_META[tone] || TONE_META.neutral;
  return (
    <span style={{
      fontFamily: "var(--mono)", fontSize: 10, color: m.color,
      border: `1px solid color-mix(in srgb, ${m.color} 45%, transparent)`,
      borderRadius: 3, padding: "1px 6px", whiteSpace: "nowrap",
    }}>{m.arrow} {m.label}</span>
  );
}

const SRC_COLOR = {
  RESULT: "var(--teal)", DECK: "var(--accent)", AR: "var(--up)", CONCALL: "var(--violet)",
};
function SourcePill({ type, label, page }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: "var(--mono)", fontSize: 10.5, color: "var(--muted)" }}>
      <span style={{ width: 6, height: 6, borderRadius: 1, background: SRC_COLOR[type] || "var(--muted)" }}></span>
      <span style={{ color: "var(--text-2)" }}>{label}</span>
      {page != null && <span style={{ opacity: 0.65 }}>p{page}</span>}
    </span>
  );
}

// Up/down delta in green/red.
function Delta({ dir, children }) {
  const color = dir === "up" ? "var(--up)" : dir === "down" ? "var(--bad)" : "var(--muted)";
  const arrow = dir === "up" ? "▲" : dir === "down" ? "▼" : "";
  return (
    <span style={{ color, fontFamily: "var(--mono)", fontSize: 12, fontWeight: 600 }}>{arrow} {children}</span>
  );
}

// Section eyebrow label.
function Eyebrow({ children, accent }) {
  return (
    <div style={{
      fontFamily: "var(--mono)", fontSize: 10.5, letterSpacing: ".14em", textTransform: "uppercase",
      color: accent ? "var(--accent)" : "var(--muted)", display: "flex", alignItems: "center", gap: 8,
    }}>{children}</div>
  );
}

Object.assign(window, { fmtNum, cellInfo, Flag, ToneBadge, SourcePill, Delta, Eyebrow, TRUST_META, TONE_META, SRC_COLOR });
