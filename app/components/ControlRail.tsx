"use client";
import { useEffect, useState } from "react";
import type { AgentEvent } from "../../src/coordinator/types.js";
import type { AnalystPlan } from "../../src/planner/plan.js";
import { PlanReview } from "./PlanReview.js";
import { ProgressFeed } from "./ProgressFeed.js";

type RunStatus = "planned" | "running" | "failed" | "completed" | "cancelled";

export interface RunSummary {
  id: number;
  companyName: string;
  ask: string;
  status: RunStatus;
  failedStepId: string | null;
  errorMessage: string | null;
  peers: string[];
}

export interface RunDetail {
  id: number;
  companyName: string;
  ask: string;
  status: RunStatus;
  failedStepId: string | null;
  errorMessage: string | null;
  plan: AnalystPlan;
}

export interface StreamResult {
  runId: number | null;
  completed: boolean;
  failed: boolean;
}

export async function readAgentEventStream(
  stream: ReadableStream<Uint8Array>,
  handlers: { onEvent: (event: AgentEvent) => void; onRunId?: (runId: number) => void },
): Promise<StreamResult> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  const result: StreamResult = { runId: null, completed: false, failed: false };
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
      handlers.onEvent(ev);
      if (ev.kind === "run") {
        result.runId = ev.runId;
        result.completed = ev.status === "completed" || result.completed;
        result.failed = ev.status === "failed" || result.failed;
        handlers.onRunId?.(ev.runId);
      }
      if (ev.kind === "done" && ev.ok) result.completed = true;
      if (ev.kind === "error") result.failed = true;
    }
  }
  return result;
}

