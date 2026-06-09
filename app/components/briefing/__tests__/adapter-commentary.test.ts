import { describe, it, expect } from "vitest";
import { mapCommentary } from "../adapter-commentary";
import type { CommentaryTrend } from "../../../../src/db/commentary-trends.js";

const trends: CommentaryTrend[] = [
  { period: "Q3 FY25", summary: "Record quarter.", tone: "confident", keyTopics: ["record", "pipeline"], contradictionNote: null },
  { period: "Q4 FY25", summary: "Softer read.", tone: "cautious", keyTopics: ["supply"], contradictionNote: "Contradicts Q3." },
];

describe("mapCommentary", () => {
  it("renames keyTopics->topics and contradictionNote->flag", () => {
    expect(mapCommentary(trends)).toEqual([
      { period: "Q3 FY25", tone: "confident", summary: "Record quarter.", topics: ["record", "pipeline"], flag: null },
      { period: "Q4 FY25", tone: "cautious", summary: "Softer read.", topics: ["supply"], flag: "Contradicts Q3." },
    ]);
  });
  it("returns an empty array for no commentary", () => {
    expect(mapCommentary([])).toEqual([]);
  });
});
