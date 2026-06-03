import { openDb } from "../db/db.js";
import { stageMetric, promoteMetric, rejectMetric, listMetrics, listStaging, integritySummary } from "../db/metrics.js";
import { getNotebook, upsertNotebook } from "../db/notebooks.js";
import { getIndustryMetrics, setIndustryMetrics } from "../db/industry-metrics.js";
import type { Trust } from "../types.js";

const [, , cmd, ...rest] = process.argv;
const db = openDb();

function out(v: unknown) { console.log(JSON.stringify(v, null, 2)); }

switch (cmd) {
  case "stage": {
    // pnpm db stage '<json MetricInput>'
    out({ staging_id: stageMetric(db, JSON.parse(rest[0])) });
    break;
  }
  // pnpm db promote <id> [verified|notebooklm-only]   (default verified)
  case "promote": { out({ metric_id: promoteMetric(db, Number(rest[0]), (rest[1] as Trust) ?? "verified") }); break; }
  case "reject": { rejectMetric(db, Number(rest[0]), rest.slice(1).join(" ")); out({ ok: true }); break; }
  case "list-metrics": { out(listMetrics(db, rest[0] ? Number(rest[0]) : undefined)); break; }
  case "list-staging": { out(listStaging(db, rest[0] as "pending" | "rejected" | undefined)); break; }
  case "summary": { out(integritySummary(db)); break; }
  // pnpm db get-notebook <companyId>
  case "get-notebook": { out(getNotebook(db, Number(rest[0])) ?? null); break; }
  // pnpm db set-notebook <companyId> <url> [notebookId]
  case "set-notebook": { upsertNotebook(db, Number(rest[0]), rest[1] ?? null, rest[2] ?? null); out({ ok: true }); break; }
  // pnpm db get-industry-metrics <industry>
  case "get-industry-metrics": { out(getIndustryMetrics(db, rest[0])); break; }
  // pnpm db set-industry-metrics <industry> <notebooklm|sonnet> '<json [{metric_key,label}]>'
  case "set-industry-metrics": { setIndustryMetrics(db, rest[0], JSON.parse(rest[2]), rest[1] as "notebooklm" | "sonnet"); out({ ok: true }); break; }
  default:
    console.error("commands: stage <json> | promote <id> [trust] | reject <id> <reason> | list-metrics [filingId] | list-staging [status] | summary | get-notebook <companyId> | set-notebook <companyId> <url> [notebookId] | get-industry-metrics <industry> | set-industry-metrics <industry> <source> <json>");
    process.exit(1);
}
