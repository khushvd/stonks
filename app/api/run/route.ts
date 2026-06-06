import { runExecution } from "../../../src/executor/run.js";
import { parsePlannerJson } from "../../../src/planner/plan.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Encode one AgentEvent as an SSE "data:" frame.
function sse(obj: unknown): string {
  return `data: ${JSON.stringify(obj)}\n\n`;
}

export async function POST(req: Request) {
  let body: { plan?: unknown; ask?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "invalid JSON body" }), { status: 400 });
  }
  const ask = (body.ask ?? "").trim();
  if (!body.plan) return new Response(JSON.stringify({ error: "missing confirmed plan" }), { status: 400 });

  let plan;
  try {
    plan = parsePlannerJson(JSON.stringify(body.plan));
  } catch (e) {
    return new Response(JSON.stringify({ error: `invalid confirmed plan: ${(e as Error).message}` }), { status: 400 });
  }

  const encoder = new TextEncoder();
  // Abort the deterministic child process if the browser disconnects mid-stream.
  const ac = new AbortController();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const ev of runExecution(plan, ask, undefined, ac.signal)) {
          controller.enqueue(encoder.encode(sse(ev)));
        }
      } catch (e) {
        controller.enqueue(encoder.encode(sse({ kind: "error", message: (e as Error).message })));
      } finally {
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
