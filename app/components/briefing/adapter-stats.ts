import type { BriefingData, Dir } from "./types";
import { fmtCr, fmtPctValue } from "./adapter-util";

type Quarter = BriefingData["quarters"][number];
type Stat = BriefingData["stats"][number];

function dirOf(delta: number): Dir {
  if (delta > 0.05) return "up";
  if (delta < -0.05) return "down";
  return "flat";
}

function pctDelta(curr: number, prior: number): { delta: string; dir: Dir } {
  if (prior === 0) return { delta: "—", dir: "flat" };
  const pct = ((curr - prior) / prior) * 100;
  return { delta: `${pct >= 0 ? "+" : "-"}${Math.abs(pct).toFixed(1)}%`, dir: dirOf(pct) };
}

/**
 * Four headline tiles from the latest quarter, YoY-compared to the quarter four positions
 * earlier (same season, prior year). Margin delta in points; the rest as percentages.
 */
export function deriveStats(quarters: Quarter[]): Stat[] {
  if (quarters.length === 0) return [];
  const latest = quarters[quarters.length - 1];
  const prior = quarters.length >= 5 ? quarters[quarters.length - 5] : null;
  const sub = prior ? `YoY, ${latest.label}` : latest.label;

  const marginTile: Stat = (() => {
    if (!prior) return { key: "EBITDA margin", value: `${latest.margin.toFixed(1)}%`, delta: "—", dir: "flat", sub };
    const d = +(latest.margin - prior.margin).toFixed(1);
    return { key: "EBITDA margin", value: `${latest.margin.toFixed(1)}%`, delta: fmtPctValue(d), dir: dirOf(d), sub };
  })();

  const moneyTile = (key: string, pick: (q: Quarter) => number): Stat => {
    const value = fmtCr(pick(latest));
    if (!prior) return { key, value, delta: "—", dir: "flat", sub };
    const { delta, dir } = pctDelta(pick(latest), pick(prior));
    return { key, value, delta, dir, sub };
  };

  return [
    marginTile,
    moneyTile("Revenue", (q) => q.rev),
    moneyTile("EBITDA", (q) => q.ebitda),
    moneyTile("PAT", (q) => q.pat),
  ];
}
