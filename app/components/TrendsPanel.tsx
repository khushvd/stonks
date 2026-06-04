"use client";
import { useEffect, useRef } from "react";
import * as Plot from "@observablehq/plot";
import type { TrendSeries } from "../../src/dashboard/data.js";

// Tufte-style small-multiple sparkline for one metric series.
function Sparkline({ series }: { series: TrendSeries }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const chart = Plot.plot({
      marks: [
        Plot.lineY(series.points, { x: "period", y: "value", stroke: "var(--text)", strokeWidth: 1.5 }),
        Plot.dot(series.points, { x: "period", y: "value", fill: "var(--text)", r: 2 }),
      ],
      x: { axis: null },
      y: { label: series.unit ?? undefined, grid: false },
      style: { background: "transparent", color: "var(--muted)", fontSize: "10px" },
      width: 200,
      height: 80,
      marginLeft: 36,
      marginBottom: 4,
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
        Screener Trends
      </h2>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 0 }}>
        {trends.map((s) => (
          <Sparkline key={s.name} series={s} />
        ))}
      </div>
    </section>
  );
}
