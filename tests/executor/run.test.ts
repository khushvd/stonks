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
      id: "scrape:main",
      label: "Scrape Asian Paints",
      cmd: "pnpm",
      args: ["scrape", "--name", "Asian Paints", "--slug", "ASIANPAINT", "--annual", "--per-type", "4"],
    });
    expect(commands).toContainEqual({
      id: "scrape:peer:BERGEPAINT",
      label: "Scrape peer Berger Paints",
      cmd: "pnpm",
      args: ["scrape", "--name", "Berger Paints", "--slug", "BERGEPAINT", "--annual", "--per-type", "4"],
    });
  });

  it("assigns stable command ids for every deterministic step", () => {
    const ids = buildExecutionCommands(plan, "compare margins").map((c) => c.id);
    expect(ids).toEqual([
      "scrape:main",
      "scrape:peer:BERGEPAINT",
      "scrape:peer:KANSAINER",
      "scrape:peer:INDIGOPNTS",
      "ingest:main",
      "ingest:peer:BERGEPAINT",
      "ingest:peer:KANSAINER",
      "ingest:peer:INDIGOPNTS",
      "synthesize:main",
      "commentary-trends:main",
      "peer-kpis",
      "verify:ASIANPAINT",
      "verify:BERGEPAINT",
      "verify:KANSAINER",
      "verify:INDIGOPNTS",
      "db:summary",
    ]);
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
      "Extract management commentary trends",
      "Extract peer sector KPI pack",
      "Verify staged metrics for Asian Paints",
      "Verify staged metrics for Berger Paints",
      "Verify staged metrics for Kansai Nerolac",
      "Verify staged metrics for Indigo Paints",
      "Summarize database",
    ]);
  });

  it("rejects duplicate deterministic step ids", () => {
    const duplicatePeerPlan: AnalystPlan = {
      ...plan,
      peers: [
        plan.peers[0],
        plan.peers[0],
        { name: "Asian Paints", slug: "ASIANPAINT", reason: "duplicate main company" },
      ],
    };

    expect(() => buildExecutionCommands(duplicatePeerPlan, "compare margins")).toThrow(
      "duplicate executor step id: scrape:peer:BERGEPAINT",
    );
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

    expect(calls).toHaveLength(16);
    expect(calls[0]).toEqual({ cmd: "pnpm", args: ["scrape", "--name", "Asian Paints", "--slug", "ASIANPAINT", "--annual", "--per-type", "4"] });
    expect(events.at(-1)).toEqual({ kind: "done", ok: true, summary: "Deterministic analysis completed for Asian Paints." });
  });

  it("resumes from a requested step id", async () => {
    const calls: Array<{ cmd: string; args: string[] }> = [];
    const spawn: Spawner = (cmd, args) => {
      calls.push({ cmd, args });
      return {
        stdout: (async function* () {})(),
        exitCode: Promise.resolve(0),
        stderr: Promise.resolve(""),
      };
    };

    const events = await collect(runExecution(plan, "compare margins", spawn, undefined, { startAtStepId: "peer-kpis" }));

    expect(calls[0]).toEqual({
      cmd: "pnpm",
      args: ["peer-kpis", "Asian Paints", "--ask", "compare margins", "--companies", "Asian Paints,Berger Paints,Kansai Nerolac,Indigo Paints"],
    });
    expect(events[0]).toEqual({ kind: "step", id: "peer-kpis", label: "Extract peer sector KPI pack" });
    expect(events[1]).toEqual({ kind: "step-complete", id: "peer-kpis", label: "Extract peer sector KPI pack" });
    expect(events.at(-1)).toEqual({ kind: "done", ok: true, summary: "Deterministic analysis completed for Asian Paints." });
  });

  it("emits the failed resumed step id in error events", async () => {
    const spawn: Spawner = () => ({
      stdout: (async function* () {})(),
      exitCode: Promise.resolve(1),
      stderr: Promise.resolve("NotebookLM auth expired"),
    });

    const events = await collect(runExecution(plan, "compare margins", spawn, undefined, { startAtStepId: "ingest:main" }));

    expect(events[0]).toEqual({ kind: "step", id: "ingest:main", label: "Ingest Asian Paints into NotebookLM" });
    expect(events[1]).toEqual({
      kind: "error",
      stepId: "ingest:main",
      message: "Ingest Asian Paints into NotebookLM failed with code 1: NotebookLM auth expired",
    });
  });

  it("rejects blank and unknown resume step ids without spawning commands", async () => {
    const calls: Array<{ cmd: string; args: string[] }> = [];
    const spawn: Spawner = (cmd, args) => {
      calls.push({ cmd, args });
      return {
        stdout: (async function* () {})(),
        exitCode: Promise.resolve(0),
        stderr: Promise.resolve(""),
      };
    };

    const blankEvents = await collect(runExecution(plan, "compare margins", spawn, undefined, { startAtStepId: "" }));
    const unknownEvents = await collect(
      runExecution(plan, "compare margins", spawn, undefined, { startAtStepId: "verify:UNKNOWN" }),
    );

    expect(calls).toEqual([]);
    expect(blankEvents).toEqual([{ kind: "error", stepId: "", message: "Unknown resume step: " }]);
    expect(unknownEvents).toEqual([
      { kind: "error", stepId: "verify:UNKNOWN", message: "Unknown resume step: verify:UNKNOWN" },
    ]);
  });
});
