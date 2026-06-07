import "dotenv/config";
import type Database from "better-sqlite3";
import { openDb } from "../db/db.js";
import { getCompany } from "../db/companies.js";
import { getNotebook } from "../db/notebooks.js";
import { nbAsk } from "../notebooklm/cli.js";
import { insertCommentaryTrends, type CommentaryTrend, type CommentaryTone } from "../db/commentary-trends.js";

const COMMENTARY_PROMPT = `For each of the last 4 quarterly concall or results documents in this notebook (oldest to newest), provide a JSON array where each element contains:
- "period": the quarter label (e.g. "Q3 FY24")
- "summary": 2-3 sentences summarising management's key messages
- "tone": one of "cautious", "neutral", "optimistic", "confident"
- "keyTopics": an array of 3-5 short topic tags that management emphasised (e.g. "margins", "rural demand", "competition", "capex guidance")
- "contradictionNote": a sentence describing any contradiction or notable shift from the prior quarter's stated position, or null if none.
Return only the JSON array, no prose.`;

const VALID_TONES = new Set<string>(["cautious", "neutral", "optimistic", "confident"]);

function parseResponse(answer: string): CommentaryTrend[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(answer);
  } catch {
    const fence = answer.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fence) {
      try {
        parsed = JSON.parse(fence[1]);
      } catch { /* fall through */ }
    }
    if (!parsed) {
      const arr = answer.match(/\[[\s\S]*\]/);
      if (arr) {
        try {
          parsed = JSON.parse(arr[0]);
        } catch { /* fall through */ }
      }
    }
  }
  if (!Array.isArray(parsed)) {
    throw new Error(`Could not parse CommentaryTrend[] from NLM answer: ${answer.slice(0, 300)}`);
  }
  return (parsed as unknown[]).map((item, i) => {
    if (typeof item !== "object" || item === null) throw new Error(`Item ${i} is not an object`);
    const r = item as Record<string, unknown>;
    const tone = String(r.tone ?? "");
    if (!VALID_TONES.has(tone)) throw new Error(`Item ${i} has invalid tone: "${tone}"`);
    return {
      period: String(r.period ?? ""),
      summary: String(r.summary ?? ""),
      tone: tone as CommentaryTone,
      keyTopics: Array.isArray(r.keyTopics) ? (r.keyTopics as unknown[]).map(String) : [],
      contradictionNote: r.contradictionNote != null ? String(r.contradictionNote) : null,
    };
  });
}

export interface CommentaryTrendsDeps {
  nbAsk: typeof nbAsk;
}

export async function runCommentaryTrends(
  db: Database.Database,
  companyName: string,
  deps: CommentaryTrendsDeps,
): Promise<CommentaryTrend[]> {
  const company = getCompany(db, companyName);
  if (!company) throw new Error(`Company "${companyName}" not found. Run pnpm scrape first.`);
  const notebook = getNotebook(db, company.id);
  if (!notebook?.notebook_id) throw new Error(`No NotebookLM notebook for "${companyName}". Run pnpm ingest first.`);
  const { answer } = await deps.nbAsk(notebook.notebook_id, COMMENTARY_PROMPT);
  const trends = parseResponse(answer);
  insertCommentaryTrends(db, company.id, trends);
  return trends;
}

function main(): void {
  const name = process.argv[2];
  if (!name) {
    console.error('usage: pnpm commentary-trends "<Company Name>"');
    process.exit(1);
  }
  const db = openDb();
  runCommentaryTrends(db, name, { nbAsk })
    .then((trends) => console.log(`Inserted ${trends.length} commentary trend rows for ${name}`))
    .catch((e) => {
      console.error((e as Error).message);
      process.exit(1);
    });
}

if (process.argv[1] && process.argv[1].endsWith("commentary-trends.ts")) {
  main();
}
