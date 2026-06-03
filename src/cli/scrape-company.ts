import "dotenv/config";
import { scrapeCompany } from "../scraper/screener.js";
import { openDb } from "../db/db.js";
import { upsertCompany } from "../db/companies.js";
import { insertFiling } from "../db/filings.js";

// Strip an optional --annual flag (include 200-300pp annual reports on request).
const rawArgs = process.argv.slice(2);
const includeAnnualReports = rawArgs.includes("--annual");
const [ticker, name] = rawArgs.filter((a) => a !== "--annual");
if (!ticker) {
  console.error('usage: pnpm scrape <TICKER> [display name] [--annual]');
  process.exit(1);
}

const db = openDb();
const companyId = upsertCompany(db, { name: name ?? ticker, ticker, industry: null });
const { links } = await scrapeCompany(ticker, { includeAnnualReports });
const filings = links.map((l) => ({
  filing_id: insertFiling(db, {
    company_id: companyId, type: l.type, period: l.period,
    source_url: l.url, local_path: l.local_path,
  }),
  ...l,
}));
console.log(JSON.stringify({ companyId, filings }, null, 2));
