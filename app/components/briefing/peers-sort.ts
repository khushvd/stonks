import { cellInfo } from "./format";
import type { MatrixRow } from "./types";

/** Sort peer column keys descending by a KPI row's values; nulls/missing last. null row = identity. */
export function sortPeers(peers: string[], row: MatrixRow | null): string[] {
  if (!row) return [...peers];
  return [...peers].sort((a, b) => {
    const va = cellInfo(row.cells[a]).v;
    const vb = cellInfo(row.cells[b]).v;
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    return vb - va;
  });
}
