import type { CommentaryTrend } from "../../../src/db/commentary-trends.js";
import type { BriefingData } from "./types";

type Commentary = BriefingData["commentary"][number];

/** CommentaryTrend -> briefing commentary. Tone unions are identical, so this is a field rename. */
export function mapCommentary(trends: CommentaryTrend[]): Commentary[] {
  return trends.map((t) => ({
    period: t.period,
    tone: t.tone,
    summary: t.summary,
    topics: t.keyTopics,
    flag: t.contradictionNote,
  }));
}
