import "dotenv/config";
import { scrapeCompany } from "../scraper/screener.js";
import { openDb } from "../db/db.js";
import { upsertCompany } from "../db/companies.js";
import { insertFiling } from "../db/filings.js";
import { insertScreenerMetric } from "../db/metrics.js";
import { parseFinancials } from "../scraper/parse-financials.js";
import { parseScrapeArgs } from "../scraper/company-resolver.js";

let parsed;
try {
  parsed = parseScrapeArgs(process.argv.slice(2));
} catch (e) {
  console.error((e as Error).message);
  console.error('usage: pnpm scrape --name "<Company Name>" [--slug SCREENER] [--annual] [--per-type N]');
  process.exit(1);
}
const { company, includeAnnualReports, perType } = parsed;

const db = openDb();
const companyId = upsertCompany(db, { name: company.name, ticker: company.slug, industry: null });
const { links, html } = await scrapeCompany(company.slug, { includeAnnualReports, perType });
const filings = links.map((l) => ({
  filing_id: insertFiling(db, {
    company_id: companyId, type: l.type, period: l.period,
    source_url: l.url, local_path: l.local_path,
  }),
  ...l,
}));

// Parse and store screener financial table data (trust='screener', deterministic source — no PDF gate).
let screenerMetricsStored = 0;
for (const mode of ["quarterly", "annual"] as const) {
  const rows = parseFinancials(html, mode);
  for (const row of rows) {
    try {
      insertScreenerMetric(db, {
        company_id: companyId,
        name: row.metric_key,
        value: row.value,
        unit: row.unit,
        period: row.period,
        source_url: `https://www.screener.in/company/${company.slug}/consolidated/`,
      });
      screenerMetricsStored++;
    } catch {
      // Duplicate or constraint error — skip silently
    }
  }
}

console.log(JSON.stringify({ companyId, filings, screenerMetricsStored }, null, 2));
