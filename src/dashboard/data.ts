import type Database from "better-sqlite3";
import type { Company, Filing, IntegritySummary } from "../types.js";
import { getCompany } from "../db/companies.js";
import { listFilings } from "../db/filings.js";
import { listMetrics, listStaging, integritySummary } from "../db/metrics.js";
import { trustBadge, type Badge } from "./trust.js";
import { buildCitationHref } from "./citation.js";

export interface MetricRow {
  name: string;
  value: number;
  unit: string | null;
  period: string | null;
  trust: "verified" | "notebooklm-only";
  badge: Badge;
  sourcePage: number | null;
  filingType: Filing["type"] | null;
  citationHref: string | null;
}

export interface RejectRow {
  name: string;
  value: number;
  unit: string | null;
  period: string | null;
  reason: string | null;
  excerpt: string | null;
}

export interface DashboardData {
  company: Company;
  integrity: IntegritySummary;
  metrics: MetricRow[];
  rejects: RejectRow[];
  filings: Filing[];
}

export function getDashboard(db: Database.Database, companyName: string): DashboardData | null {
  const company = getCompany(db, companyName);
  if (!company) return null;

  const filings = listFilings(db, company.id);
  const byId = new Map(filings.map((f) => [f.id, f]));

  const metrics: MetricRow[] = listMetrics(db)
    .filter((m) => byId.has(m.filing_id))
    .map((m) => {
      const filing = byId.get(m.filing_id) ?? null;
      return {
        name: m.name,
        value: m.value,
        unit: m.unit,
        period: m.period,
        trust: m.trust,
        badge: trustBadge(m.trust),
        sourcePage: m.source_page,
        filingType: filing?.type ?? null,
        citationHref: buildCitationHref(filing?.local_path ?? null, m.source_page),
      };
    });

  const rejects: RejectRow[] = listStaging(db, "rejected")
    .filter((s) => byId.has(s.filing_id))
    .map((s) => ({
      name: s.name,
      value: s.value,
      unit: s.unit,
      period: s.period,
      reason: s.reject_reason,
      excerpt: s.excerpt,
    }));

  return { company, integrity: integritySummary(db), metrics, rejects, filings };
}
