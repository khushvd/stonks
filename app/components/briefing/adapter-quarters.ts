import type { TrendSeries } from "../../../src/dashboard/data.js";
import type { BriefingData } from "./types";
import { periodToOrder, shortLabel } from "./adapter-util";

type Quarter = BriefingData["quarters"][number];

/** Build a {period}->value lookup for one named series (empty map if absent). */
function seriesMap(trends: TrendSeries[], name: string): Map<string, number> {
  const s = trends.find((t) => t.name === name);
  return new Map((s?.points ?? []).map((p) => [p.period, p.value]));
}

/**
 * Zip the revenue/ebitda/opm_pct/pat trend series into one quarter row per period,
 * chronologically, capped at the last 8. Missing values default to 0.
 */
export function deriveQuarters(trends: TrendSeries[]): Quarter[] {
  if (trends.length === 0) return [];
  const rev = seriesMap(trends, "revenue");
  const ebitda = seriesMap(trends, "ebitda");
  const margin = seriesMap(trends, "opm_pct");
  const pat = seriesMap(trends, "pat");

  const periods = Array.from(new Set([...rev.keys(), ...ebitda.keys(), ...margin.keys(), ...pat.keys()]))
    .sort((a, b) => periodToOrder(a) - periodToOrder(b));

  const rows: Quarter[] = periods.map((period) => ({
    period,
    label: shortLabel(period),
    margin: margin.get(period) ?? 0,
    rev: rev.get(period) ?? 0,
    ebitda: ebitda.get(period) ?? 0,
    pat: pat.get(period) ?? 0,
  }));

  return rows.slice(-8);
}
