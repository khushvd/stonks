import type { Badge } from "../../src/dashboard/trust.js";

export function TrustBadge({ badge }: { badge: Badge }) {
  return (
    <span
      style={{
        background: badge.color,
        color: "#0d0d0f",
        borderRadius: 3,
        padding: "1px 6px",
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: 0.3,
      }}
    >
      {badge.label}
    </span>
  );
}
