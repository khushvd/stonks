import type { Trust, IntegritySummary } from "../types.js";

export type Tone = "ok" | "warn" | "muted" | "bad";

export interface Badge {
  label: string;
  tone: Tone;
  color: string; // hex, consumed by TrustBadge
}

const BADGES: Record<Trust, Badge> = {
  verified: { label: "VERIFIED", tone: "ok", color: "#00cc33" },
  "notebooklm-only": { label: "NLM-ONLY", tone: "warn", color: "#ffbb33" },
  screener: { label: "SCREENER", tone: "muted", color: "#888" },
};

export function trustBadge(trust: Trust): Badge {
  return BADGES[trust];
}

export interface Chip {
  key: "verified" | "notebooklm-only" | "pending" | "rejected";
  count: number;
  tone: Tone;
}

export function integrityChips(s: IntegritySummary): Chip[] {
  return [
    { key: "verified", count: s.verified, tone: "ok" },
    { key: "notebooklm-only", count: s.notebooklmOnly, tone: "warn" },
    { key: "pending", count: s.pending, tone: "muted" },
    { key: "rejected", count: s.rejected, tone: "bad" },
  ];
}
