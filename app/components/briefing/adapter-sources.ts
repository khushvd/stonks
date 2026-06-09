import type { Filing } from "../../../src/types.js";
import type { BriefingData, SourceType } from "./types";

type Source = BriefingData["sources"][number];

const TYPE_MAP: Record<Filing["type"], { src: SourceType; noun: string }> = {
  presentation: { src: "DECK", noun: "Investor presentation" },
  result: { src: "RESULT", noun: "Result" },
  annual_report: { src: "AR", noun: "Annual report" },
};

/** Filings -> briefing source cards. page defaults to 1 (filings carry no page anchor). */
export function mapSources(filings: Filing[]): Source[] {
  return filings.slice(0, 8).map((f) => {
    const m = TYPE_MAP[f.type];
    const label = f.period ? `${m.noun} ${f.period}` : m.noun;
    return { type: m.src, label, page: 1 };
  });
}
