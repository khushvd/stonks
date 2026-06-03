import "dotenv/config";
import { openDb } from "../db/db.js";
import { getCompany } from "../db/companies.js";
import { listFilings } from "../db/filings.js";
import { getNotebook } from "../db/notebooks.js";
import { getIndustryMetrics } from "../db/industry-metrics.js";
import { UNIVERSAL_BASE } from "../extract/canonical.js";

// usage: pnpm extract "<Company Name>" [--ask "free text request"]
const raw = process.argv.slice(2);
const askIdx = raw.indexOf("--ask");
const ask = askIdx >= 0 ? raw[askIdx + 1] ?? "" : null;
const name = askIdx >= 0
  ? raw.filter((_, i) => i !== askIdx && i !== askIdx + 1)[0]
  : raw[0];
if (!name) {
  console.error('usage: pnpm extract "<Company Name>" [--ask "free text"]');
  process.exit(1);
}

const db = openDb();
const company = getCompany(db, name);
if (!company) {
  console.error(`Company "${name}" not found. Run pnpm scrape first.`);
  process.exit(1);
}

const notebook = getNotebook(db, company.id);
const industry = company.industry;
const industryMetrics = industry ? getIndustryMetrics(db, industry) : [];

console.log(JSON.stringify({
  company: { id: company.id, name: company.name, ticker: company.ticker, industry },
  notebook: notebook ?? null,
  filings: listFilings(db, company.id),
  metrics: {
    universal: UNIVERSAL_BASE,
    industry: industryMetrics.map((m) => ({ metric_key: m.metric_key, label: m.label })),
    // When industry metrics are empty, the extractor agent must ask NotebookLM to infer them,
    // then persist via: pnpm db set-industry-metrics <industry> notebooklm '<json>'.
    needsIndustryInference: industry !== null && industryMetrics.length === 0,
  },
  ask,
}, null, 2));
