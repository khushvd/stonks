"use client";
import { useEffect, useRef } from "react";
import * as Plot from "@observablehq/plot";
import type { TrendSeries } from "../../src/dashboard/data.js";

function shortPeriod(period: string): string {
  // "Jun 2024" → "Jun'24", "Mar 2023" → "Mar'23"
  const parts = period.split(" ");
  if (parts.length === 2) return `${parts[0]}'${parts[1].slice(-2)}`;
  return period;
}

function Sparkline({ series }: { series: TrendSeries }) {
  const ref = useRef<HTMLDivElement>(null);
  const points = series.points.map((p) => ({ ...p, label: shortPeriod(p.period) }));
  useEffect(() => {
    if (!ref.current) return;
    const chart = Plot.plot({
      marks: [
        Plot.lineY(points, { x: "label", y: "value", stroke: "var(--text)", strokeWidth: 1.5 }),
        Plot.dot(points, { x: "label", y: "value", fill: "var(--text)", r: 2 }),
      ],
      x: { tickRotate: -30, tickSize: 3 },
      y: { label: series.unit ?? undefined, grid: false },
      style: { background: "transparent", color: "var(--muted)", fontSize: "10px" },
      width: 220,
      height: 90,
      marginLeft: 36,
      marginBottom: 24,
    });
    ref.current.append(chart);
    return () => chart.remove();
  }, [series]);

  return (
    <div style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-start", marginRight: 20, marginBottom: 12 }}>
      <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 2 }}>
        {series.name.replace(/_/g, " ")} {series.unit ? `(${series.unit})` : ""}
      </div>
      <div ref={ref} />
    </div>
  );
}

export function TrendsPanel({ trends }: { trends: TrendSeries[] }) {
  if (!trends || trends.length === 0) return null;
  return (
    <section style={{ marginTop: 24, marginBottom: 16 }}>
      <h2 style={{ fontSize: 14, textTransform: "uppercase", letterSpacing: 0.5, color: "var(--muted)", margin: "0 0 12px" }}>
        Financial Trends
      </h2>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 0 }}>
        {trends.map((s) => (
          <Sparkline key={s.name} series={s} />
        ))}
      </div>
    </section>
  );
}
