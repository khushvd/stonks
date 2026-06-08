"use client";
import { useState, useCallback } from "react";
import type { ComparisonData } from "../src/dashboard/comparison.js";
import type { DashboardData } from "../src/dashboard/data.js";
import type { AnalystPlan } from "../src/planner/plan.js";
import { reviewDashboard, type ReviewerFinding } from "../src/reviewer/review.js";
import { ControlRail } from "./components/ControlRail.js";
import { Dashboard } from "./components/Dashboard.js";
import BriefingApp from "./components/briefing/BriefingApp";
import { toBriefingData } from "./components/briefing/adapter";

export default function Page() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [comparison, setComparison] = useState<ComparisonData | null>(null);
  const [reviewerFindings, setReviewerFindings] = useState<ReviewerFinding[]>([]);

  const refresh = useCallback(async (company: string, peers: string[] = [], plan?: AnalystPlan) => {
    const params = new URLSearchParams({ company });
    if (peers.length > 0) params.set("peers", peers.join(","));
    const res = await fetch(`/api/dashboard?${params.toString()}`);
    if (!res.ok) {
      setData(null);
      setComparison(null);
      setReviewerFindings([]);
      return;
    }
    const body = (await res.json()) as DashboardData & { comparison?: ComparisonData | null };
    setData(body);
    setComparison(body.comparison ?? null);
    setReviewerFindings(plan ? reviewDashboard(plan, body, body.comparison ?? null) : []);
  }, []);

  const handleExit = useCallback(() => {
    setData(null);
    setComparison(null);
    setReviewerFindings([]);
  }, []);

  if (data) {
    return <BriefingApp data={toBriefingData(data, comparison)} onExit={handleExit} />;
  }

  return (
    <main style={{ display: "grid", gridTemplateColumns: "minmax(300px, 360px) 1fr", height: "100vh" }}>
      <aside style={{ borderRight: "1px solid var(--border)", padding: 16, overflowY: "auto" }}>
        <div style={{ fontWeight: 700, marginBottom: 12 }}>stonks</div>
        <ControlRail onComplete={refresh} />
      </aside>
      <section style={{ padding: 20, overflowY: "auto" }}>
        <Dashboard data={data} comparison={comparison} reviewerFindings={reviewerFindings} />
      </section>
    </main>
  );
}
