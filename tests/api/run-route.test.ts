import { describe, expect, it, vi } from "vitest";
import type { AgentEvent } from "../../src/coordinator/types.js";
import type { AnalystPlan } from "../../src/planner/plan.js";

const plan: AnalystPlan = {
  company: { name: "Asian Paints", slug: "ASIANPAINT" },
  focusAreas: ["margins"],
  sourcePolicy: "latest filings",
  metrics: ["opm_pct"],
  peers: [
    { name: "Berger Paints", slug: "BERGEPAINT", reason: "direct peer" },
    { name: "Kansai Nerolac", slug: "KANSAINER", reason: "paint peer" },
    { name: "Indigo Paints", slug: "INDIGOPNTS", reason: "listed peer" },
  ],
  notebookQuestions: ["How have margins moved?"],
};

const emitted: AgentEvent[] = [
  { kind: "step", label: "Scrape Asian Paints" },
  { kind: "done", ok: true, summary: "done" },
];

vi.mock("../../src/executor/run.js", () => ({
  runExecution: vi.fn(async function* () {
    for (const event of emitted) yield event;
  }),
}));

const { POST } = await import("../../app/api/run/route.js");
const { runExecution } = await import("../../src/executor/run.js");

async function readFrames(res: Response): Promise<AgentEvent[]> {
  const text = await res.text();
  return text.trim().split("\n\n").map((frame) => JSON.parse(frame.replace(/^data: /, "")) as AgentEvent);
}

describe("/api/run", () => {
  it("streams events from the deterministic executor using the confirmed plan", async () => {
    const res = await POST(new Request("http://localhost/api/run", {
      method: "POST",
      body: JSON.stringify({ plan, ask: "compare margins" }),
    }));

    expect(res.status).toBe(200);
    expect(await readFrames(res)).toEqual(emitted);
    expect(runExecution).toHaveBeenCalledWith(plan, "compare margins", undefined, expect.any(AbortSignal));
  });

  it("rejects requests without a confirmed plan", async () => {
    const res = await POST(new Request("http://localhost/api/run", {
      method: "POST",
      body: JSON.stringify({ company: "Asian Paints", ask: "compare margins" }),
    }));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "missing confirmed plan" });
  });
});
