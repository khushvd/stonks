import { describe, expect, it } from "vitest";
import { buildExecutionCommands, runExecution } from "../../src/executor/run.js";
import type { AnalystPlan } from "../../src/planner/plan.js";
import type { AgentEvent, Spawner } from "../../src/coordinator/types.js";

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

async function collect(it: AsyncIterable<AgentEvent>): Promise<AgentEvent[]> {
  const out: AgentEvent[] = [];
  for await (const ev of it) out.push(ev);
  return out;
}

describe("buildExecutionCommands", () => {
  it("passes Asian Paints as a name and ASIANPAINT as the explicit Screener slug", () => {
    const commands = buildExecutionCommands(plan, "compare margins");
    expect(commands[0]).toEqual({
      label: "Scrape Asian Paints",
      cmd: "pnpm",
      args: ["scrape", "--name", "Asian Paints", "--slug", "ASIANPAINT", "--annual", "--per-type", "4"],
    });
    expect(commands).toContainEqual({
      label: "Scrape peer Berger Paints",
      cmd: "pnpm",
      args: ["scrape", "--name", "Berger Paints", "--slug", "BERGEPAINT", "--annual", "--per-type", "4"],
    });
  });

  it("keeps the peer notebook analysis chain deterministic and ordered", () => {
    const labels = buildExecutionCommands(plan, "compare margins").map((c) => c.label);
    expect(labels).toEqual([
      "Scrape Asian Paints",
      "Scrape peer Berger Paints",
      "Scrape peer Kansai Nerolac",
      "Scrape peer Indigo Paints",
      "Ingest Asian Paints into NotebookLM",
      "Ingest peer Berger Paints into NotebookLM",
      "Ingest peer Kansai Nerolac into NotebookLM",
      "Ingest peer Indigo Paints into NotebookLM",
      "Synthesize cited brief",
      "Extract peer sector KPI pack",
      "Verify staged metrics for Asian Paints",
      "Verify staged metrics for Berger Paints",
      "Verify staged metrics for Kansai Nerolac",
      "Verify staged metrics for Indigo Paints",
      "Summarize database",
    ]);
  });
});

describe("runExecution", () => {
  it("spawns each fixed command and emits step then done events", async () => {
    const calls: Array<{ cmd: string; args: string[] }> = [];
    const spawn: Spawner = (cmd, args) => {
      calls.push({ cmd, args });
      return {
        stdout: (async function* () {})(),
        exitCode: Promise.resolve(0),
        stderr: Promise.resolve(""),
      };
    };

    const events = await collect(runExecution(plan, "compare margins", spawn));

    expect(calls).toHaveLength(15);
    expect(calls[0]).toEqual({ cmd: "pnpm", args: ["scrape", "--name", "Asian Paints", "--slug", "ASIANPAINT", "--annual", "--per-type", "4"] });
    expect(events.at(-1)).toEqual({ kind: "done", ok: true, summary: "Deterministic analysis completed for Asian Paints." });
  });
});
