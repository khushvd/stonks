"use client";
import { useEffect, useRef } from "react";
import * as Plot from "@observablehq/plot";
import type { MetricRow } from "../../src/dashboard/data.js";

// Render a single margin-trend line if there are ≥2 verified margin points; otherwise render nothing.
export function MarginChart({ rows }: { rows: MetricRow[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const points = rows
    .filter((m) => m.trust === "verified" && /margin/i.test(m.name) && m.period)
    .map((m) => ({ period: m.period as string, value: m.value }));

  useEffect(() => {
    if (!ref.current || points.length < 2) return;
    const chart = Plot.plot({
      marks: [Plot.lineY(points, { x: "period", y: "value" }), Plot.dot(points, { x: "period", y: "value" })],
      y: { label: "%", grid: true },
      x: { label: null },
      style: { background: "transparent", color: "var(--text)" },
      marginLeft: 40,
    });
    ref.current.append(chart);
    return () => chart.remove();
  }, [points]);

  if (points.length < 2) return null;
  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 4 }}>Margin trend (verified only)</div>
      <div ref={ref} />
    </div>
  );
}
