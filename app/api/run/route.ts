import { openDb } from "../../../src/db/db.js";
import {
  createAnalysisRun,
  getAnalysisRun,
  markRunCompleted,
  markRunFailed,
  recordStepCompleted,
  recordStepRunning,
  replaceRunSteps,
} from "../../../src/db/analysis-runs.js";
import { buildExecutionCommands, runExecution } from "../../../src/executor/run.js";
import { parsePlannerJson } from "../../../src/planner/plan.js";
import type { AgentEvent } from "../../../src/coordinator/types.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Encode one AgentEvent as an SSE "data:" frame.
function sse(obj: unknown): string {
  return `data: ${JSON.stringify(obj)}\n\n`;
}

function jsonError(error: string, status: number): Response {
  return new Response(JSON.stringify({ error }), { status });
}

export async function POST(req: Request) {
  let body: { plan?: unknown; ask?: string; runId?: number; resume?: boolean };
  try {
    body = await req.json();
  } catch {
    return jsonError("invalid JSON body", 400);
  }

  let ask = (body.ask ?? "").trim();
  let plan;
  let runId: number;
  let startAtStepId: string | undefined;
  const db = openDb();

  try {
    if (body.resume) {
      const resumeRunId = body.runId;
      if (typeof resumeRunId !== "number" || !Number.isInteger(resumeRunId)) {
        db.close();
        return jsonError("missing runId for resume", 400);
      }
      const existing = getAnalysisRun(db, resumeRunId);
      if (!existing) {
        db.close();
        return jsonError(`unknown run: ${resumeRunId}`, 404);
      }
      if (existing.status !== "failed" || !existing.failedStepId) {
        db.close();
        return jsonError("only failed runs can be resumed", 400);
      }
      plan = existing.plan;
      ask = existing.ask;
      runId = existing.id;
      startAtStepId = existing.failedStepId;
    } else {
      if (!body.plan) {
        db.close();
        return jsonError("missing confirmed plan", 400);
      }
      plan = parsePlannerJson(JSON.stringify(body.plan));
      runId = createAnalysisRun(db, { companyName: plan.company.name, ask, plan });
      replaceRunSteps(
        db,
        runId,
        buildExecutionCommands(plan, ask).map(({ id, label }) => ({ stepId: id, label })),
      );
    }
  } catch (e) {
    db.close();
    return jsonError(`invalid confirmed plan: ${(e as Error).message}`, 400);
  }

  const encoder = new TextEncoder();
  // Abort the deterministic child process if the browser disconnects mid-stream.
  const ac = new AbortController();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        controller.enqueue(encoder.encode(sse({ kind: "run", runId, status: "running" })));
        for await (const ev of runExecution(plan, ask, undefined, ac.signal, startAtStepId ? { startAtStepId } : {})) {
          if (ev.kind === "step" && ev.id) {
            recordStepRunning(db, runId, ev.id);
          } else if (ev.kind === "step-complete") {
            recordStepCompleted(db, runId, ev.id);
          } else if (ev.kind === "error") {
            markRunFailed(db, runId, ev.stepId ?? startAtStepId ?? "unknown", ev.message);
            controller.enqueue(encoder.encode(sse({ kind: "run", runId, status: "failed" } satisfies AgentEvent)));
          } else if (ev.kind === "done") {
            markRunCompleted(db, runId);
            controller.enqueue(encoder.encode(sse({ kind: "run", runId, status: "completed" } satisfies AgentEvent)));
          }
          controller.enqueue(encoder.encode(sse(ev)));
        }
      } catch (e) {
        const message = (e as Error).message;
        markRunFailed(db, runId, startAtStepId ?? "unknown", message);
        controller.enqueue(encoder.encode(sse({ kind: "run", runId, status: "failed" } satisfies AgentEvent)));
        controller.enqueue(encoder.encode(sse({ kind: "error", message })));
      } finally {
        db.close();
        controller.close();
      }
    },
    cancel() {
      ac.abort();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
