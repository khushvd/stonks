import type { CellFmt } from "./types";

const MONTH_IDX: Record<string, number> = {
  Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
  Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
};

/** Chronological sort key for a "Mon YYYY" screener period. Malformed input sorts to 0. */
export function periodToOrder(period: string): number {
  const [month, year] = period.split(" ");
  const y = parseInt(year, 10);
  if (Number.isNaN(y)) return 0;
  return y * 12 + (MONTH_IDX[month] ?? 0);
}

/** "Mar 2024" -> "Mar'24". Anything that doesn't match passes through unchanged. */
export function shortLabel(period: string): string {
  const [month, year] = period.split(" ");
  if (!month || !year || year.length < 4 || !(month in MONTH_IDX)) return period;
  return `${month}'${year.slice(2)}`;
}

/** A "%" unit means the matrix cell renders as a 1-decimal percent; everything else is an integer. */
export function inferFmt(unit: string | null): CellFmt {
  return unit && unit.trim() === "%" ? "pct" : "int";
}

/** "opm_pct" -> "opm pct" — a cheap human label for a snake_case metric key. */
export function humanizeKey(key: string): string {
  return key.replace(/_/g, " ").trim();
}

/** 2425 -> "₹2,425 cr" (en-IN grouping). */
export function fmtCr(value: number): string {
  return `₹${Math.round(value).toLocaleString("en-IN")} cr`;
}

/** 1.5 -> "+1.5 pts", -2 -> "-2.0 pts". */
export function fmtPctValue(delta: number): string {
  const sign = delta >= 0 ? "+" : "-";
  return `${sign}${Math.abs(delta).toFixed(1)} pts`;
}
