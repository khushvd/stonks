import "dotenv/config";
import { basename } from "node:path";
import type Database from "better-sqlite3";
import { openDb } from "../db/db.js";
import { getCompany } from "../db/companies.js";
import { listFilings, setFilingSourceId } from "../db/filings.js";
import { getNotebook, upsertNotebook } from "../db/notebooks.js";
import { nbList, nbCreate, nbSourceAdd, nbSourceWait, nbSourceList } from "../notebooklm/cli.js";

export interface IngestDeps {
  nbList: typeof nbList;
  nbCreate: typeof nbCreate;
  nbSourceAdd: typeof nbSourceAdd;
  nbSourceWait: typeof nbSourceWait;
  nbSourceList: typeof nbSourceList;
}

export interface IngestSummary {
  notebook_id: string;
  added: { filing_id: number; source_id: string }[];
  skipped: { filing_id: number; source_id: string }[];
  failed: { filing_id: number; error: string }[];
  adopted: { filing_id: number; source_id: string }[];
}

export async function runIngest(db: Database.Database, companyName: string, deps: IngestDeps): Promise<IngestSummary> {
  // 1. Auth precheck.
  try {
    await deps.nbList();
  } catch {
    throw new Error("NotebookLM not authenticated — run `notebooklm login` once.");
  }

  // 2. Company.
  const company = getCompany(db, companyName);
  if (!company) throw new Error(`Company "${companyName}" not found. Run pnpm scrape first.`);

  // 3. Notebook: reuse or create.
  const existing = getNotebook(db, company.id);
  let notebookId = existing?.notebook_id ?? null;
  if (!notebookId) {
    notebookId = (await deps.nbCreate(company.name)).id;
    upsertNotebook(db, company.id, `https://notebooklm.google.com/notebook/${notebookId}`, notebookId);
  }

  // Adopt sources already present in the notebook (e.g. populated outside this DB) by filename.
  let existingByTitle = new Map<string, string>();
  try {
    for (const s of await deps.nbSourceList(notebookId)) existingByTitle.set(s.title, s.id);
  } catch {
    existingByTitle = new Map();
  }

  // 4. Per filing with a local PDF and no source id yet.
  const summary: IngestSummary = { notebook_id: notebookId, added: [], skipped: [], failed: [], adopted: [] };
  for (const f of listFilings(db, company.id)) {
    if (!f.local_path) continue;
    if (f.notebooklm_source_id) {
      summary.skipped.push({ filing_id: f.id, source_id: f.notebooklm_source_id });
      continue;
    }
    const match = existingByTitle.get(basename(f.local_path));
    if (match) {
      setFilingSourceId(db, f.id, match);
      summary.adopted.push({ filing_id: f.id, source_id: match });
      continue;
    }
    try {
      const src = await deps.nbSourceAdd(notebookId, f.local_path);
      setFilingSourceId(db, f.id, src.id);
      await deps.nbSourceWait(notebookId, src.id);
      summary.added.push({ filing_id: f.id, source_id: src.id });
    } catch (e) {
      summary.failed.push({ filing_id: f.id, error: (e as Error).message });
    }
  }
  return summary;
}

// CLI entrypoint: `pnpm ingest "<Company Name>"`. Skipped when imported by tests.
async function main(): Promise<void> {
  const name = process.argv[2];
  if (!name) {
    console.error('usage: pnpm ingest "<Company Name>"');
    process.exit(1);
  }
  const db = openDb();
  try {
    const summary = await runIngest(db, name, { nbList, nbCreate, nbSourceAdd, nbSourceWait, nbSourceList });
    console.log(JSON.stringify(summary, null, 2));
    if (summary.failed.length > 0) process.exit(1);
  } catch (e) {
    console.error((e as Error).message);
    process.exit(1);
  }
}

// Run only when invoked directly (not when imported by a test).
if (process.argv[1] && process.argv[1].endsWith("ingest.ts")) {
  await main();
}
