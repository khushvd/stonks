import "dotenv/config";
import { openDb } from "../db/db.js";
import { getCompany } from "../db/companies.js";
import { listFilings } from "../db/filings.js";
import { getNotebook } from "../db/notebooks.js";

// usage: pnpm ingest "<Company Name>"
const name = process.argv[2];
if (!name) {
  console.error('usage: pnpm ingest "<Company Name>"');
  process.exit(1);
}

const db = openDb();
const company = getCompany(db, name);
if (!company) {
  console.error(`Company "${name}" not found. Run pnpm scrape first.`);
  process.exit(1);
}

const filings = listFilings(db, company.id);
const withUrls = filings.filter((f) => f.source_url);
console.log(JSON.stringify({
  company: { id: company.id, name: company.name, ticker: company.ticker, industry: company.industry },
  notebook: getNotebook(db, company.id) ?? null,
  // The agent feeds each source_url to NotebookLM add_source (type=url).
  sources: withUrls.map((f) => ({ filing_id: f.id, type: f.type, period: f.period, source_url: f.source_url })),
  missingUrlCount: filings.length - withUrls.length,
}, null, 2));
