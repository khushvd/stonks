"use client";
import { useState } from "react";
import type { AgentEvent } from "../../src/coordinator/types.js";
import type { AnalystPlan } from "../../src/planner/plan.js";
import { PlanReview } from "./PlanReview.js";
import { ProgressFeed } from "./ProgressFeed.js";

export function ControlRail({ onComplete }: { onComplete: (company: string, peers: string[], plan: AnalystPlan) => void }) {
  const [company, setCompany] = useState("Asian Paints");
  const [ask, setAsk] = useState("How have margins trended over the last few quarters?");
  const [plan, setPlan] = useState<AnalystPlan | null>(null);
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [planning, setPlanning] = useState(false);
  const [running, setRunning] = useState(false);

  async function planRun() {
    setEvents([]);
    setPlanning(true);
    setPlan(null);
    try {
      const res = await fetch("/api/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company, ask }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "planner failed");
      setPlan(body.plan as AnalystPlan);
    } catch (e) {
      setEvents((prev) => [...prev, { kind: "error", message: (e as Error).message }]);
    } finally {
      setPlanning(false);
    }
  }

  async function run() {
    if (!plan) return;
    setEvents([]);
    setRunning(true);
    try {
      const res = await fetch("/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, ask }),
      });
      if (!res.body) throw new Error("no stream");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n\n")) >= 0) {
          const frame = buf.slice(0, nl);
          buf = buf.slice(nl + 2);
          const line = frame.split("\n").find((l) => l.startsWith("data: "));
          if (!line) continue;
          const ev = JSON.parse(line.slice(6)) as AgentEvent;
          setEvents((prev) => [...prev, ev]);
        }
      }
    } catch (e) {
      setEvents((prev) => [...prev, { kind: "error", message: (e as Error).message }]);
    } finally {
      setRunning(false);
      onComplete(plan.company.name, plan.peers.map((p) => p.name), plan);
    }
  }

  return (
    <div>
      <label style={{ fontSize: 11, color: "var(--muted)" }}>Company</label>
      <input
        value={company}
        onChange={(e) => {
          setCompany(e.target.value);
          setPlan(null);
        }}
        disabled={planning || running}
        style={inputStyle}
      />
      <label style={{ fontSize: 11, color: "var(--muted)" }}>Ask</label>
      <textarea
        value={ask}
        onChange={(e) => {
          setAsk(e.target.value);
          setPlan(null);
        }}
        disabled={planning || running}
        rows={3}
        style={{ ...inputStyle, resize: "vertical" }}
      />
      <button
        onClick={planRun}
        disabled={planning || running || !company.trim()}
        style={buttonStyle(planning || running ? "var(--muted)" : "var(--panel)", "var(--text)")}
      >
        {planning ? "Planning..." : "Plan"}
      </button>
      {plan && <PlanReview plan={plan} onChange={setPlan} disabled={running} />}
      <button
        onClick={run}
        disabled={running || !plan}
        style={buttonStyle(running || !plan ? "var(--muted)" : "var(--accent)", "#fff")}
      >
        {running ? "Running..." : "Run confirmed plan"}
      </button>
      <ProgressFeed events={events} running={running} />
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "var(--panel)",
  border: "1px solid var(--border)",
  borderRadius: 4,
  padding: 6,
  margin: "4px 0 10px",
  color: "var(--text)",
};

function buttonStyle(background: string, color: string): React.CSSProperties {
  return {
    background,
    color,
    border: "1px solid var(--border)",
    borderRadius: 4,
    padding: "6px 14px",
    fontWeight: 600,
    marginRight: 8,
    marginBottom: 8,
  };
}
