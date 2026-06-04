import type Database from "better-sqlite3";
import { getCompany } from "../db/companies.js";
import { listMetrics } from "../db/metrics.js";

export interface ComparisonMetricRow {
  name: string;
  unit: string | null;
  period: string | null;
  values: Record<string, number>; // company name → latest value
}

export interface ComparisonData {
  companies: string[];
  metrics: ComparisonMetricRow[];
}

// Load the latest screener metric for each metric_key per company.
// Returns a side-by-side comparison table for the given company names.
export function getComparisonData(db: Database.Database, companyNames: string[]): ComparisonData {
  // Resolve company names → IDs
  const companyMap = new Map<string, number>();
  for (const name of companyNames) {
    const company = getCompany(db, name);
    if (company) companyMap.set(name, company.id);
  }

  // Collect all screener metrics for these companies, grouped by metric_key
  const byKey = new Map<string, ComparisonMetricRow>();

  for (const [name, companyId] of companyMap.entries()) {
    const allMetrics = listMetrics(db);
    const screener = allMetrics.filter((m) => m.company_id === companyId && m.trust === "screener");
    // For each metric_key, pick the most recent row (highest id = latest inserted).
    const latestByKey = new Map<string, typeof screener[0]>();
    for (const m of screener) {
      const existing = latestByKey.get(m.name);
      if (!existing || m.id > existing.id) latestByKey.set(m.name, m);
    }
    for (const [key, m] of latestByKey.entries()) {
      let row = byKey.get(key);
      if (!row) {
        row = { name: key, unit: m.unit, period: m.period, values: {} };
        byKey.set(key, row);
      }
      row.values[name] = m.value;
    }
  }

  return {
    companies: companyNames.filter((n) => companyMap.has(n)),
    metrics: Array.from(byKey.values()),
  };
}
