import type Database from "better-sqlite3";
import type { Trust } from "../types.js";
import type { Badge } from "./trust.js";
import { getCompany } from "../db/companies.js";
import { listFilings } from "../db/filings.js";
import { listKpiStatuses } from "../db/company-kpi-status.js";
import { listMetrics, listStaging } from "../db/metrics.js";
import { trustBadge } from "./trust.js";
import { buildCitationHref } from "./citation.js";
import { buildExpectedKpis } from "./sector-kpis.js";

export type ComparisonCell =
  | {
      state: "value";
      value: number;
      unit: string | null;
      period: string | null;
      trust: Trust;
      badge: Badge;
      citationHref: string | null;
    }
  | { state: "missing"; reason: string | null }
  | { state: "failed"; reason: string | null }
  | { state: "rejected"; reason: string | null };

export interface ComparisonMetricRow {
  name: string;
  label: string;
  unit: string | null;
  cells: Record<string, ComparisonCell>;
}

export interface PeerCoverage {
  company: string;
  annualReports: number;
  presentations: number;
  concalls: number;
  foundKpis: string[];
  missingKpis: string[];
  failedKpis: string[];
}

export interface ComparisonData {
  companies: string[];
  coverage: PeerCoverage[];
  metrics: ComparisonMetricRow[];
}

function rejectedBadgeCell(reason: string | null): ComparisonCell {
  return { state: "rejected", reason };
}

export function getComparisonData(db: Database.Database, companyNames: string[]): ComparisonData {
  const companies = companyNames.map((name) => getCompany(db, name)).filter((c): c is NonNullable<typeof c> => !!c);
  if (companies.length === 0) return { companies: [], coverage: [], metrics: [] };

  const main = companies[0];
  const expected = buildExpectedKpis(db, { industry: main.industry, briefIndustryKpis: [], companyHints: [main.name, main.ticker ?? ""] });
  const allMetrics = listMetrics(db);
  const allRejected = listStaging(db, "rejected");

  const rows: ComparisonMetricRow[] = expected.map((kpi) => {
    const cells: Record<string, ComparisonCell> = {};
    for (const company of companies) {
      const filings = listFilings(db, company.id);
      const filingIds = new Set(filings.map((f) => f.id));
      const filingById = new Map(filings.map((f) => [f.id, f] as const));

      const candidates = allMetrics.filter((m) =>
        m.name === kpi.metric_key &&
        ((m.company_id === company.id) || (m.filing_id !== null && filingIds.has(m.filing_id))),
      );
      const latest = candidates.sort((a, b) => b.id - a.id)[0];
      if (latest) {
        const filing = latest.filing_id !== null ? filingById.get(latest.filing_id) ?? null : null;
        cells[company.name] = {
          state: "value",
          value: latest.value,
          unit: latest.unit ?? kpi.unit,
          period: latest.period,
          trust: latest.trust,
          badge: trustBadge(latest.trust),
          citationHref: buildCitationHref(filing?.local_path ?? null, latest.source_page),
        };
        continue;
      }

      const rejected = allRejected.find((r) => r.name === kpi.metric_key && filingIds.has(r.filing_id));
      if (rejected) {
        cells[company.name] = rejectedBadgeCell(rejected.reject_reason);
        continue;
      }

      const status = listKpiStatuses(db, company.id).find((s) => s.metric_key === kpi.metric_key);
      if (status?.status === "failed") {
        cells[company.name] = { state: "failed", reason: status.missing_reason };
      } else {
        cells[company.name] = { state: "missing", reason: status?.missing_reason ?? null };
      }
    }
    return { name: kpi.metric_key, label: kpi.label, unit: kpi.unit, cells };
  });

  const coverage: PeerCoverage[] = companies.map((company) => {
    const filings = listFilings(db, company.id);
    const statuses = listKpiStatuses(db, company.id);
    const companyCells = rows.flatMap((row) => {
      const cell = row.cells[company.name];
      return cell?.state === "value" ? [row.name] : [];
    });
    return {
      company: company.name,
      annualReports: filings.filter((f) => f.type === "annual_report").length,
      presentations: filings.filter((f) => f.type === "presentation").length,
      concalls: filings.filter((f) => f.type === "result").length,
      foundKpis: Array.from(new Set(companyCells)),
      missingKpis: statuses.filter((s) => s.status === "missing").map((s) => s.metric_key),
      failedKpis: statuses.filter((s) => s.status === "failed").map((s) => s.metric_key),
    };
  });

  return { companies: companies.map((c) => c.name), coverage, metrics: rows };
}
