export type Trust = "ok" | "nlm" | "rejected" | "missing";
export type Tone = "cautious" | "neutral" | "optimistic" | "confident";
export type SourceType = "RESULT" | "DECK" | "AR" | "CONCALL";
export type Dir = "up" | "down" | "flat";
export type CellFmt = "pct" | "int";

/** A matrix cell: a bare number (verified/silent) OR a flagged object. null = no value. */
export type Cell =
  | number
  | null
  | { v: number | null; trust: Exclude<Trust, "ok">; note: string };

export interface MatrixRow {
  kpi: string;
  unit: string;
  fmt: CellFmt;
  spark: string | null; // peerMargins key, or null
  cells: Record<string, Cell>;
}

export interface BriefingData {
  company: { name: string; ticker: string; industry: string; sector: string; asOf: string };
  ask: string;
  about: string;
  bottomLine: { worth: string; watch: string };
  brief: {
    headline: string;
    answer: string[];
    drivers: { text: string; metric: string | null }[];
    guidance: { text: string; metric: string | null }[];
    risks: { text: string; tone: Tone }[];
  };
  quarters: { period: string; label: string; margin: number; rev: number; ebitda: number; pat: number }[];
  stats: { key: string; value: string; delta: string; dir: Dir; sub: string }[];
  peers: string[];
  matrix: MatrixRow[];
  peerMargins: Record<string, number[]>;
  commentary: { period: string; tone: Tone; summary: string; topics: string[]; flag: string | null }[];
  sources: { type: SourceType; label: string; page: number }[];
  integrity: { verified: number; nlmOnly: number; pending: number; rejected: number };
}
