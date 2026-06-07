import type Database from "better-sqlite3";
import type { Company, Filing, IntegritySummary } from "../types.js";
import { getCompany } from "../db/companies.js";
import { listFilings } from "../db/filings.js";
import { listMetrics, listStaging } from "../db/metrics.js";
import { getLatestBrief } from "../db/briefs.js";
import { getIndustryMetrics } from "../db/industry-metrics.js";
import { trustBadge, type Badge } from "./trust.js";
import { buildCitationHref, buildSourceHref } from "./citation.js";
import { UNIVERSAL_BASE } from "../extract/canonical.js";
import type { Brief } from "../synthesis/types.js";
import { getCommentaryTrends, type CommentaryTrend } from "../db/commentary-trends.js";

export type { CommentaryTrend };

export interface MetricRow {
  name: string;
  value: number;
  unit: string | null;
  period: string | null;
  trust: "verified" | "notebooklm-only" | "screener";
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

export interface BriefClaimView {
  text: string;
  section: "answer" | "guidance" | "drivers" | "risks" | "industry_kpi";
  citedText: string | null;
  sourceHref: string | null;
  metric: { name: string; value: number; unit: string | null; period: string | null; badge: Badge } | null;
}

export interface BriefView {
  ask: string | null;
  claims: BriefClaimView[];
  industryKpis: string[];
}

export interface TrendPoint {
  period: string;
  value: number;
}

export interface TrendSeries {
  name: string;
  unit: string | null;
  points: TrendPoint[];
}

export interface DashboardData {
  company: Company;
  integrity: IntegritySummary;
  metrics: MetricRow[];
  rejects: RejectRow[];
  filings: Filing[];
  brief: BriefView | null;
  trends: TrendSeries[];
  industryKpis: string[]; // cached KPIs for this company's industry (from industry_metrics table)
  commentaryTrends: CommentaryTrend[];
}

export function getDashboard(db: Database.Database, companyName: string): DashboardData | null {
  const company = getCompany(db, companyName);
  if (!company) return null;

  const filings = listFilings(db, company.id);
  const byId = new Map(filings.map((f) => [f.id, f]));

  const allMetrics: MetricRow[] = listMetrics(db)
    // Include metrics for this company's filings, OR screener metrics attached directly to company_id
    .filter((m) => (m.filing_id !== null && byId.has(m.filing_id)) || m.company_id === company.id)
    .map((m) => {
      const filing = m.filing_id !== null ? (byId.get(m.filing_id) ?? null) : null;
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

  // Integrity is computed from the already-company-scoped data, NOT the global helper
  // (which counts across all companies and would leak other companies' counts into this tile).
  const pending = listStaging(db, "pending").filter((s) => byId.has(s.filing_id)).length;
  const integrity: IntegritySummary = {
    verified: allMetrics.filter((m) => m.trust === "verified").length,
    notebooklmOnly: allMetrics.filter((m) => m.trust === "notebooklm-only").length,
    pending,
    rejected: rejects.length,
  };

  // --- Brief shaping ---
  // Map filings by notebooklm_source_id so we can resolve citations to local PDFs.
  const sourceById = new Map(filings.map((f) => [f.notebooklm_source_id, f] as const));
  // Badge a claim's number by matching the promoted metrics (then rejects) by name+value.
  const metricByKey = new Map<string, MetricRow>(allMetrics.map((m) => [`${m.name}|${m.value}`, m]));
  const rejectedKeys = new Set<string>(rejects.map((r) => `${r.name}|${r.value}`));

  let brief: BriefView | null = null;
  const stored = getLatestBrief(db, company.id);
  if (stored) {
    let parsed: Brief | null = null;
    try {
      parsed = JSON.parse(stored.json) as Brief;
    } catch {
      parsed = null;
    }
    if (parsed) {
      const refByNum = new Map(parsed.references.map((r) => [r.citation_number, r] as const));
      brief = {
        ask: parsed.ask,
        industryKpis: parsed.industryKpis,
        claims: parsed.claims.map((c) => {
          const ref = c.cite !== null ? refByNum.get(c.cite) ?? null : null;
          const filing = ref ? sourceById.get(ref.source_id) ?? null : null;
          let metric: BriefClaimView["metric"] = null;
          if (c.metric) {
            const key = `${c.metric.name}|${c.metric.value}`;
            const promoted = metricByKey.get(key);
            const badge = promoted
              ? promoted.badge
              : rejectedKeys.has(key)
                ? ({ label: "REJECTED", tone: "bad", color: "#ff4444" } as Badge)
                : trustBadge("notebooklm-only"); // staged-but-not-yet-verified → treat as NLM-only
            metric = { ...c.metric, badge };
          }
          return {
            text: c.text,
            section: c.section,
            citedText: ref?.cited_text ?? null,
            sourceHref: buildSourceHref(filing?.local_path ?? null),
            metric,
          };
        }),
      };
    }
  }

  // --- Scope evidence metrics to brief-referenced names ∪ universal core ---
  const universalNames = new Set(UNIVERSAL_BASE.map((u) => u.metric_key));
  const briefNames = new Set((brief?.claims ?? []).map((c) => c.metric?.name).filter((n): n is string => !!n));
  const metrics = allMetrics.filter((m) => universalNames.has(m.name) || briefNames.has(m.name));

  // --- Multi-period trend series from screener metrics ---
  // Screener stores both quarterly and annual rows. Deduplicate by (name, period) keeping
  // the first occurrence — quarterly rows are inserted first so quarterly wins for
  // overlapping periods like "Mar 2024".
  const MONTH_IDX: Record<string, number> = {
    Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
    Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
  };
  function periodToOrder(period: string): number {
    const [month, year] = period.split(" ");
    return parseInt(year, 10) * 12 + (MONTH_IDX[month] ?? 0);
  }

  const screenerMetrics = allMetrics.filter((m) => m.trust === "screener" && m.period);
  const seenKeys = new Set<string>();
  const trendsByName = new Map<string, TrendSeries>();
  for (const m of screenerMetrics) {
    const dedupeKey = `${m.name}|${m.period}`;
    if (seenKeys.has(dedupeKey)) continue;
    seenKeys.add(dedupeKey);
    let series = trendsByName.get(m.name);
    if (!series) {
      series = { name: m.name, unit: m.unit, points: [] };
      trendsByName.set(m.name, series);
    }
    series.points.push({ period: m.period as string, value: m.value });
  }

  // Sort each series chronologically and keep only series with ≥2 points.
  // Priority order: revenue, ebitda, opm_pct, pat, then others alphabetically.
  const PRIORITY = ["revenue", "ebitda", "opm_pct", "pat"];
  const allTrends = Array.from(trendsByName.values())
    .filter((s) => s.points.length >= 2)
    .map((s) => ({
      ...s,
      points: [...s.points].sort((a, b) => periodToOrder(a.period) - periodToOrder(b.period)),
    }));
  const trends = [
    ...PRIORITY.map((name) => allTrends.find((s) => s.name === name)).filter((s): s is TrendSeries => !!s),
    ...allTrends.filter((s) => !PRIORITY.includes(s.name)).sort((a, b) => a.name.localeCompare(b.name)),
  ];

  // --- Industry KPIs from cache ---
  const industryKpis = company.industry
    ? getIndustryMetrics(db, company.industry).map((m) => m.metric_key)
    : [];

  const commentaryTrends = getCommentaryTrends(db, company.id);

  return { company, integrity, metrics, rejects, filings, brief, trends, industryKpis, commentaryTrends };
}
