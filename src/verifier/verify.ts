import type Database from "better-sqlite3";
import type { PageText, StagedMetric } from "../types.js";
import { listStaging, promoteMetric, rejectMetric } from "../db/metrics.js";
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
export async function verifyPending(
  db: Database.Database,
  companyId: number,
  loadPages: PageLoader = extractPageText,
): Promise<VerifyOutcome[]> {
  const filingIds = new Set(
    (db.prepare("SELECT id FROM filings WHERE company_id = ?").all(companyId) as { id: number }[]).map((r) => r.id),
  );
  const pending = listStaging(db, "pending").filter((m) => filingIds.has(m.filing_id));
  const pageCache = new Map<number, PageText[]>();
  const setSourcePage = db.prepare("UPDATE metrics_staging SET source_page = ? WHERE id = ?");
  const outcomes: VerifyOutcome[] = [];

  for (const m of pending as StagedMetric[]) {
    let pages = pageCache.get(m.filing_id);
    if (!pages) {
      const row = db.prepare("SELECT local_path FROM filings WHERE id = ?").get(m.filing_id) as { local_path: string | null } | undefined;
      pages = row?.local_path ? await loadPages(row.local_path) : [];
      pageCache.set(m.filing_id, pages);
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
