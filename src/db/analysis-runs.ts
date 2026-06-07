import type Database from "better-sqlite3";
import type { AnalystPlan } from "../planner/plan.js";

export type AnalysisRunStatus = "planned" | "running" | "failed" | "completed" | "cancelled";
export type AnalysisStepStatus = "pending" | "running" | "completed" | "failed" | "skipped";

export interface AnalysisRunStepInput {
  stepId: string;
  label: string;
}

export interface AnalysisRunStep extends AnalysisRunStepInput {
  status: AnalysisStepStatus;
  startedAt: string | null;
  completedAt: string | null;
  errorMessage: string | null;
}

export interface AnalysisRun {
  id: number;
  companyName: string;
  ask: string;
  plan: AnalystPlan;
  status: AnalysisRunStatus;
  failedStepId: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  steps: AnalysisRunStep[];
}

export interface AnalysisRunSummary {
  id: number;
  companyName: string;
  ask: string;
  status: AnalysisRunStatus;
  failedStepId: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  peers: string[];
}

interface RunRow {
  id: number;
  company_name: string;
  ask: string;
  plan_json: string;
  status: AnalysisRunStatus;
  failed_step_id: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

interface StepRow {
  step_id: string;
  label: string;
  status: AnalysisStepStatus;
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
}

function parsePlan(json: string): AnalystPlan {
  return JSON.parse(json) as AnalystPlan;
}

function toStep(row: StepRow): AnalysisRunStep {
  return {
    stepId: row.step_id,
    label: row.label,
    status: row.status,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    errorMessage: row.error_message,
  };
}

function toRun(row: RunRow, steps: AnalysisRunStep[]): AnalysisRun {
  return {
    id: row.id,
    companyName: row.company_name,
    ask: row.ask,
    plan: parsePlan(row.plan_json),
    status: row.status,
    failedStepId: row.failed_step_id,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
    steps,
  };
}

function toSummary(row: RunRow): AnalysisRunSummary {
  const plan = parsePlan(row.plan_json);
  return {
    id: row.id,
    companyName: row.company_name,
    ask: row.ask,
    status: row.status,
    failedStepId: row.failed_step_id,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
    peers: plan.peers.map((peer) => peer.name),
  };
}

function assertStepUpdated(info: Database.RunResult, stepId: string): void {
  if (info.changes === 0) {
    throw new Error(`unknown analysis run step: ${stepId}`);
  }
}

export function createAnalysisRun(
  db: Database.Database,
  input: { companyName: string; ask: string; plan: AnalystPlan },
): number {
  const info = db
    .prepare("INSERT INTO analysis_runs (company_name, ask, plan_json, status) VALUES (?, ?, ?, 'planned')")
    .run(input.companyName, input.ask, JSON.stringify(input.plan));
  return Number(info.lastInsertRowid);
}

export function replaceRunSteps(db: Database.Database, runId: number, steps: AnalysisRunStepInput[]): void {
  db.transaction(() => {
    db.prepare("DELETE FROM analysis_run_steps WHERE run_id = ?").run(runId);
    const insert = db.prepare(`
      INSERT INTO analysis_run_steps (run_id, step_id, label, status)
      VALUES (@runId, @stepId, @label, 'pending')
    `);
    for (const step of steps) {
      insert.run({ runId, stepId: step.stepId, label: step.label });
    }
    db.prepare(`
      UPDATE analysis_runs
      SET status = 'planned',
          failed_step_id = NULL,
          error_message = NULL,
          completed_at = NULL,
          updated_at = datetime('now')
      WHERE id = ?
    `).run(runId);
  })();
}

export function recordStepRunning(db: Database.Database, runId: number, stepId: string): void {
  db.transaction(() => {
    const stepInfo = db.prepare(`
      UPDATE analysis_run_steps
      SET status = 'running',
          started_at = datetime('now'),
          completed_at = NULL,
          error_message = NULL
      WHERE run_id = ? AND step_id = ?
    `).run(runId, stepId);
    assertStepUpdated(stepInfo, stepId);
    db.prepare(`
      UPDATE analysis_runs
      SET status = 'running',
          failed_step_id = NULL,
          error_message = NULL,
          completed_at = NULL,
          updated_at = datetime('now')
      WHERE id = ?
    `).run(runId);
  })();
}

export function recordStepCompleted(db: Database.Database, runId: number, stepId: string): void {
  db.transaction(() => {
    const stepInfo = db.prepare(`
      UPDATE analysis_run_steps
      SET status = 'completed',
          completed_at = datetime('now'),
          error_message = NULL
      WHERE run_id = ? AND step_id = ?
    `).run(runId, stepId);
    assertStepUpdated(stepInfo, stepId);
    db.prepare("UPDATE analysis_runs SET updated_at = datetime('now') WHERE id = ?").run(runId);
  })();
}

export function markRunFailed(db: Database.Database, runId: number, stepId: string, message: string): void {
  db.transaction(() => {
    const stepInfo = db.prepare(`
      UPDATE analysis_run_steps
      SET status = 'failed',
          completed_at = datetime('now'),
          error_message = ?
      WHERE run_id = ? AND step_id = ?
    `).run(message, runId, stepId);
    assertStepUpdated(stepInfo, stepId);
    db.prepare(`
      UPDATE analysis_runs
      SET status = 'failed',
          failed_step_id = ?,
          error_message = ?,
          updated_at = datetime('now')
      WHERE id = ?
    `).run(stepId, message, runId);
  })();
}

export function markRunFailedWithoutStep(db: Database.Database, runId: number, message: string): void {
  db.prepare(`
    UPDATE analysis_runs
    SET status = 'failed',
        failed_step_id = NULL,
        error_message = ?,
        updated_at = datetime('now')
    WHERE id = ?
  `).run(message, runId);
}

export function markRunCancelled(db: Database.Database, runId: number, message: string): void {
  db.transaction(() => {
    const info = db.prepare(`
      UPDATE analysis_runs
      SET status = 'cancelled',
          failed_step_id = NULL,
          error_message = ?,
          updated_at = datetime('now')
      WHERE id = ? AND status IN ('planned', 'running')
    `).run(message, runId);
    if (info.changes === 0) return;
    db.prepare(`
      UPDATE analysis_run_steps
      SET status = 'skipped',
          completed_at = datetime('now'),
          error_message = ?
      WHERE run_id = ? AND status = 'running'
    `).run(message, runId);
  })();
}

export function markRunCompleted(db: Database.Database, runId: number): void {
  db.prepare(`
    UPDATE analysis_runs
    SET status = 'completed',
        failed_step_id = NULL,
        error_message = NULL,
        completed_at = datetime('now'),
        updated_at = datetime('now')
    WHERE id = ?
  `).run(runId);
}

export function getAnalysisRun(db: Database.Database, runId: number): AnalysisRun | null {
  const row = db.prepare("SELECT * FROM analysis_runs WHERE id = ?").get(runId) as RunRow | undefined;
  if (!row) return null;

  const stepRows = db
    .prepare(`
      SELECT step_id, label, status, started_at, completed_at, error_message
      FROM analysis_run_steps
      WHERE run_id = ?
      ORDER BY rowid ASC
    `)
    .all(runId) as StepRow[];

  return toRun(row, stepRows.map(toStep));
}

export function listAnalysisRuns(db: Database.Database, limit = 20): AnalysisRunSummary[] {
  const rows = db
    .prepare(`
      SELECT *
      FROM analysis_runs
      ORDER BY id DESC
      LIMIT ?
    `)
    .all(limit) as RunRow[];
  return rows.map(toSummary);
}
