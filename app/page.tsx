"use client";
import { useState, useCallback } from "react";
import type { DashboardData } from "../src/dashboard/data.js";
import { ControlRail } from "./components/ControlRail.js";
import { Dashboard } from "./components/Dashboard.js";

export default function Page() {
  const [data, setData] = useState<DashboardData | null>(null);

  const refresh = useCallback(async (company: string) => {
    const res = await fetch(`/api/dashboard?company=${encodeURIComponent(company)}`);
    // Clear on a failed fetch (e.g. 404 from a typo) so a stale company's data is never shown as
    // if it belonged to the one just requested. The empty-state copy renders instead.
    setData(res.ok ? ((await res.json()) as DashboardData) : null);
  }, []);

  return (
    <main style={{ display: "grid", gridTemplateColumns: "minmax(300px, 360px) 1fr", height: "100vh" }}>
      <aside style={{ borderRight: "1px solid var(--border)", padding: 16, overflowY: "auto" }}>
        <div style={{ fontWeight: 700, marginBottom: 12 }}>stonks</div>
        <ControlRail onComplete={refresh} />
      </aside>
      <section style={{ padding: 20, overflowY: "auto" }}>
        <Dashboard data={data} />
      </section>
    </main>
  );
}
