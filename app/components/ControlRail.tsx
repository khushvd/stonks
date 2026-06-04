"use client";
import { useState } from "react";
import type { AgentEvent } from "../../src/coordinator/types.js";
import { ProgressFeed } from "./ProgressFeed.js";

export function ControlRail({ onComplete }: { onComplete: (company: string) => void }) {
  const [company, setCompany] = useState("Asian Paints");
  const [ask, setAsk] = useState("How have margins trended over the last few quarters?");
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [running, setRunning] = useState(false);

  async function run() {
    setEvents([]);
    setRunning(true);
    try {
      const res = await fetch("/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company, ask }),
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
      onComplete(company);
    }
  }

  return (
    <div>
      <label style={{ fontSize: 11, color: "var(--muted)" }}>Company</label>
      <input
        value={company}
        onChange={(e) => setCompany(e.target.value)}
        disabled={running}
        style={inputStyle}
      />
      <label style={{ fontSize: 11, color: "var(--muted)" }}>Ask</label>
      <textarea
        value={ask}
        onChange={(e) => setAsk(e.target.value)}
        disabled={running}
        rows={3}
        style={{ ...inputStyle, resize: "vertical" }}
      />
      <button
        onClick={run}
        disabled={running || !company.trim()}
        style={{
          background: running ? "var(--muted)" : "var(--accent)",
          color: "#fff",
          border: "none",
          borderRadius: 4,
          padding: "6px 14px",
          fontWeight: 600,
        }}
      >
        {running ? "Running…" : "▶ Run"}
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