export function ControlRail({ onComplete }: { onComplete: (company: string, peers: string[], plan: AnalystPlan) => void }) {
  const [company, setCompany] = useState("Asian Paints");
  const [ask, setAsk] = useState("How have margins trended over the last few quarters?");
  const [plan, setPlan] = useState<AnalystPlan | null>(null);
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [activeRunId, setActiveRunId] = useState<number | null>(null);
  const [planning, setPlanning] = useState(false);
  const [running, setRunning] = useState(false);

  async function refreshRuns() {
    try {
      const res = await fetch("/api/runs");
      const body = (await res.json()) as { runs?: RunSummary[]; error?: string };
      if (!res.ok) throw new Error(body.error ?? "failed to load saved runs");
      setRuns(body.runs ?? []);
    } catch (e) {
      setEvents((prev) => [...prev, { kind: "error", message: (e as Error).message }]);
    }
  }

  async function fetchRunDetail(runId: number): Promise<RunDetail> {
    const res = await fetch(`/api/runs/${runId}`);
    const body = (await res.json()) as { run?: RunDetail; error?: string };
    if (!res.ok || !body.run) throw new Error(body.error ?? `failed to load run: ${runId}`);
    return body.run;
  }

  async function assertRunStream(res: Response): Promise<ReadableStream<Uint8Array>> {
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      throw new Error(body?.error ?? "run failed to start");
    }
    if (!res.body) throw new Error("no stream");
    return res.body;
  }

  useEffect(() => {
    void refreshRuns();
  }, []);

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
    const confirmedPlan = plan;
    setEvents([]);
    setRunning(true);
    try {
      const res = await fetch("/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: confirmedPlan, ask }),
      });
      await readAgentEventStream(await assertRunStream(res), {
        onEvent: (ev) => setEvents((prev) => [...prev, ev]),
        onRunId: setActiveRunId,
      });
    } catch (e) {
      setEvents((prev) => [...prev, { kind: "error", message: (e as Error).message }]);
    } finally {
      setRunning(false);
      onComplete(confirmedPlan.company.name, confirmedPlan.peers.map((p) => p.name), confirmedPlan);
      await refreshRuns();
    }
  }

  async function openSavedRun(runId: number) {
    try {
      const detail = await fetchRunDetail(runId);
      setCompany(detail.companyName);
      setAsk(detail.ask);
      setPlan(detail.plan);
      setActiveRunId(detail.id);
      onComplete(detail.companyName, detail.plan.peers.map((p) => p.name), detail.plan);
    } catch (e) {
      setEvents((prev) => [...prev, { kind: "error", message: (e as Error).message }]);
    }
  }

  async function retryRun(runId: number) {
    setEvents([]);
    setRunning(true);
    try {
      const res = await fetch("/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId, resume: true }),
      });
      const streamResult = await readAgentEventStream(await assertRunStream(res), {
        onEvent: (ev) => setEvents((prev) => [...prev, ev]),
        onRunId: setActiveRunId,
      });
      if (!streamResult.completed || streamResult.failed) return;
      try {
        const detail = await fetchRunDetail(runId);
        setCompany(detail.companyName);
        setAsk(detail.ask);
        setPlan(detail.plan);
        onComplete(detail.companyName, detail.plan.peers.map((p) => p.name), detail.plan);
      } catch (e) {
        setEvents((prev) => [...prev, { kind: "error", message: (e as Error).message }]);
      }
    } catch (e) {
      setEvents((prev) => [...prev, { kind: "error", message: (e as Error).message }]);
    } finally {
      setRunning(false);
      await refreshRuns();
    }
  }

  const controlsDisabled = planning || running;

  return (
    <div>
      <label style={{ fontSize: 11, color: "var(--muted)" }}>Company</label>
      <input
        value={company}
        onChange={(e) => {
          setCompany(e.target.value);
          setPlan(null);
        }}
        disabled={controlsDisabled}
        style={inputStyle}
      />
      <label style={{ fontSize: 11, color: "var(--muted)" }}>Ask</label>
      <textarea
        value={ask}
        onChange={(e) => {
          setAsk(e.target.value);
          setPlan(null);
        }}
        disabled={controlsDisabled}
        rows={3}
        style={{ ...inputStyle, resize: "vertical" }}
      />
      <button
        onClick={planRun}
        disabled={controlsDisabled || !company.trim()}
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
      <section style={{ marginTop: 18 }}>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>Previous studies</div>
        <p style={{ color: "var(--muted)", fontSize: 12, marginTop: 0 }}>Open a saved dashboard or retry a failed run.</p>
        {runs.length === 0 ? (
          <p style={{ color: "var(--muted)", fontSize: 12 }}>No saved runs yet.</p>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {runs.map((run) => {
              const isActive = activeRunId === run.id;
              return (
                <article key={run.id} style={historyItemStyle(isActive)}>
                  <div style={{ fontWeight: 700 }}>{run.companyName}</div>
                  <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 2 }}>{run.ask}</div>
                  <div style={{ color: "var(--muted)", fontSize: 11, marginTop: 6 }}>
                    Status: {run.status}
                    {run.failedStepId ? ` · Failed step: ${run.failedStepId}` : ""}
                  </div>
                  {run.errorMessage && (
                    <div style={{ color: "var(--bad)", fontSize: 11, marginTop: 4 }}>{run.errorMessage}</div>
                  )}
                  <div style={{ marginTop: 8 }}>
                    <button
                      type="button"
                      aria-label={`Open ${run.companyName}`}
                      onClick={() => void openSavedRun(run.id)}
                      disabled={controlsDisabled}
                      style={buttonStyle(controlsDisabled ? "var(--muted)" : "var(--panel)", "var(--text)")}
                    >
                      Open
                    </button>
                    {run.status === "failed" && (
                      <button
                        type="button"
                        aria-label={`Retry ${run.companyName}`}
                        onClick={() => void retryRun(run.id)}
                        disabled={controlsDisabled}
                        style={buttonStyle(controlsDisabled ? "var(--muted)" : "var(--accent)", "#fff")}
                      >
                        Retry from failed step
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
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

function historyItemStyle(active: boolean): React.CSSProperties {
  return {
    background: active ? "color-mix(in srgb, var(--accent) 12%, var(--panel))" : "var(--panel)",
    border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
    borderRadius: 6,
    padding: 10,
  };
}
