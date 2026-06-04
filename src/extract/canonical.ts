// Universal base metrics — always asked for every company. Stable, comparable dashboard columns.
// Locked in the Phase 2a spec (2026-06-03).
export const UNIVERSAL_BASE: { metric_key: string; label: string }[] = [
  { metric_key: "revenue", label: "Revenue" },
  { metric_key: "pat", label: "Profit After Tax" },
  { metric_key: "ebitda", label: "EBITDA" },
  { metric_key: "ebitda_margin", label: "EBITDA Margin" },
  { metric_key: "eps", label: "Earnings Per Share" },
  { metric_key: "total_debt", label: "Total Debt" },
  { metric_key: "pat_margin", label: "PAT Margin" },
  { metric_key: "debt_equity", label: "Debt / Equity" },
  { metric_key: "market_cap", label: "Market Capitalisation" },
  { metric_key: "ev_ebitda", label: "EV / EBITDA" },
  { metric_key: "ev", label: "Enterprise Value" },
];
