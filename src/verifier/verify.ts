import type Database from "better-sqlite3";
import type { PageText, StagedMetric } from "../types.js";
import { listStaging, promoteMetric, rejectMetric } from "../db/metrics.js";
import { getFilingBySourceId } from "../db/filings.js";
import { matchMetric } from "./match.js";
import { extractPageText } from "../pdf/extract-text.js";

export interface VerifyOutcome {
  staging_id: number;
  name: string;
  decision: "verified" | "notebooklm-only" | "reject";
  source_page: number | null;
}

type PageLoader = (localPath: string) => Promise<PageText[]>;

// Deterministic integrity gate. Runs in TS, never in an LLM context — verification is token-free.
// companyId scopes which pending metrics to verify; loadPages is injectable for tests.
// Page selection: a staged metric carrying notebooklm_source_id is checked ONLY against that
// source's filing PDF; otherwise it is checked against ALL of the company's PDFs (back-compat).
export async function verifyPending(
  db: Database.Database,
  companyId: number,
  loadPages: PageLoader = extractPageText,
): Promise<VerifyOutcome[]> {
  const companyFilings = db
    .prepare("SELECT id, local_path FROM filings WHERE company_id = ?")
    .all(companyId) as { id: number; local_path: string | null }[];
  const filingIds = new Set(companyFilings.map((f) => f.id));
  const pending = listStaging(db, "pending").filter((m) => filingIds.has(m.filing_id));

  const pageCache = new Map<string, PageText[]>(); // keyed by local_path
  async function pagesFor(localPath: string | null): Promise<PageText[]> {
    if (!localPath) return [];
    let p = pageCache.get(localPath);
    if (!p) {
      p = await loadPages(localPath);
      pageCache.set(localPath, p);
    }
    return p;
  }

  const setSourcePage = db.prepare("UPDATE metrics_staging SET source_page = ? WHERE id = ?");
  const outcomes: VerifyOutcome[] = [];

  for (const m of pending as StagedMetric[]) {
    let pages: PageText[];
    if (m.notebooklm_source_id) {
      const filing = getFilingBySourceId(db, companyId, m.notebooklm_source_id);
      pages = await pagesFor(filing?.local_path ?? null);
    } else {
      pages = [];
      for (const f of companyFilings) pages.push(...(await pagesFor(f.local_path)));
    }

    const res = matchMetric({ value: m.value, excerpt: m.excerpt }, pages);
    if (res.decision === "reject") {
      const reason = pages.length === 0
        ? "source PDF not downloaded (local_path missing)"
        : "value and excerpt not found in source PDF";
      rejectMetric(db, m.id, reason);
    } else {
      setSourcePage.run(res.source_page, m.id);
      promoteMetric(db, m.id, res.decision);
    }
    outcomes.push({ staging_id: m.id, name: m.name, decision: res.decision, source_page: res.source_page });
  }
  return outcomes;
}
