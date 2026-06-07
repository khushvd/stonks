import { describe, expect, it } from "vitest";
import { openDb } from "../../src/db/db.js";
import {
  createAnalysisRun,
  getAnalysisRun,
  listAnalysisRuns,
  markRunCompleted,
  markRunCancelled,
  markRunFailed,
  markRunFailedWithoutStep,
  recordStepCompleted,
  recordStepRunning,
  replaceRunSteps,
} from "../../src/db/analysis-runs.js";
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

describe("analysis run persistence", () => {
  it("creates a run and returns it with parsed plan JSON", () => {
    const db = openDb(":memory:");
    const id = createAnalysisRun(db, { companyName: "Asian Paints", ask: "compare margins", plan });

    const run = getAnalysisRun(db, id);

    expect(run).toMatchObject({
      id,
      companyName: "Asian Paints",
      ask: "compare margins",
      status: "planned",
      failedStepId: null,
      errorMessage: null,
    });
    expect(run?.plan.company.slug).toBe("ASIANPAINT");
  });

  it("replaces planned steps and records running/completed/failed lifecycle", () => {
    const db = openDb(":memory:");
    const id = createAnalysisRun(db, { companyName: "Asian Paints", ask: "compare margins", plan });
    replaceRunSteps(db, id, [
      { stepId: "scrape:main", label: "Scrape Asian Paints" },
      { stepId: "ingest:main", label: "Ingest Asian Paints into NotebookLM" },
    ]);

    recordStepRunning(db, id, "scrape:main");
    recordStepCompleted(db, id, "scrape:main");
    markRunFailed(db, id, "ingest:main", "NotebookLM auth expired");

    const run = getAnalysisRun(db, id)!;
    expect(run.status).toBe("failed");
    expect(run.failedStepId).toBe("ingest:main");
    expect(run.errorMessage).toBe("NotebookLM auth expired");
    expect(run.steps.map((s) => [s.stepId, s.status])).toEqual([
      ["scrape:main", "completed"],
      ["ingest:main", "failed"],
    ]);
  });

  it("lists recent runs newest first with peer names for the history rail", () => {
    const db = openDb(":memory:");
    const first = createAnalysisRun(db, { companyName: "Asian Paints", ask: "compare margins", plan });
    const second = createAnalysisRun(db, {
      companyName: "SAMHI Hotels",
      ask: "explain RevPAR",
      plan: { ...plan, company: { name: "SAMHI Hotels", slug: "SAMHI" } },
    });
    replaceRunSteps(db, second, [{ stepId: "peer-kpis", label: "Extract peer sector KPI pack" }]);
    markRunCompleted(db, first);
    markRunFailed(db, second, "peer-kpis", "No NotebookLM answer");

    const rows = listAnalysisRuns(db, 10);

    expect(rows.map((r) => r.id)).toEqual([second, first]);
    expect(rows[0]).toMatchObject({
      companyName: "SAMHI Hotels",
      status: "failed",
      failedStepId: "peer-kpis",
      peers: ["Berger Paints", "Kansai Nerolac", "Indigo Paints"],
    });
  });

  it("rejects unknown step IDs without mutating the parent run", () => {
    const db = openDb(":memory:");
    const id = createAnalysisRun(db, { companyName: "Asian Paints", ask: "compare margins", plan });
    replaceRunSteps(db, id, [{ stepId: "scrape:main", label: "Scrape Asian Paints" }]);

    expect(() => recordStepRunning(db, id, "peer-kpis")).toThrow("unknown analysis run step: peer-kpis");
    expect(() => recordStepCompleted(db, id, "peer-kpis")).toThrow("unknown analysis run step: peer-kpis");
    expect(() => markRunFailed(db, id, "peer-kpis", "No NotebookLM answer")).toThrow(
      "unknown analysis run step: peer-kpis",
    );

    const run = getAnalysisRun(db, id)!;
    expect(run).toMatchObject({
      status: "planned",
      failedStepId: null,
      errorMessage: null,
    });
    expect(run.steps.map((s) => [s.stepId, s.status])).toEqual([["scrape:main", "pending"]]);
  });

  it("marks a run failed without a failed step for setup-level errors", () => {
    const db = openDb(":memory:");
    const id = createAnalysisRun(db, { companyName: "Asian Paints", ask: "compare margins", plan });
    replaceRunSteps(db, id, [{ stepId: "scrape:main", label: "Scrape Asian Paints" }]);

    markRunFailedWithoutStep(db, id, "duplicate executor step id: verify:ASIANPAINT");

    const run = getAnalysisRun(db, id)!;
    expect(run).toMatchObject({
      status: "failed",
      failedStepId: null,
      errorMessage: "duplicate executor step id: verify:ASIANPAINT",
    });
    expect(run.steps.map((s) => [s.stepId, s.status])).toEqual([["scrape:main", "pending"]]);
  });

  it("marks a run cancelled without changing step status", () => {
    const db = openDb(":memory:");
    const id = createAnalysisRun(db, { companyName: "Asian Paints", ask: "compare margins", plan });
    replaceRunSteps(db, id, [{ stepId: "scrape:main", label: "Scrape Asian Paints" }]);
    recordStepRunning(db, id, "scrape:main");

    markRunCancelled(db, id, "client disconnected");

    const run = getAnalysisRun(db, id)!;
    expect(run).toMatchObject({
      status: "cancelled",
      failedStepId: null,
      errorMessage: "client disconnected",
    });
    expect(run.steps.map((s) => [s.stepId, s.status])).toEqual([["scrape:main", "running"]]);
  });
});
