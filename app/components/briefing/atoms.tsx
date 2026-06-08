import type { ReactNode } from "react";
import type { Tone, SourceType } from "./types";

export const TRUST_META = {
  nlm: { label: "NLM-ONLY", color: "var(--warn)", glyph: "◌" },
  rejected: { label: "REJECTED", color: "var(--bad)", glyph: "✕" },
  missing: { label: "MISSING", color: "var(--muted)", glyph: "·" },
} as const;

export function Flag({ trust }: { trust: string }) {
  const m = (TRUST_META as Record<string, { label: string; color: string }>)[trust];
  if (!m) return null; // ok / verified is silent
  return (
    <span style={{
      fontFamily: "var(--mono)", fontSize: 9, fontWeight: 600, letterSpacing: ".04em",
      color: m.color, border: `1px solid ${m.color}`, borderRadius: 3, padding: "0 4px",
      verticalAlign: "middle", whiteSpace: "nowrap", opacity: 0.92,
    }}>{m.label}</span>
  );
}

export const TONE_META: Record<Tone, { color: string; arrow: string; label: string }> = {
  cautious: { color: "var(--warn)", arrow: "▼", label: "cautious" },
  neutral: { color: "var(--muted)", arrow: "▶", label: "neutral" },
  optimistic: { color: "var(--teal)", arrow: "▲", label: "optimistic" },
  confident: { color: "var(--up)", arrow: "▲", label: "confident" },
};

export function ToneBadge({ tone }: { tone: Tone }) {
  const m = TONE_META[tone] || TONE_META.neutral;
  return (
    <span style={{
      fontFamily: "var(--mono)", fontSize: 10, color: m.color,
      border: `1px solid color-mix(in srgb, ${m.color} 45%, transparent)`,
      borderRadius: 3, padding: "1px 6px", whiteSpace: "nowrap",
    }}>{m.arrow} {m.label}</span>
  );
}

export const SRC_COLOR: Record<SourceType, string> = {
  RESULT: "var(--teal)", DECK: "var(--accent)", AR: "var(--up)", CONCALL: "var(--violet)",
};

export function SourcePill({ type, label, page }: { type: SourceType; label: string; page?: number | null }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: "var(--mono)", fontSize: 10.5, color: "var(--muted)" }}>
      <span style={{ width: 6, height: 6, borderRadius: 1, background: SRC_COLOR[type] || "var(--muted)" }} />
      <span style={{ color: "var(--text-2)" }}>{label}</span>
      {page != null && <span style={{ opacity: 0.65 }}>p{page}</span>}
    </span>
  );
}

export function Delta({ dir, children }: { dir: "up" | "down" | "flat"; children: ReactNode }) {
  const color = dir === "up" ? "var(--up)" : dir === "down" ? "var(--bad)" : "var(--muted)";
  const arrow = dir === "up" ? "▲" : dir === "down" ? "▼" : "";
  return <span style={{ color, fontFamily: "var(--mono)", fontSize: 12, fontWeight: 600 }}>{arrow} {children}</span>;
}

export function Eyebrow({ children, accent }: { children: ReactNode; accent?: boolean }) {
  return (
    <div style={{
      fontFamily: "var(--mono)", fontSize: 10.5, letterSpacing: ".14em", textTransform: "uppercase",
      color: accent ? "var(--accent)" : "var(--muted)", display: "flex", alignItems: "center", gap: 8,
    }}>{children}</div>
  );
}
