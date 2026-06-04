import { describe, it, expect } from "vitest";
import { openDb } from "../../src/db/db.js";
import { upsertCompany } from "../../src/db/companies.js";
import { upsertNotebook, getNotebook } from "../../src/db/notebooks.js";

function setup() {
  const db = openDb(":memory:");
  const companyId = upsertCompany(db, { name: "Asian Paints", ticker: "ASIANPAINT", industry: "paints" });
  return { db, companyId };
}

describe("notebooks", () => {
  it("returns undefined when no notebook is registered", () => {
    const { db, companyId } = setup();
    expect(getNotebook(db, companyId)).toBeUndefined();
  });

  it("upserts and reads back a notebook", () => {
    const { db, companyId } = setup();
    upsertNotebook(db, companyId, "https://notebooklm.google.com/notebook/abc", "abc");
    expect(getNotebook(db, companyId)).toEqual({
      company_id: companyId,
      notebook_url: "https://notebooklm.google.com/notebook/abc",
      notebook_id: "abc",
    });
  });

  it("is idempotent — re-upsert overwrites, one row per company", () => {
    const { db, companyId } = setup();
    upsertNotebook(db, companyId, "https://old", "old");
    upsertNotebook(db, companyId, "https://new", "new");
    expect(getNotebook(db, companyId)).toEqual({ company_id: companyId, notebook_url: "https://new", notebook_id: "new" });
    const count = (db.prepare("SELECT count(*) c FROM notebooks").get() as { c: number }).c;
    expect(count).toBe(1);
  });
});
