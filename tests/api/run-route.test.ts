import { beforeEach, describe, expect, it, vi } from "vitest";
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

let emitted: AgentEvent[] = [
  { kind: "step", id: "scrape:main", label: "Scrape Asian Paints" },
  { kind: "done", ok: true, summary: "done" },
];

const mocks = vi.hoisted(() => {
  const db = { close: vi.fn() };
  return {
    db,
    openDb: vi.fn(() => db),
    createAnalysisRun: vi.fn(() => 42),
    getAnalysisRun: vi.fn(),
    markRunCompleted: vi.fn(),
    markRunFailed: vi.fn(),
    recordStepCompleted: vi.fn(),
    recordStepRunning: vi.fn(),
    replaceRunSteps: vi.fn(),
    buildExecutionCommands: vi.fn(() => [
      { id: "scrape:main", label: "Scrape Asian Paints", cmd: "pnpm", args: ["scrape"] },
      { id: "peer-kpis", label: "Extract peer sector KPI pack", cmd: "pnpm", args: ["peer-kpis"] },
    ]),
    runExecution: vi.fn(async function* () {
      for (const event of emitted) yield event;
    }),
  };
});

vi.mock("../../src/db/db.js", () => ({
  openDb: mocks.openDb,
}));

vi.mock("../../src/db/analysis-runs.js", () => ({
  createAnalysisRun: mocks.createAnalysisRun,
  getAnalysisRun: mocks.getAnalysisRun,
  markRunCompleted: mocks.markRunCompleted,
  markRunFailed: mocks.markRunFailed,
  recordStepCompleted: mocks.recordStepCompleted,
  recordStepRunning: mocks.recordStepRunning,
  replaceRunSteps: mocks.replaceRunSteps,
}));

vi.mock("../../src/executor/run.js", () => ({
  buildExecutionCommands: mocks.buildExecutionCommands,
  runExecution: mocks.runExecution,
}));

const { POST } = await import("../../app/api/run/route.js");

async function readFrames(res: Response): Promise<AgentEvent[]> {
  const text = await res.text();
  return text.trim().split("\n\n").map((frame) => JSON.parse(frame.replace(/^data: /, "")) as AgentEvent);
}

describe("/api/run", () => {
  beforeEach(() => {
    emitted = [
      { kind: "step", id: "scrape:main", label: "Scrape Asian Paints" },
      { kind: "done", ok: true, summary: "done" },
    ];
    vi.clearAllMocks();
    mocks.openDb.mockReturnValue(mocks.db);
    mocks.createAnalysisRun.mockReturnValue(42);
    mocks.getAnalysisRun.mockReset();
    mocks.buildExecutionCommands.mockReturnValue([
      { id: "scrape:main", label: "Scrape Asian Paints", cmd: "pnpm", args: ["scrape"] },
      { id: "peer-kpis", label: "Extract peer sector KPI pack", cmd: "pnpm", args: ["peer-kpis"] },
    ]);
  });

  it("streams events from the deterministic executor using the confirmed plan", async () => {
    const res = await POST(new Request("http://localhost/api/run", {
      method: "POST",
      body: JSON.stringify({ plan, ask: "compare margins" }),
    }));

    expect(res.status).toBe(200);
    expect(await readFrames(res)).toEqual([
      { kind: "run", runId: 42, status: "running" },
      emitted[0],
      { kind: "run", runId: 42, status: "completed" },
      emitted[1],
    ]);
    expect(mocks.runExecution).toHaveBeenCalledWith(plan, "compare margins", undefined, expect.any(AbortSignal), {});
  });

  it("creates a persisted run, initializes steps, and emits run metadata first", async () => {
    const res = await POST(new Request("http://localhost/api/run", {
      method: "POST",
      body: JSON.stringify({ plan, ask: " compare margins " }),
    }));

    expect(res.status).toBe(200);
    const frames = await readFrames(res);
    expect(frames[0]).toEqual({ kind: "run", runId: 42, status: "running" });
    expect(mocks.createAnalysisRun).toHaveBeenCalledWith(mocks.db, {
      companyName: "Asian Paints",
      ask: "compare margins",
      plan,
    });
    expect(mocks.buildExecutionCommands).toHaveBeenCalledWith(plan, "compare margins");
    expect(mocks.replaceRunSteps).toHaveBeenCalledWith(mocks.db, 42, [
      { stepId: "scrape:main", label: "Scrape Asian Paints" },
      { stepId: "peer-kpis", label: "Extract peer sector KPI pack" },
    ]);
    expect(mocks.recordStepRunning).toHaveBeenCalledWith(mocks.db, 42, "scrape:main");
    expect(mocks.markRunCompleted).toHaveBeenCalledWith(mocks.db, 42);
    expect(mocks.db.close).toHaveBeenCalledOnce();
  });

  it("resumes a failed persisted run from its failed step", async () => {
    mocks.getAnalysisRun.mockReturnValue({
      id: 7,
      companyName: "Asian Paints",
      ask: "compare margins",
      plan,
      status: "failed",
      failedStepId: "peer-kpis",
      errorMessage: "previous failure",
      createdAt: "2026-06-07T00:00:00.000Z",
      updatedAt: "2026-06-07T00:00:00.000Z",
      completedAt: null,
      steps: [],
    });

    const res = await POST(new Request("http://localhost/api/run", {
      method: "POST",
      body: JSON.stringify({ runId: 7, resume: true }),
    }));

    expect(res.status).toBe(200);
    expect(await readFrames(res)).toContainEqual({ kind: "run", runId: 7, status: "running" });
    expect(mocks.getAnalysisRun).toHaveBeenCalledWith(mocks.db, 7);
    expect(mocks.runExecution).toHaveBeenCalledWith(plan, "compare margins", undefined, expect.any(AbortSignal), {
      startAtStepId: "peer-kpis",
    });
    expect(mocks.createAnalysisRun).not.toHaveBeenCalled();
    expect(mocks.replaceRunSteps).not.toHaveBeenCalled();
  });

  it("rejects requests without a confirmed plan", async () => {
    const res = await POST(new Request("http://localhost/api/run", {
      method: "POST",
      body: JSON.stringify({ company: "Asian Paints", ask: "compare margins" }),
    }));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "missing confirmed plan" });
  });

  it("rejects resume requests without a run id", async () => {
    const res = await POST(new Request("http://localhost/api/run", {
      method: "POST",
      body: JSON.stringify({ resume: true }),
    }));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "missing runId for resume" });
  });
});
