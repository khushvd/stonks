import type { IntegritySummary } from "../../src/types.js";
import { integrityChips, type Tone } from "../../src/dashboard/trust.js";

const TONE_COLOR: Record<Tone, string> = {
  ok: "var(--ok)",
  warn: "var(--warn)",
  muted: "var(--muted)",
  bad: "var(--bad)",
};

export function IntegrityTile({ summary }: { summary: IntegritySummary }) {
  return (
    <div style={{ display: "flex", gap: 8, margin: "8px 0" }}>
      {integrityChips(summary).map((c) => (
        <div
          key={c.key}
          style={{ flex: 1, border: "1px solid var(--border)", borderRadius: 6, padding: "8px 6px", textAlign: "center" }}
        >
          <b style={{ display: "block", fontSize: 18, color: TONE_COLOR[c.tone] }}>{c.count}</b>
          <span style={{ fontSize: 11, color: "var(--muted)" }}>{c.key}</span>
        </div>
      ))}
    </div>
  );
}
