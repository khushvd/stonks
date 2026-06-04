import "dotenv/config";
import type Database from "better-sqlite3";
import { openDb } from "../db/db.js";
import { getCompany } from "../db/companies.js";
import { getNotebook } from "../db/notebooks.js";
import { saveBrief } from "../db/briefs.js";
import { nbAsk } from "../notebooklm/cli.js";
import { buildSynthesisPrompt } from "../synthesis/prompt.js";
import { parseBrief } from "../synthesis/brief.js";
import { stageBriefMetrics } from "../synthesis/stage.js";
import { setIndustryMetrics, getIndustryMetrics } from "../db/industry-metrics.js";
import type { Brief } from "../synthesis/types.js";

export interface SynthesisDeps {
  nbAsk: typeof nbAsk;
}

export async function runSynthesis(
  db: Database.Database,
  companyName: string,
  ask: string | null,
  deps: SynthesisDeps,
): Promise<Brief> {
  const company = getCompany(db, companyName);
  if (!company) throw new Error(`Company "${companyName}" not found. Run pnpm scrape first.`);
  const notebook = getNotebook(db, company.id);
  if (!notebook?.notebook_id) throw new Error(`No NotebookLM notebook for "${companyName}". Run pnpm ingest first.`);

  // Load known industry KPIs from cache to prime the prompt.
  const knownKpis = company.industry
    ? getIndustryMetrics(db, company.industry).map((m) => m.metric_key)
    : [];
  const question = buildSynthesisPrompt(company.name, ask, company.industry, knownKpis);
  const { answer, references } = await deps.nbAsk(notebook.notebook_id, question);
  const brief = parseBrief(answer, references, ask);

  stageBriefMetrics(db, company.id, brief);
  saveBrief(db, company.id, ask, JSON.stringify(brief));

  // Cache the industry KPIs discovered by NotebookLM into the industry_metrics table,
  // so future runs can surface which metrics matter for this sector.
  if (company.industry && brief.industryKpis.length > 0) {
    setIndustryMetrics(
      db,
      company.industry,
      brief.industryKpis.map((kpi) => ({ metric_key: kpi, label: kpi })),
      "notebooklm",
    );
  }

  return brief;
}

// CLI: pnpm synthesize "<Company Name>" "<ask>"
function main(): void {
  const name = process.argv[2];
  const ask = process.argv[3] ?? null;
  if (!name) {
    console.error('usage: pnpm synthesize "<Company Name>" "<ask>"');
    process.exit(1);
  }
  const db = openDb();
  runSynthesis(db, name, ask, { nbAsk })
    .then((brief) => console.log(JSON.stringify(brief, null, 2)))
    .catch((e) => {
      console.error((e as Error).message);
      process.exit(1);
    });
}

if (process.argv[1] && process.argv[1].endsWith("synthesize.ts")) {
  main();
}
