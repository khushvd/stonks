import "dotenv/config";
import type Database from "better-sqlite3";
import { openDb } from "../db/db.js";
import { getCompany } from "../db/companies.js";
import { listFilings } from "../db/filings.js";
import { getNotebook } from "../db/notebooks.js";
import { getIndustryMetrics } from "../db/industry-metrics.js";
import { UNIVERSAL_BASE } from "../extract/canonical.js";

export function buildExtractPayload(db: Database.Database, name: string, ask: string | null) {
  const company = getCompany(db, name);
  if (!company) throw new Error(`Company "${name}" not found. Run pnpm scrape first.`);

  const industry = company.industry;
  const industryMetrics = industry ? getIndustryMetrics(db, industry) : [];

  return {
    company: { id: company.id, name: company.name, ticker: company.ticker, industry },
    notebook: getNotebook(db, company.id) ?? null,
    // listFilings returns full rows, so notebooklm_source_id rides along for citation->filing mapping.
    filings: listFilings(db, company.id),
    metrics: {
      universal: UNIVERSAL_BASE,
      industry: industryMetrics.map((m) => ({ metric_key: m.metric_key, label: m.label })),
      needsIndustryInference: industry !== null && industryMetrics.length === 0,
    },
    ask,
  };
}

// CLI: pnpm extract "<Company Name>" [--ask "free text request"]
function main(): void {
  const raw = process.argv.slice(2);
  const askIdx = raw.indexOf("--ask");
  const ask = askIdx >= 0 ? raw[askIdx + 1] ?? "" : null;
  const name = askIdx >= 0 ? raw.filter((_, i) => i !== askIdx && i !== askIdx + 1)[0] : raw[0];
  if (!name) {
    console.error('usage: pnpm extract "<Company Name>" [--ask "free text"]');
    process.exit(1);
  }
  const db = openDb();
  try {
    console.log(JSON.stringify(buildExtractPayload(db, name, ask), null, 2));
  } catch (e) {
    console.error((e as Error).message);
    process.exit(1);
  }
}

if (process.argv[1] && process.argv[1].endsWith("extract.ts")) {
  main();
}
