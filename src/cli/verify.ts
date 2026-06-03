import "dotenv/config";
import { openDb } from "../db/db.js";
import { getCompany } from "../db/companies.js";
import { integritySummary } from "../db/metrics.js";
import { verifyPending } from "../verifier/verify.js";

// usage: pnpm verify "<Company Name>"
const name = process.argv[2];
if (!name) {
  console.error('usage: pnpm verify "<Company Name>"');
  process.exit(1);
}
const db = openDb();
const company = getCompany(db, name);
if (!company) {
  console.error(`Company "${name}" not found.`);
  process.exit(1);
}
const outcomes = await verifyPending(db, company.id);
console.log(JSON.stringify({ outcomes, summary: integritySummary(db) }, null, 2));
