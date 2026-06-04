import { describe, it, expect } from "vitest";
import { openDb } from "../../src/db/db.js";
import { upsertCompany } from "../../src/db/companies.js";
import { saveBrief, getLatestBrief } from "../../src/db/briefs.js";

function seed() {
  const db = openDb(":memory:");
  const companyId = upsertCompany(db, { name: "Acme", ticker: null, industry: null });
  return { db, companyId };
}

describe("briefs persistence", () => {
  it("returns null when no brief exists", () => {
    const { db, companyId } = seed();
    expect(getLatestBrief(db, companyId)).toBeNull();
  });

  it("saves and reads back the latest brief json", () => {
    const { db, companyId } = seed();
    saveBrief(db, companyId, "how are margins?", '{"claims":[]}');
    saveBrief(db, companyId, "and debt?", '{"claims":[{"text":"x"}]}');
    const latest = getLatestBrief(db, companyId);
    expect(latest).toEqual({ ask: "and debt?", json: '{"claims":[{"text":"x"}]}' });
  });
});
