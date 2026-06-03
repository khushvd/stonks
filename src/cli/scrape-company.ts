import "dotenv/config";
import { scrapeCompany } from "../scraper/screener.js";
import { openDb } from "../db/db.js";
import { upsertCompany } from "../db/companies.js";
import { insertFiling } from "../db/filings.js";

const [, , ticker, name] = process.argv;
if (!ticker) {
  console.error('usage: pnpm scrape <TICKER> [display name]');
  process.exit(1);
}

const db = openDb();
const companyId = upsertCompany(db, { name: name ?? ticker, ticker, industry: null });
const { links } = await scrapeCompany(ticker);
const filings = links.map((l) => ({
  filing_id: insertFiling(db, {
    company_id: companyId, type: l.type, period: l.period,
    source_url: l.url, local_path: l.local_path,
  }),
  ...l,
}));
console.log(JSON.stringify({ companyId, filings }, null, 2));
