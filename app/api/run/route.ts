import { runCoordinator } from "../../../src/coordinator/run.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Encode one AgentEvent as an SSE "data:" frame.
function sse(obj: unknown): string {
  return `data: ${JSON.stringify(obj)}\n\n`;
}

export async function POST(req: Request) {
  let body: { company?: string; ask?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "invalid JSON body" }), { status: 400 });
  }
  const company = (body.company ?? "").trim();
  const ask = (body.ask ?? "").trim();
  if (!company) return new Response(JSON.stringify({ error: "missing company" }), { status: 400 });

  const encoder = new TextEncoder();
  // Abort the coordinator (kill the `claude` child) if the browser disconnects mid-stream,
  // so a headless run never keeps billing after nobody is listening.
  const ac = new AbortController();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const ev of runCoordinator(company, ask, undefined, ac.signal)) {
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
