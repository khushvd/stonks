import type Database from "better-sqlite3";
import { getIndustryMetrics } from "../db/industry-metrics.js";

export interface ExpectedKpi {
  metric_key: string;
  label: string;
  unit: string | null;
  priority: number;
}

const HOTEL_KPIS: ExpectedKpi[] = [
  { metric_key: "revpar", label: "RevPAR", unit: "rs", priority: 10 },
  { metric_key: "arr_or_adr", label: "ARR / ADR", unit: "rs", priority: 20 },
  { metric_key: "occupancy", label: "Occupancy", unit: "%", priority: 30 },
  { metric_key: "rooms_or_keys", label: "Rooms / Keys", unit: null, priority: 40 },
  { metric_key: "ebitda_margin", label: "EBITDA Margin", unit: "%", priority: 50 },
];

export function normalizeMetricKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function isHotelIndustry(value: string | null): boolean {
  return !!value && /hotel|hospitality|lodging|samhi|chalet|lemon\s*tree|indian\s*hotels|\bihcl\b/i.test(value);
}

function add(out: Map<string, ExpectedKpi>, kpi: ExpectedKpi): void {
  const key = normalizeMetricKey(kpi.metric_key);
  if (!key) return;
  const existing = out.get(key);
  if (!existing || kpi.priority < existing.priority) {
    out.set(key, { ...kpi, metric_key: key });
  }
}

export function buildExpectedKpis(
  db: Database.Database,
  input: { industry: string | null; briefIndustryKpis?: string[]; companyHints?: string[] },
): ExpectedKpi[] {
  const out = new Map<string, ExpectedKpi>();
  const hint = [input.industry, ...(input.companyHints ?? [])].filter(Boolean).join(" ");
  if (isHotelIndustry(hint || input.industry)) {
    for (const kpi of HOTEL_KPIS) add(out, kpi);
  }

  if (input.industry) {
    for (const [idx, metric] of getIndustryMetrics(db, input.industry).entries()) {
      add(out, {
        metric_key: metric.metric_key,
        label: metric.label ?? metric.metric_key,
        unit: metric.unit ?? null,
        priority: metric.priority ?? 100 + idx,
      });
    }
  }

  for (const [idx, label] of (input.briefIndustryKpis ?? []).entries()) {
    add(out, {
      metric_key: normalizeMetricKey(label),
      label,
      unit: null,
      priority: 200 + idx,
    });
  }

  return Array.from(out.values()).sort((a, b) => a.priority - b.priority || a.label.localeCompare(b.label));
}
