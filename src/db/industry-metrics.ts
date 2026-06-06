import type Database from "better-sqlite3";
import type { IndustryMetric } from "../types.js";

export function getIndustryMetrics(db: Database.Database, industry: string): IndustryMetric[] {
  return db
    .prepare("SELECT industry, metric_key, label, unit, description, priority, source FROM industry_metrics WHERE industry = ? ORDER BY COALESCE(priority, rowid), rowid")
    .all(industry) as IndustryMetric[];
}

export function setIndustryMetrics(
  db: Database.Database,
  industry: string,
  metrics: { metric_key: string; label: string | null; unit?: string | null; description?: string | null; priority?: number | null }[],
  source: "notebooklm" | "sonnet",
): void {
  const tx = db.transaction(() => {
    db.prepare("DELETE FROM industry_metrics WHERE industry = ?").run(industry);
    const ins = db.prepare(
      "INSERT INTO industry_metrics (industry, metric_key, label, unit, description, priority, source) VALUES (?, ?, ?, ?, ?, ?, ?)",
    );
    for (const m of metrics) {
      ins.run(industry, m.metric_key, m.label, m.unit ?? null, m.description ?? null, m.priority ?? null, source);
    }
  });
  tx();
}
