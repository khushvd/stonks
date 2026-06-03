import { openDb } from "../db/db.js";
import { stageMetric, promoteMetric, rejectMetric, listMetrics, listStaging, integritySummary } from "../db/metrics.js";

const [, , cmd, ...rest] = process.argv;
const db = openDb();

function out(v: unknown) { console.log(JSON.stringify(v, null, 2)); }

switch (cmd) {
  case "stage": {
    // pnpm db stage '<json MetricInput>'
    out({ staging_id: stageMetric(db, JSON.parse(rest[0])) });
    break;
  }
  case "promote": { out({ metric_id: promoteMetric(db, Number(rest[0])) }); break; }
  case "reject": { rejectMetric(db, Number(rest[0]), rest.slice(1).join(" ")); out({ ok: true }); break; }
  case "list-metrics": { out(listMetrics(db, rest[0] ? Number(rest[0]) : undefined)); break; }
  case "list-staging": { out(listStaging(db, rest[0] as "pending" | "rejected" | undefined)); break; }
  case "summary": { out(integritySummary(db)); break; }
  default:
    console.error("commands: stage <json> | promote <id> | reject <id> <reason> | list-metrics [filingId] | list-staging [status] | summary");
    process.exit(1);
}
