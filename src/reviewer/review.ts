import type { DashboardData } from "../dashboard/data.js";
import type { ComparisonData } from "../dashboard/comparison.js";
import type { AnalystPlan } from "../planner/plan.js";

export type ReviewerFindingKind =
  | "weak-citation"
  | "missing-evidence"
  | "missing-sector-kpi"
  | "bad-peer-choice"
  | "rejected-metric"
  | "unverified-number";

export interface ReviewerFinding {
  kind: ReviewerFindingKind;
  severity: "warn" | "bad";
  message: string;
  target: string | null;
}

export function reviewDashboard(plan: AnalystPlan, dashboard: DashboardData, comparison?: ComparisonData | null): ReviewerFinding[] {
  const findings: ReviewerFinding[] = [];

  const peerKeys = plan.peers.map((p) => p.slug || p.name.toLowerCase());
  if (new Set(peerKeys).size !== 3) {
    findings.push({
      kind: "bad-peer-choice",
      severity: "warn",
      target: "peers",
      message: "Peer set should contain exactly three distinct confirmed peers.",
    });
  }

  const metricNames = new Set(dashboard.metrics.map((m) => m.name));
  for (const metric of plan.metrics) {
    if (!metricNames.has(metric)) {
      findings.push({
        kind: "missing-evidence",
        severity: "warn",
        target: metric,
        message: `Requested metric "${metric}" is not present in the evidence table.`,
      });
    }
  }

  for (const reject of dashboard.rejects) {
    findings.push({
      kind: "rejected-metric",
      severity: "bad",
      target: reject.name,
      message: `Verifier rejected ${reject.name}${reject.period ? ` (${reject.period})` : ""}: ${reject.reason ?? "no reason recorded"}.`,
    });
  }

  for (const claim of dashboard.brief?.claims ?? []) {
    if (!claim.sourceHref || !claim.citedText) {
      findings.push({
        kind: "weak-citation",
        severity: "warn",
        target: claim.metric?.name ?? claim.section,
        message: `Claim has weak source support: "${claim.text}"`,
      });
    }
    if (claim.metric && claim.metric.badge.label !== "VERIFIED" && /\d/.test(claim.text)) {
      findings.push({
        kind: "unverified-number",
        severity: "warn",
        target: claim.metric.name,
        message: `Numeric claim for ${claim.metric.name} is ${claim.metric.badge.label}, not verified.`,
      });
    }
  }

  for (const row of comparison?.metrics ?? []) {
    for (const company of comparison?.companies ?? []) {
      const cell = row.cells[company];
      if (cell?.state === "missing") {
        findings.push({
          kind: "missing-sector-kpi",
          severity: "warn",
          target: `${company}:${row.name}`,
          message: `${row.label} is expected for this sector but missing for ${company}${cell.reason ? `: ${cell.reason}` : "."}`,
        });
      }
    }
  }

  return findings;
}
