"use client";
import type { AgentEvent } from "../../src/coordinator/types.js";

const STEPS = ["Scrape screener", "Ingest → NotebookLM", "Extract metrics", "Verify vs source", "Summarize"];

export function ProgressFeed({ events, running }: { events: AgentEvent[]; running: boolean }) {
  const seen = new Set(events.filter((e) => e.kind === "step").map((e) => (e as { label: string }).label));
  const errored = events.find((e) => e.kind === "error") as { message: string } | undefined;
  const done = events.find((e) => e.kind === "done");
  const lastText = [...events].reverse().find((e) => e.kind === "text") as { text: string } | undefined;

  // The currently-running step = first not-yet-seen step (only while running and no error).
  const currentIdx = running && !errored ? STEPS.findIndex((s) => !seen.has(s)) : -1;

  return (
    <div style={{ marginTop: 12 }}>
      {STEPS.map((s, i) => {
        const isDone = seen.has(s) || (done && !errored);
        const isRunning = i === currentIdx;
        const mark = isDone ? "✓" : isRunning ? "⏳" : "·";
        const color = isDone ? "var(--ok)" : isRunning ? "var(--text)" : "var(--muted)";
        return (
          <div key={s} style={{ color, padding: "2px 0" }}>
            {mark} {s}
          </div>
        );
      })}
      {lastText && <div style={{ marginTop: 8, color: "var(--muted)", fontSize: 12 }}>{lastText.text}</div>}
      {errored && <div style={{ marginTop: 8, color: "var(--bad)" }}>Run failed: {errored.message}</div>}
    </div>
  );
}
