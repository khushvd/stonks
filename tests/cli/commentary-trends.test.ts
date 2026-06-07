import { describe, it, expect } from "vitest";
import { openDb } from "../../src/db/db.js";
import { upsertCompany } from "../../src/db/companies.js";
import { upsertNotebook } from "../../src/db/notebooks.js";
import { getCommentaryTrends } from "../../src/db/commentary-trends.js";
import { runCommentaryTrends } from "../../src/cli/commentary-trends.js";

function seed() {
  const db = openDb(":memory:");
  const companyId = upsertCompany(db, { name: "Acme", ticker: null, industry: "Paints" });
  upsertNotebook(db, companyId, "url", "nb-1");
  return { db, companyId };
}

const fakeNbAsk = async (_nb: string, _q: string) => ({
  answer: JSON.stringify([
    { period: "Q1 FY24", summary: "Cautious on margins.", tone: "cautious", keyTopics: ["margins"], contradictionNote: null },
    { period: "Q2 FY24", summary: "RM stabilising.", tone: "neutral", keyTopics: ["raw materials"], contradictionNote: null },
    { period: "Q3 FY24", summary: "Recovery on track.", tone: "optimistic", keyTopics: ["margins", "volume"], contradictionNote: null },
    { period: "Q4 FY24", summary: "Best margins restored.", tone: "confident", keyTopics: ["margins", "competition"], contradictionNote: "Competition flagged in Q4 after dismissive Q3 stance." },
  ]),
  references: [],
});

describe("runCommentaryTrends", () => {
  it("inserts 4 rows oldest→newest and returns them", async () => {
    const { db, companyId } = seed();
    const trends = await runCommentaryTrends(db, "Acme", { nbAsk: fakeNbAsk });
    expect(trends).toHaveLength(4);
    expect(trends[0].period).toBe("Q1 FY24");
    expect(trends[3].tone).toBe("confident");
    expect(trends[3].contradictionNote).toMatch(/Competition/);
    const stored = getCommentaryTrends(db, companyId);
    expect(stored).toHaveLength(4);
    expect(stored[0].keyTopics).toEqual(["margins"]);
  });

  it("replaces previous rows on re-run", async () => {
    const { db, companyId } = seed();
    await runCommentaryTrends(db, "Acme", { nbAsk: fakeNbAsk });
    await runCommentaryTrends(db, "Acme", { nbAsk: fakeNbAsk });
    expect(getCommentaryTrends(db, companyId)).toHaveLength(4);
  });

  it("throws a clear error if the company has no notebook", async () => {
    const db = openDb(":memory:");
    upsertCompany(db, { name: "NoNb", ticker: null, industry: null });
    await expect(runCommentaryTrends(db, "NoNb", { nbAsk: fakeNbAsk })).rejects.toThrow(/notebook/i);
  });

  it("handles NLM answer wrapped in a fenced code block", async () => {
    const { db } = seed();
    const wrapped = async (_nb: string, _q: string) => ({
      answer: "```json\n" + JSON.stringify([
        { period: "Q1 FY24", summary: "ok", tone: "neutral", keyTopics: ["a"], contradictionNote: null },
      ]) + "\n```",
      references: [],
    });
    const trends = await runCommentaryTrends(db, "Acme", { nbAsk: wrapped });
    expect(trends).toHaveLength(1);
  });
});
