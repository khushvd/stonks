import "dotenv/config";
import { openDb } from "../db/db.js";
import { getCompany } from "../db/companies.js";
import { getLatestBrief } from "../db/briefs.js";
import { buildExpectedKpis } from "../dashboard/sector-kpis.js";
import { runPeerKpisForCompany } from "../peer-kpis/peer-kpis.js";
import { nbAsk } from "../notebooklm/cli.js";
import type { Brief } from "../synthesis/types.js";

function argValue(argv: string[], name: string): string | null {
  const idx = argv.indexOf(name);
  return idx === -1 ? null : argv[idx + 1] ?? null;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const mainCompanyName = argv[0];
  const ask = argValue(argv, "--ask");
  const companiesArg = argValue(argv, "--companies");
  if (!mainCompanyName || !companiesArg) {
    console.error('usage: pnpm peer-kpis "<Main Company>" --ask "<ask>" --companies "Main,Peer 1,Peer 2,Peer 3"');
    process.exit(1);
  }

  const db = openDb();
  const mainCompany = getCompany(db, mainCompanyName);
  if (!mainCompany) throw new Error(`Company "${mainCompanyName}" not found. Run pnpm scrape first.`);

  let briefKpis: string[] = [];
  const stored = getLatestBrief(db, mainCompany.id);
  if (stored) {
    try {
      briefKpis = (JSON.parse(stored.json) as Brief).industryKpis ?? [];
    } catch {
      briefKpis = [];
    }
  }
  const expected = buildExpectedKpis(db, { industry: mainCompany.industry, briefIndustryKpis: briefKpis });
  const companyNames = companiesArg.split(",").map((c) => c.trim()).filter(Boolean);
  const results = [];
  for (const companyName of companyNames) {
    results.push({
      company: companyName,
      kpis: await runPeerKpisForCompany(db, companyName, expected, ask, { nbAsk }),
    });
  }
  console.log(JSON.stringify({ expected, results }, null, 2));
}

await main().catch((e) => {
  console.error((e as Error).message);
  process.exit(1);
});
