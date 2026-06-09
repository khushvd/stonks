import type { ComparisonData, ComparisonCell, ComparisonMetricRow } from "../../../src/dashboard/comparison.js";
import type { Cell, MatrixRow } from "./types";
import { inferFmt } from "./adapter-util";

/** A comparison row is "the margin row" if its metric key or label points at operating margin. */
function isMarginRow(row: ComparisonMetricRow): boolean {
  return row.name === "opm_pct" || /margin/i.test(row.label);
}

/** Map one comparison cell to a briefing matrix cell, carrying trust as a flag. */
export function mapCellTrust(cell: ComparisonCell): Cell {
  switch (cell.state) {
    case "value":
      if (cell.trust === "notebooklm-only") {
        return { v: cell.value, trust: "nlm", note: "NotebookLM-only — not source-verified." };
      }
      return cell.value; // verified | screener → silent
    case "rejected":
      return { v: null, trust: "rejected", note: cell.reason ?? "Quarantined." };
    case "failed":
      return { v: null, trust: "missing", note: cell.reason ?? "Extraction failed." };
    case "missing":
    default:
      return { v: null, trust: "missing", note: cell.reason ?? "Not disclosed." };
  }
}

/**
 * Map ComparisonData into the briefing's peer columns, KPI matrix, and a sparkline-safe
 * peerMargins seed (single latest margin per peer). The orchestrator overrides the subject's
 * series with its full history. Returns empty structures when comparison is null.
 */
export function mapMatrix(
  comparison: ComparisonData | null,
  _subjectKey: string,
): { peers: string[]; matrix: MatrixRow[]; peerMargins: Record<string, number[]> } {
  if (!comparison) return { peers: [], matrix: [], peerMargins: {} };

  const peers = [...comparison.companies];
  const peerMargins: Record<string, number[]> = {};

  const matrix: MatrixRow[] = comparison.metrics.map((row) => {
    const margin = isMarginRow(row);
    const cells: Record<string, Cell> = {};
    for (const peer of peers) {
      const raw = row.cells[peer];
      cells[peer] = raw ? mapCellTrust(raw) : { v: null, trust: "missing", note: "Not disclosed." };
      if (margin) {
        const c = cells[peer];
        const v = typeof c === "number" ? c : c && typeof c === "object" ? c.v : null;
        if (v != null) peerMargins[peer] = [v];
      }
    }
    return {
      kpi: margin ? "EBITDA margin" : row.label,
      unit: row.unit ?? "",
      fmt: inferFmt(row.unit),
      spark: margin ? "margin" : null,
      cells,
    };
  });

  return { peers, matrix, peerMargins };
}
