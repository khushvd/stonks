import type { Cell, CellFmt, Trust } from "./types";

export function fmtNum(v: number | null, fmt: CellFmt): string {
  if (v == null) return "—";
  if (fmt === "pct") return v.toFixed(1);
  return v.toLocaleString("en-IN");
}

export function cellInfo(raw: Cell): { v: number | null; trust: Trust; note: string | null } {
  if (raw && typeof raw === "object") return { v: raw.v, trust: raw.trust, note: raw.note };
  return { v: raw as number | null, trust: "ok", note: null };
}
