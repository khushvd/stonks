import { describe, it, expect } from "vitest";
import { openDb } from "../../src/db/db.js";
import { upsertCompany } from "../../src/db/companies.js";
import { insertFiling, listFilings } from "../../src/db/filings.js";
import { getNotebook, upsertNotebook } from "../../src/db/notebooks.js";
import { runIngest, type IngestDeps } from "../../src/cli/ingest.js";

function setup() {
  const db = openDb(":memory:");
  const companyId = upsertCompany(db, { name: "Asian Paints", ticker: "ASIANPAINT", industry: "paints" });
  insertFiling(db, { company_id: companyId, type: "result", period: "Q4FY26", source_url: "u1", local_path: "/a.pdf" });
  insertFiling(db, { company_id: companyId, type: "presentation", period: "Q4FY26", source_url: "u2", local_path: "/b.pdf" });
  return { db, companyId };
}

function makeDeps() {
  const calls = {
    create: 0,
    add: [] as string[],
    wait: [] as string[],
    sources: [] as { id: string; title: string; status: string }[],
  };
  let n = 0;
  const deps: IngestDeps = {
    nbList: async () => ({ notebooks: [] }),
    nbCreate: async () => { calls.create++; return { id: "nb-123" }; },
    nbSourceAdd: async (_nb, filePath) => { calls.add.push(filePath); return { id: `src-${++n}`, title: filePath }; },
    nbSourceWait: async (_nb, sid) => { calls.wait.push(sid); },
    nbSourceList: async () => calls.sources,
  };
  return { deps, calls };
}

describe("runIngest", () => {
  it("creates a notebook once, uploads each unmapped filing, and persists source ids", async () => {
    const { db, companyId } = setup();
    const { deps, calls } = makeDeps();
    const summary = await runIngest(db, "Asian Paints", deps);

    expect(calls.create).toBe(1);
    expect(calls.add).toEqual(["/a.pdf", "/b.pdf"]);
    expect(summary.notebook_id).toBe("nb-123");
    expect(summary.added).toHaveLength(2);
    expect(summary.failed).toHaveLength(0);
    expect(getNotebook(db, companyId)?.notebook_id).toBe("nb-123");
    expect(listFilings(db, companyId).map((f) => f.notebooklm_source_id)).toEqual(["src-1", "src-2"]);
  });

  it("is idempotent — a second run reuses the notebook and re-adds nothing", async () => {
    const { db } = setup();
    const first = makeDeps();
    await runIngest(db, "Asian Paints", first.deps);

    const second = makeDeps();
    const summary = await runIngest(db, "Asian Paints", second.deps);
    expect(second.calls.create).toBe(0);
    expect(second.calls.add).toEqual([]);
    expect(summary.added).toHaveLength(0);
    expect(summary.skipped).toHaveLength(2);
  });

  it("throws a friendly auth error when nbList fails", async () => {
    const { db } = setup();
    const { deps } = makeDeps();
    deps.nbList = async () => { throw new Error("boom"); };
    await expect(runIngest(db, "Asian Paints", deps)).rejects.toThrow(/notebooklm login/);
  });

  it("throws when the company is unknown", async () => {
    const { db } = setup();
    const { deps } = makeDeps();
    await expect(runIngest(db, "Nonexistent Co", deps)).rejects.toThrow(/not found/i);
  });

  it("adopts a pre-existing notebook source by filename instead of re-uploading", async () => {
    const { db, companyId } = setup();
    const { deps, calls } = makeDeps();
    // Pre-seed a notebook so it is reused, and a source whose title matches filing /a.pdf's basename.
    upsertNotebook(db, companyId, "https://nb", "nb-123");
    calls.sources = [{ id: "existing-a", title: "a.pdf", status: "ready" }];

    const summary = await runIngest(db, "Asian Paints", deps);

    expect(calls.add).toEqual(["/b.pdf"]); // only the unmatched filing is uploaded
    expect(summary.adopted).toEqual([{ filing_id: expect.any(Number), source_id: "existing-a" }]);
    expect(summary.added).toHaveLength(1);
    const ids = listFilings(db, companyId).map((f) => f.notebooklm_source_id);
    expect(ids).toContain("existing-a");
  });

  it("still uploads when no notebook source title matches", async () => {
    const { db } = setup();
    const { deps, calls } = makeDeps();
    calls.sources = [{ id: "unrelated", title: "something-else.pdf", status: "ready" }];
    const summary = await runIngest(db, "Asian Paints", deps);
    expect(calls.add).toEqual(["/a.pdf", "/b.pdf"]);
    expect(summary.adopted).toEqual([]);
  });
});
